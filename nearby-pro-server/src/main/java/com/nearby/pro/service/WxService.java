package com.nearby.pro.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.nearby.pro.common.ApiException;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.config.WxProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.net.http.HttpClient;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * 微信开放接口：code2session 登录、access_token 缓存、msgSecCheck 内容安全。
 * 全部走真实微信接口：本地联调同样需要可用的小程序 appid/secret。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WxService {

    private static final String ACCESS_TOKEN_KEY = "wx:access_token";

    private final WxProperties wx;
    private final StringRedisTemplate redis;
    /**
     * 外层必须套 BufferingClientHttpRequestFactory，否则微信 POST 接口一律返回
     * 412 Precondition Failed（响应体为空，只有 connection/content-length 两个头）。
     * 原因：Spring 6.1（Boot 3.x）起 RestClient 对支持流式的 request factory 会直接
     * 把 body 以流方式交给 JDK HttpClient（ofInputStream），请求走 chunked、
     * 不带 Content-Length，而微信网关强制要求 Content-Length，在业务层之前就拒掉。
     * 套上缓冲层后 RestClient 改走 executeInternal(headers, byte[])，底层用
     * ofByteArray 发送，Content-Length 正常。
     * GET（code2session/token）无请求体，不受影响，这也是一直只有发布/订阅消息报错的原因。
     * 另显式降 HTTP/1.1 并带 User-Agent，规避网关风控。
     */
    private final RestClient rest = RestClient.builder()
            .requestFactory(new BufferingClientHttpRequestFactory(
                    new JdkClientHttpRequestFactory(
                            HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).build())))
            .defaultHeader("User-Agent", "nearby-pro-server")
            .build();

    /** Redis 不可用时的内存兜底缓存 */
    private volatile String memToken = "";
    private volatile long memTokenExpireAt = 0;

    /** wx.login 的 code 换 openid */
    public String code2Session(String code) {
        String body = rest.get()
                .uri(uriBuilder -> uriBuilder.scheme("https").host("api.weixin.qq.com")
                        .path("/sns/jscode2session")
                        .queryParam("appid", wx.getAppId())
                        .queryParam("secret", wx.getSecret())
                        .queryParam("js_code", code)
                        .queryParam("grant_type", "authorization_code")
                        .build())
                .retrieve()
                .body(String.class);
        JsonNode node = parse(body);
        if (node.hasNonNull("openid")) {
            return node.get("openid").asText();
        }
        throw new ApiException("微信登录失败(" + node.path("errcode").asInt(-1) + ")，请重试");
    }

    /** 内容安全检测；开关关闭时直接放行 */
    public void checkContent(String openid, String content) {
        if (!wx.isSecurityCheck()) {
            return;
        }
        String body;
        try {
            body = rest.post()
                    .uri("https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + getAccessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("version", 2, "openid", openid, "scene", 2, "content", content))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientResponseException e) {
            // 对照请求：同一 JVM、同一凭证、固定短内容再发一次。
            // 对照成功 = 原请求的 content 内容触发 WAF；对照也失败 = JVM 进程环境差异（代理等）
            String probe;
            try {
                probe = rest.post()
                        .uri("https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + getAccessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .body(Map.of("version", 2, "openid", openid, "scene", 2, "content", "test"))
                        .retrieve()
                        .body(String.class);
            } catch (Exception e2) {
                probe = "同样失败: " + e2.getMessage();
            }
            log.warn("msgSecCheck 调用失败 openid={} status={} 原响应体={} 响应头={} | 对照请求: {}",
                    openid, e.getStatusCode(), e.getResponseBodyAsString(), e.getResponseHeaders(), probe);
            throw new ApiException("内容检测服务暂不可用，请稍后重试");
        } catch (Exception e) {
            log.warn("msgSecCheck 调用失败 openid={}：{}", openid, e.getMessage());
            throw new ApiException("内容检测服务暂不可用，请稍后重试");
        }
        JsonNode node = parse(body);
        int errcode = node.path("errcode").asInt(-1);
        String suggest = node.path("result").path("suggest").asText("");
        // 明确的内容违规（87014 或 suggest 非 pass）才拦用户；系统级错误（token 失效、
        // openid 无效等）提示稍后重试，避免误拦
        if (errcode == 87014 || (errcode == 0 && !"pass".equals(suggest))) {
            throw new ApiException("内容含违规信息，请修改后重试");
        }
        if (errcode != 0) {
            log.warn("msgSecCheck 系统性错误 openid={} errcode={} errmsg={}",
                    openid, errcode, node.path("errmsg").asText(""));
            throw new ApiException("内容检测服务暂不可用，请稍后重试");
        }
    }

    /**
     * 订阅消息：聊天离线提醒。仅对方不在线时调用（ImEventListener 回调），
     * 消耗接收方的一次性授权额度；未订阅/额度用完(43101)属常态，静默记日志。
     * 未配置模板 id 时跳过。
     * 注意：data 字段 key 需与 mp 后台申请到的模板字段一致，模板不同时改这里的 key。
     */
    public void sendChatNotice(String toOpenid, String fromNickname, String page) {
        if (wx.getSubscribeTemplateId() == null || wx.getSubscribeTemplateId().isBlank()) {
            return;
        }
        if (toOpenid == null || toOpenid.isBlank()) {
            return;
        }
        String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
        Map<String, Object> data = Map.of(
                "thing1", Map.of("value", truncate(fromNickname, 20)),
                "thing2", Map.of("value", "给你发来一条新消息"),
                "time3", Map.of("value", time));
        Map<String, Object> payload = Map.of(
                "touser", toOpenid,
                "template_id", wx.getSubscribeTemplateId(),
                "page", page,
                "data", data);
        try {
            String body = rest.post()
                    .uri("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=" + getAccessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .body(String.class);
            int errcode = parse(body).path("errcode").asInt(0);
            if (errcode != 0) {
                log.info("订阅消息未送达 toOpenid={} errcode={}（43101=未订阅/额度用完，属常态）",
                        toOpenid, errcode);
            }
        } catch (Exception e) {
            log.warn("订阅消息发送异常 toOpenid={}：{}", toOpenid, e.getMessage());
        }
    }

    /** 订阅消息 thing 字段内容上限 20 字符，超长截断 */
    private String truncate(String s, int max) {
        if (s == null) {
            return "";
        }
        return s.length() <= max ? s : s.substring(0, max);
    }

    /** access_token：Redis 缓存 2 小时（提前 2 分钟刷新），Redis 不可用时退化为内存缓存 */
    private String getAccessToken() {
        try {
            String cached = redis.opsForValue().get(ACCESS_TOKEN_KEY);
            if (cached != null && !cached.isBlank()) {
                return cached;
            }
        } catch (Exception e) {
            log.warn("Redis 读取 access_token 失败，退化到内存缓存：{}", e.getMessage());
        }
        synchronized (this) {
            if (!memToken.isBlank() && System.currentTimeMillis() < memTokenExpireAt) {
                return memToken;
            }
            String body = rest.get()
                    .uri(uriBuilder -> uriBuilder.scheme("https").host("api.weixin.qq.com")
                            .path("/cgi-bin/token")
                            .queryParam("grant_type", "client_credential")
                            .queryParam("appid", wx.getAppId())
                            .queryParam("secret", wx.getSecret())
                            .build())
                    .retrieve()
                    .body(String.class);
            JsonNode node = parse(body);
            String token = node.path("access_token").asText("");
            if (token.isEmpty()) {
                throw new ApiException("获取微信凭证失败：" + node.path("errmsg").asText(""));
            }
            long ttlSeconds = Math.max(60, node.path("expires_in").asInt(7200) - 120);
            memToken = token;
            memTokenExpireAt = System.currentTimeMillis() + ttlSeconds * 1000L;
            try {
                redis.opsForValue().set(ACCESS_TOKEN_KEY, token, Duration.ofSeconds(ttlSeconds));
            } catch (Exception e) {
                log.warn("Redis 写入 access_token 失败：{}", e.getMessage());
            }
            return token;
        }
    }

    private JsonNode parse(String body) {
        try {
            return JsonUtil.MAPPER.readTree(body == null ? "{}" : body);
        } catch (Exception e) {
            throw new ApiException("微信接口返回异常，请重试");
        }
    }
}
