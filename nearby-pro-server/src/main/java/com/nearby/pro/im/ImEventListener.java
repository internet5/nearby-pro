package com.nearby.pro.im;

import com.nearby.pro.mapper.UserMapper;
import com.nearby.pro.service.AuthService;
import com.nearby.pro.service.ChatService;
import io.netty.channel.Channel;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.x52im.mobileimsdk.server.event.ServerEventListener;
import net.x52im.mobileimsdk.server.protocal.ErrorCode;
import net.x52im.mobileimsdk.server.protocal.Protocal;
import org.springframework.stereotype.Component;

/**
 * MobileIMSDK 服务端事件回调：登录验证接 JWT，C2C 消息全路径落库。
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

    private final AuthService authService;
    private final ChatService chatService;
    private final UserMapper userMapper;

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
        // 返回 true 告知框架已做离线处理，框架会向发送方回 ACK
        return true;
    }

    /** C2C 消息落库；任何异常只记日志不外抛（不能影响框架转发流程） */
    private void saveQuietly(Protocal p) {
        try {
            chatService.saveMessage(p.getFrom(), p.getTo(), p.getDataContent(), p.getTypeu(), p.getFp());
        } catch (Exception e) {
            log.error("IM 消息落库失败 from={} to={} fp={}", p.getFrom(), p.getTo(), p.getFp(), e);
        }
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
