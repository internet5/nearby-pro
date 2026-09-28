package com.nearby.pro.im;

import com.nearby.pro.entity.Listing;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.ChatMessageMapper;
import com.nearby.pro.mapper.ListingMapper;
import com.nearby.pro.mapper.UserMapper;
import com.nearby.pro.service.AuthService;
import com.nearby.pro.service.ChatService;
import com.nearby.pro.service.WxService;
import io.netty.channel.Channel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.x52im.mobileimsdk.server.event.ServerEventListener;
import net.x52im.mobileimsdk.server.protocal.ErrorCode;
import net.x52im.mobileimsdk.server.protocal.Protocal;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * MobileIMSDK 服务端事件回调：登录验证接 JWT，C2C 消息全路径落库，新会话首条咨询触发技能自动回复。
 * <p>
 * 注意：框架在实时转发成功时回调 {@link #onTransferMessage4C2C}、
 * 失败（对方离线）时回调 {@link #onTransferMessage_RealTimeSendFaild}，两者互斥，
 * 都走 {@link ChatService#saveMessage} + fp 唯一索引即可保证幂等。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImEventListener implements ServerEventListener {

    /** 自定义登录失败错误码（应用层错误码区间 >=1025），小程序端据此重新走微信登录 */
    public static final int LOGIN_VERIFY_FAILED = 1025;

    /** 自动回复防重闸：同一咨询者对同一技能 7 天内只自动回一次 */
    private static final Duration AUTO_REPLY_LOCK_TTL = Duration.ofDays(7);

    private final AuthService authService;
    private final ChatService chatService;
    private final ChatMessageMapper chatMessageMapper;
    private final UserMapper userMapper;
    private final ListingMapper listingMapper;
    private final WxService wxService;
    private final ImSendHelper imSendHelper;
    private final StringRedisTemplate redis;

    @Override
    public int onUserLoginVerify(String userId, String token, String extra, Channel session) {
        // token 为小程序端登录后拿到的 JWT；校验通过且与连接身份一致才放行
        Long verified = authService.verifyToken(token);
        if (verified == null || !String.valueOf(verified).equals(userId)) {
            log.warn("IM 登录验证失败：userId={}, token 校验结果={}", userId, verified);
            return LOGIN_VERIFY_FAILED;
        }
        if (userMapper.selectById(verified) == null) {
            log.warn("IM 登录验证失败：用户不存在 userId={}", userId);
            return LOGIN_VERIFY_FAILED;
        }
        return ErrorCode.COMMON_CODE_OK;
    }

    @Override
    public void onTransferMessage4C2C(Protocal p) {
        // 对方在线、实时转发成功后落库
        saveQuietly(p);
    }

    @Override
    public boolean onTransferMessage_RealTimeSendFaild(Protocal p) {
        // 对方离线或实时发送失败：落库做离线存储，接收方上线后经 /api/chat/messages 拉取
        saveQuietly(p);
        // 对方收不到实时推送，发订阅消息到微信「服务通知」提醒（消耗对方授权额度，未订阅静默失败）
        notifyOfflineQuietly(p);
        // 返回 true 告知框架已做离线处理，框架会向发送方回 ACK
        return true;
    }

    /** 离线订阅消息提醒；任何异常只记日志（不能影响框架转发流程） */
    private void notifyOfflineQuietly(Protocal p) {
        try {
            User fromUser = userMapper.selectById(Long.valueOf(p.getFrom()));
            User toUser = userMapper.selectById(Long.valueOf(p.getTo()));
            if (fromUser == null || toUser == null) {
                return;
            }
            // 点击提醒直达与对方的聊天页；query 参数与聊天页 onLoad 对齐；带技能上下文直达对应会话
            StringBuilder page = new StringBuilder("pages/chat/index?peerId=" + p.getFrom()
                    + "&nickname=" + URLEncoder.encode(
                            fromUser.getNickname() == null ? "" : fromUser.getNickname(),
                            StandardCharsets.UTF_8)
                    + "&avatarUrl=" + URLEncoder.encode(
                            fromUser.getAvatarUrl() == null ? "" : fromUser.getAvatarUrl(),
                            StandardCharsets.UTF_8));
            ChatService.Envelope env = ChatService.parseEnvelope(p.getDataContent());
            if (env != null && env.lid() > 0) {
                Listing listing = listingMapper.selectById(env.lid());
                if (listing != null) {
                    page.append("&listingId=").append(env.lid())
                            .append("&title=").append(URLEncoder.encode(
                                    listing.getTitle() == null ? "" : listing.getTitle(),
                                    StandardCharsets.UTF_8));
                }
            }
            wxService.sendChatNotice(toUser.getOpenid(), fromUser.getNickname(), page.toString());
        } catch (Exception e) {
            log.warn("离线订阅消息提醒失败 from={} to={}：{}", p.getFrom(), p.getTo(), e.getMessage());
        }
    }

    /** C2C 消息落库 + 新会话首条咨询触发自动回复；任何异常只记日志不外抛（不能影响框架转发流程） */
    private void saveQuietly(Protocal p) {
        try {
            ChatService.Envelope env = ChatService.parseEnvelope(p.getDataContent());
            long listingId = env == null ? 0 : env.lid();
            boolean auto = env != null && env.auto();
            // 内容取解信封后的纯文本；老客户端裸文本原样落库
            String content = env == null ? p.getDataContent() : env.content();
            // 自动回复要先于本条落库判断「会话首条」，否则 count 永远 > 0
            Listing autoReplyOf = prepareAutoReply(p, listingId, auto);
            chatService.saveMessage(Long.parseLong(p.getFrom()), Long.parseLong(p.getTo()),
                    content, p.getTypeu(), p.getFp(), listingId > 0 ? listingId : null, auto);
            if (autoReplyOf != null) {
                imSendHelper.sendAutoReply(autoReplyOf.getUserId(), Long.parseLong(p.getFrom()),
                        autoReplyOf.getId(), autoReplyOf.getAutoReply());
            }
        } catch (Exception e) {
            log.error("IM 消息落库失败 from={} to={} fp={}", p.getFrom(), p.getTo(), p.getFp(), e);
        }
    }

    /**
     * 判断本条消息是否要触发技能自动回复，命中则返回目标发布（含 auto_reply 文案）。
     * 触发条件：普通消息（非自动回复）+ 挂了有效技能 + 收件人是该技能发布人 + 该会话首条消息 + 7 天闸未占用。
     */
    private Listing prepareAutoReply(Protocal p, long listingId, boolean auto) {
        if (auto || listingId <= 0) {
            return null;
        }
        Listing listing = listingMapper.selectById(listingId);
        if (listing == null || listing.getAutoReply() == null || listing.getAutoReply().isBlank()) {
            return null;
        }
        long from = Long.parseLong(p.getFrom());
        long to = Long.parseLong(p.getTo());
        // 只有「咨询者 -> 发布人」方向触发；发布人自己的回复不再触发
        if (listing.getUserId() != to) {
            return null;
        }
        // 会话首条才回复（本条消息尚未落库，count=0 即首条）
        if (chatMessageMapper.countByConversation(from, to, listingId) > 0) {
            return null;
        }
        // Redis 抢闸防并发重复回复；Redis 不可用时退化为仅靠「会话首条」判断
        try {
            Boolean first = redis.opsForValue().setIfAbsent(
                    "autoreply:" + listingId + ":" + from, "1", AUTO_REPLY_LOCK_TTL);
            if (Boolean.FALSE.equals(first)) {
                return null;
            }
        } catch (Exception e) {
            log.warn("Redis 自动回复闸不可用，退化为仅会话首条判断：{}", e.getMessage());
        }
        return listing;
    }

    @Override
    public void onUserLoginSucess(String userId, String extra, Channel session) {
        log.info("IM 用户上线 userId={}", userId);
    }

    @Override
    public void onUserLogout(String userId, Channel session, int beKickoutCode) {
        log.info("IM 用户下线 userId={}, beKickoutCode={}", userId, beKickoutCode);
    }

    // ---- 以下回调本期不做拦截/处理，直接放行 ----

    @Override
    public boolean onTransferMessage4C2CBefore(Protocal p, Channel session) {
        return true;
    }

    @Override
    public boolean onTransferMessage4C2SBefore(Protocal p, Channel session) {
        return true;
    }

    @Override
    public boolean onTransferMessage4C2S(Protocal p, Channel session) {
        return true;
    }

    @Override
    public void onTransferMessage4C2C_AfterBridge(Protocal p) {
    }
}
