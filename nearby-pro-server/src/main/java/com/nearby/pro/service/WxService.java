package com.nearby.pro.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.nearby.pro.common.ApiException;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.config.WxProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.Map;

/**
 * 微信开放接口：code2session 登录、access_token 缓存、msgSecCheck 内容安全。
 * mock 模式（wx.mock=true）下不访问微信，便于没有真实小程序密钥时本地联调。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class WxService {

    private static final String ACCESS_TOKEN_KEY = "wx:access_token";

    private final WxProperties wx;
    private final StringRedisTemplate redis;
    private final RestClient rest = RestClient.create();

    /** Redis 不可用时的内存兜底缓存 */
    private volatile String memToken = "";
    private volatile long memTokenExpireAt = 0;

    /** wx.login 的 code 换 openid；mock 模式直接用 code 拼 openid */
    public String code2Session(String code) {
        if (wx.isMock()) {
            return "mock_" + code;
        }
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

    /** 内容安全检测；开关关闭或 mock 模式直接放行 */
    public void checkContent(String openid, String content) {
        if (!wx.isSecurityCheck() || wx.isMock()) {
            return;
        }
        String body = rest.post()
                .uri("https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + getAccessToken())
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("version", 2, "openid", openid, "scene", 2, "content", content))
                .retrieve()
                .body(String.class);
        JsonNode node = parse(body);
        boolean pass = node.path("errcode").asInt(-1) == 0
                && "pass".equals(node.path("result").path("suggest").asText());
        if (!pass) {
            throw new ApiException("内容含违规信息，请修改后重试");
        }
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
