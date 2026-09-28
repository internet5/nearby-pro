package com.nearby.pro.im;

import com.nearby.pro.service.ChatService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.x52im.mobileimsdk.server.network.MBObserver;
import net.x52im.mobileimsdk.server.protocal.Protocal;
import net.x52im.mobileimsdk.server.utils.LocalSendHelper;
import org.springframework.stereotype.Component;

/**
 * 服务端主动向用户发消息的封装（MobileIMSDK S2C）。
 * 目前只用于技能自动回复：以发布人身份把 auto_reply 内容发给首次咨询的人。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImSendHelper {

    private final ChatService chatService;

    /**
     * 发送技能自动回复给咨询者：实时帧（信封 a=1）+ 落库（is_auto=1）。
     * 任何失败只记日志不外抛——自动回复是锦上添花，不能影响主流程。
     */
    public void sendAutoReply(long ownerUserId, long toUserId, long listingId, String text) {
        try {
            String envelope = ChatService.buildEnvelope(listingId, text, true);
            Protocal p = new Protocal(2, envelope,
                    String.valueOf(ownerUserId), String.valueOf(toUserId),
                    true, Protocal.genFingerPrint(), 1);
            LocalSendHelper.sendData(p, (result, extra) -> {
                if (!Boolean.TRUE.equals(result)) {
                    log.warn("自动回复实时投递失败（已落库，客户端上线后拉取）listing={} to={}", listingId, toUserId);
                }
            });
            // 服务端主动发的消息不走 C2C 转发回调，需要手动落库
            chatService.saveMessage(ownerUserId, toUserId, text, 1, p.getFp(), listingId, true);
        } catch (Exception e) {
            log.warn("自动回复发送失败 listing={} owner={} to={}：{}", listingId, ownerUserId, toUserId, e.getMessage());
        }
    }
}
