package com.nearby.pro.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.nearby.pro.dto.ChatHistoryResp;
import com.nearby.pro.dto.ChatMessageItem;
import com.nearby.pro.dto.ChatSessionItem;
import com.nearby.pro.entity.ChatMessage;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.ChatMessageMapper;
import com.nearby.pro.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 私聊消息业务：C2C 落库（IM 回调调用）、会话列表、历史分页、已读、未读数。
 * 离线消息不做 S2C 推送，由客户端上线后经 /api/chat/messages 拉取兜底。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    /** 消息状态：已存储（接收方尚未拉取） */
    private static final int STATUS_STORED = 1;
    /** 消息状态：接收方已拉取 */
    private static final int STATUS_FETCHED = 2;
    /** 消息状态：已读 */
    private static final int STATUS_READ = 3;

    private final ChatMessageMapper chatMessageMapper;
    private final UserMapper userMapper;

    /**
     * C2C 消息落库（供 ImEventListener 回调调用）。
     * fp 唯一索引冲突（QoS 重发/重复回调）按成功吞掉，保证幂等。
     */
    public void saveMessage(String from, String to, String content, int typeu, String fp) {
        ChatMessage m = new ChatMessage();
        m.setFromUserId(Long.valueOf(from));
        m.setToUserId(Long.valueOf(to));
        m.setContent(content == null ? "" : content);
        m.setTypeu(typeu);
        m.setFp(fp);
        m.setStatus(STATUS_STORED);
        try {
            chatMessageMapper.insert(m);
        } catch (DuplicateKeyException e) {
            log.info("聊天消息重复落库已忽略 fp={}", fp);
        }
    }

    /** 会话列表：每个会话的最新一条 + 未读数 + 对方昵称头像 */
    public List<ChatSessionItem> sessions(long userId) {
        List<Map<String, Object>> latest = chatMessageMapper.selectLatestPerPeer(userId);
        if (latest.isEmpty()) {
            return Collections.emptyList();
        }
        Map<Long, Integer> unreadMap = new HashMap<>();
        for (Map<String, Object> row : chatMessageMapper.countUnreadGroupByPeer(userId)) {
            unreadMap.put(((Number) row.get("peer_id")).longValue(), ((Number) row.get("unread")).intValue());
        }
        // 会话方向：会话第一条消息是谁发的（我发起 / 对方找我）
        Set<Long> initiatedByMe = new HashSet<>();
        for (Map<String, Object> row : chatMessageMapper.selectFirstFromPerPeer(userId)) {
            if (((Number) row.get("from_user_id")).longValue() == userId) {
                initiatedByMe.add(((Number) row.get("peer_id")).longValue());
            }
        }
        List<Long> peerIds = latest.stream()
                .map(r -> ((Number) r.get("peer_id")).longValue())
                .collect(Collectors.toList());
        Map<Long, User> users = userMapper.selectBatchIds(peerIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));

        List<ChatSessionItem> result = new ArrayList<>();
        for (Map<String, Object> row : latest) {
            long peerId = ((Number) row.get("peer_id")).longValue();
            User peer = users.get(peerId);
            result.add(ChatSessionItem.builder()
                    .peerId(peerId)
                    .nickname(peer != null ? peer.getNickname() : "")
                    .avatarUrl(peer != null ? peer.getAvatarUrl() : "")
                    .lastContent((String) row.get("content"))
                    .lastTypeu(((Number) row.get("typeu")).intValue())
                    .lastTime(toOffsetTime(row.get("created_at")))
                    .unread(unreadMap.getOrDefault(peerId, 0))
                    .initiatedByMe(initiatedByMe.contains(peerId))
                    .build());
        }
        // 最新消息时间倒序
        result.sort((a, b) -> b.getLastTime().compareTo(a.getLastTime()));
        return result;
    }

    /**
     * 会话历史分页（倒查后正序返回）。
     * 副作用：把对方发给我、状态为已存储的消息置为「已拉取」——与实时推送的
     * 竞态由 fp 幂等落库 + 客户端按 fp 去重兜底。
     */
    public ChatHistoryResp history(long userId, long peerId, Long cursor, int limit) {
        long cursorId = (cursor == null || cursor <= 0) ? Long.MAX_VALUE : cursor;
        // 多查一条判断 hasMore
        List<ChatMessage> rows = chatMessageMapper.selectHistory(userId, peerId, cursorId, limit + 1);
        boolean hasMore = rows.size() > limit;
        if (hasMore) {
            rows = rows.subList(0, limit);
        }
        Long nextCursor = hasMore && !rows.isEmpty() ? rows.get(rows.size() - 1).getId() : null;

        if (!rows.isEmpty()) {
            chatMessageMapper.update(null, new LambdaUpdateWrapper<ChatMessage>()
                    .set(ChatMessage::getStatus, STATUS_FETCHED)
                    .eq(ChatMessage::getToUserId, userId)
                    .eq(ChatMessage::getFromUserId, peerId)
                    .eq(ChatMessage::getStatus, STATUS_STORED));
        }

        Collections.reverse(rows);
        List<ChatMessageItem> items = rows.stream().map(this::toItem).collect(Collectors.toList());
        return ChatHistoryResp.builder()
                .list(items)
                .nextCursor(nextCursor)
                .hasMore(hasMore)
                .build();
    }

    /** 标记会话已读（对方发给我的消息 status<3 → 3） */
    public void markRead(long userId, long peerId) {
        chatMessageMapper.update(null, new LambdaUpdateWrapper<ChatMessage>()
                .set(ChatMessage::getStatus, STATUS_READ)
                .eq(ChatMessage::getToUserId, userId)
                .eq(ChatMessage::getFromUserId, peerId)
                .lt(ChatMessage::getStatus, STATUS_READ));
    }

    /** 未读消息总数（会话入口角标） */
    public int unreadTotal(long userId) {
        return Math.toIntExact(chatMessageMapper.selectCount(new LambdaQueryWrapper<ChatMessage>()
                .eq(ChatMessage::getToUserId, userId)
                .eq(ChatMessage::getStatus, STATUS_STORED)));
    }

    /**
     * Map 查询里 timestamptz 列的时间兼容转换：JDBC 驱动按 Object 返回 java.sql.Timestamp，
     * 只有实体映射才走 OffsetDateTime 类型处理，直接强转会 ClassCastException。
     */
    private OffsetDateTime toOffsetTime(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof OffsetDateTime o) {
            return o;
        }
        if (v instanceof java.sql.Timestamp t) {
            return OffsetDateTime.ofInstant(t.toInstant(), ZoneId.systemDefault());
        }
        throw new IllegalStateException("意外的时间类型: " + v.getClass());
    }

    private ChatMessageItem toItem(ChatMessage m) {
        return ChatMessageItem.builder()
                .id(m.getId())
                .from(m.getFromUserId())
                .to(m.getToUserId())
                .content(m.getContent())
                .typeu(m.getTypeu())
                .fp(m.getFp())
                .status(m.getStatus())
                .createTime(m.getCreatedAt())
                .build();
    }
}
