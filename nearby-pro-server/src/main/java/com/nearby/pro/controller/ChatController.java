package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.common.UserContext;
import com.nearby.pro.dto.ChatHistoryResp;
import com.nearby.pro.dto.ChatReadReq;
import com.nearby.pro.dto.ChatSessionsResp;
import com.nearby.pro.dto.ChatUnreadResp;
import com.nearby.pro.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 私聊 REST 接口（全部需登录）：会话列表、历史分页、已读、未读数。
 * 实时收发走 MobileIMSDK WebSocket 长连接，这里只负责拉取类辅助操作。
 */
@RestController
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    /** 会话列表：每个会话的最新一条 + 未读数 */
    @GetMapping("/api/chat/sessions")
    public ApiResult<ChatSessionsResp> sessions() {
        return ApiResult.ok(ChatSessionsResp.builder()
                .list(chatService.sessions(UserContext.require()))
                .build());
    }

    /** 会话历史分页：cursor 为上一页最小消息 id，首页不传；副作用把对方发我的消息置为已拉取 */
    @GetMapping("/api/chat/messages")
    public ApiResult<ChatHistoryResp> messages(@RequestParam long peerId,
                                               @RequestParam(required = false) Long cursor,
                                               @RequestParam(defaultValue = "20") int limit) {
        return ApiResult.ok(chatService.history(UserContext.require(), peerId, cursor, limit));
    }

    /** 标记会话已读（进入/离开聊天页时上报） */
    @PostMapping("/api/chat/read")
    public ApiResult<Void> read(@Valid @RequestBody ChatReadReq req) {
        chatService.markRead(UserContext.require(), req.getPeerId());
        return ApiResult.ok();
    }

    /** 未读消息总数（「我的」页角标） */
    @GetMapping("/api/chat/unread")
    public ApiResult<ChatUnreadResp> unread() {
        return ApiResult.ok(new ChatUnreadResp(chatService.unreadTotal(UserContext.require())));
    }
}
