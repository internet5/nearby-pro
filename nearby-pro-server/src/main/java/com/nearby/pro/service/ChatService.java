package com.nearby.pro.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.dto.ChatHistoryResp;
import com.nearby.pro.dto.ChatMessageItem;
import com.nearby.pro.dto.ChatSessionItem;
import com.nearby.pro.entity.ChatMessage;
import com.nearby.pro.entity.Listing;
import com.nearby.pro.entity.User;
import com.nearby.pro.mapper.ChatMessageMapper;
import com.nearby.pro.mapper.ListingMapper;
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
 * 会话按 (对方用户, 技能) 维度区分：每个用户对每个技能一个会话；listingId 为空表示未挂技能的旧会话。
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
    private final ListingMapper listingMapper;

    // ---- C2C 文本消息信封（dataContent）----
    // 帧格式 {"v":1,"lid":123,"c":"你好","a":0}：v 版本、lid 技能 id（0=无）、c 纯文本、a 是否服务端自动回复。
    // C2C 帧没有扩展字段，业务上下文只能放 dataContent；非信封格式按老客户端纯文本兼容处理。

    /** 信封解析结果：lid=技能 id（0=无），content=纯文本内容，auto=服务端自动回复 */
    public record Envelope(long lid, String content, boolean auto) {}

    /** 把纯文本 + 技能上下文打包成信封 JSON，作为 C2C 帧 dataContent 发送 */
    public static String buildEnvelope(long listingId, String content, boolean auto) {
        return "{\"v\":1,\"lid\":" + listingId
                + ",\"c\":" + JsonUtil.toJson(content == null ? "" : content)
                + ",\"a\":" + (auto ? 1 : 0) + "}";
    }

    /** 解析信封；非信封格式（老客户端裸文本）返回 null，由调用方按纯文本降级处理 */
    public static Envelope parseEnvelope(String dataContent) {
        if (dataContent == null || dataContent.isEmpty() || dataContent.charAt(0) != '{') {
            return null;
        }
        try {
            JsonNode node = JsonUtil.MAPPER.readTree(dataContent);
            if (!node.has("v") || !node.has("c")) {
                return null;
            }
            return new Envelope(node.path("lid").asLong(0), node.path("c").asText(""), node.path("a").asInt(0) == 1);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * C2C 消息落库（供 ImEventListener 回调调用）。
     * listingId 会做归属校验：listing 不存在、或发送/接收双方都不是属主时按未挂技能落库，防伪造 lid。
     * fp 唯一索引冲突（QoS 重发/重复回调）按成功吞掉，保证幂等。
     */
    public void saveMessage(long from, long to, String content, int typeu, String fp,
                            Long listingId, boolean autoReply) {
        ChatMessage m = new ChatMessage();
        m.setFromUserId(from);
        m.setToUserId(to);
        m.setContent(content == null ? "" : content);
        m.setTypeu(typeu);
        m.setFp(fp);
        m.setStatus(STATUS_STORED);
        m.setListingId(resolveListingId(from, to, listingId));
        m.setIsAuto(autoReply ? 1 : 0);
        try {
            chatMessageMapper.insert(m);
        } catch (DuplicateKeyException e) {
            log.info("聊天消息重复落库已忽略 fp={}", fp);
        }
    }

    /** 校验消息挂接的技能：存在且双方之一是属主才有效，否则归为未挂技能（null） */
    private Long resolveListingId(long from, long to, Long listingId) {
        if (listingId == null || listingId <= 0) {
            return null;
        }
        Listing listing = listingMapper.selectById(listingId);
        if (listing == null) {
            return null;
        }
        long owner = listing.getUserId();
        return (from == owner || to == owner) ? listingId : null;
    }

    /** 会话列表：每个会话（对方 + 技能）的最新一条 + 未读数 + 对方昵称头像 + 技能名 */
    public List<ChatSessionItem> sessions(long userId) {
        List<Map<String, Object>> latest = chatMessageMapper.selectLatestPerPeer(userId);
        if (latest.isEmpty()) {
            return Collections.emptyList();
        }
        Map<String, Integer> unreadMap = new HashMap<>();
        for (Map<String, Object> row : chatMessageMapper.countUnreadGroupByPeer(userId)) {
            unreadMap.put(convKey(row), ((Number) row.get("unread")).intValue());
        }
        // 会话方向：会话第一条消息是谁发的（我发起 / 对方找我）
        Set<String> initiatedByMe = new HashSet<>();
        for (Map<String, Object> row : chatMessageMapper.selectFirstFromPerPeer(userId)) {
            if (((Number) row.get("from_user_id")).longValue() == userId) {
                initiatedByMe.add(convKey(row));
            }
        }
        // 批量查对方昵称头像
        List<Long> peerIds = latest.stream()
                .map(r -> ((Number) r.get("peer_id")).longValue())
                .distinct()
                .collect(Collectors.toList());
        Map<Long, User> users = userMapper.selectBatchIds(peerIds).stream()
                .collect(Collectors.toMap(User::getId, u -> u));
        // 批量查会话挂的技能标题
        List<Long> listingIds = latest.stream()
                .map(r -> rowListingId(r))
                .filter(id -> id != null)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, String> listingTitles = listingIds.isEmpty() ? Map.of()
                : listingMapper.selectBatchIds(listingIds).stream()
                        .collect(Collectors.toMap(Listing::getId, Listing::getTitle));

        List<ChatSessionItem> result = new ArrayList<>();
        for (Map<String, Object> row : latest) {
            long peerId = ((Number) row.get("peer_id")).longValue();
            Long listingId = rowListingId(row);
            User peer = users.get(peerId);
            result.add(ChatSessionItem.builder()
                    .peerId(peerId)
                    .nickname(peer != null ? peer.getNickname() : "")
                    .avatarUrl(peer != null ? peer.getAvatarUrl() : "")
                    .listingId(listingId)
                    .listingTitle(listingId == null ? "" : listingTitles.getOrDefault(listingId, ""))
                    .lastContent((String) row.get("content"))
                    .lastTypeu(((Number) row.get("typeu")).intValue())
                    .lastTime(toOffsetTime(row.get("created_at")))
                    .unread(unreadMap.getOrDefault(convKey(row), 0))
                    .initiatedByMe(initiatedByMe.contains(convKey(row)))
                    .build());
        }
        // 最新消息时间倒序
        result.sort((a, b) -> b.getLastTime().compareTo(a.getLastTime()));
        return result;
    }

    private static Long rowListingId(Map<String, Object> row) {
        Object v = row.get("listing_id");
        return v == null ? null : ((Number) v).longValue();
    }

    /** 会话聚合的组合 key：对方 + 技能 */
    private static String convKey(Map<String, Object> row) {
        Long listingId = rowListingId(row);
        return row.get("peer_id") + ":" + (listingId == null ? "-" : listingId);
    }

    /**
     * 会话历史分页（倒查后正序返回）。
     * 副作用：把对方发给我、状态为已存储的消息置为「已拉取」——与实时推送的
     * 竞态由 fp 幂等落库 + 客户端按 fp 去重兜底。
     */
    public ChatHistoryResp history(long userId, long peerId, Long listingId, Long cursor, int limit) {
        long cursorId = (cursor == null || cursor <= 0) ? Long.MAX_VALUE : cursor;
        // 多查一条判断 hasMore
        List<ChatMessage> rows = chatMessageMapper.selectHistory(userId, peerId, listingId, cursorId, limit + 1);
        boolean hasMore = rows.size() > limit;
        if (hasMore) {
            rows = rows.subList(0, limit);
        }
        Long nextCursor = hasMore && !rows.isEmpty() ? rows.get(rows.size() - 1).getId() : null;

        if (!rows.isEmpty()) {
            LambdaUpdateWrapper<ChatMessage> mark = new LambdaUpdateWrapper<ChatMessage>()
                    .set(ChatMessage::getStatus, STATUS_FETCHED)
                    .eq(ChatMessage::getToUserId, userId)
                    .eq(ChatMessage::getFromUserId, peerId)
                    .eq(ChatMessage::getStatus, STATUS_STORED);
            if (listingId == null) {
                mark.isNull(ChatMessage::getListingId);
            } else {
                mark.eq(ChatMessage::getListingId, listingId);
            }
            chatMessageMapper.update(null, mark);
        }

        Collections.reverse(rows);
        List<ChatMessageItem> items = rows.stream().map(this::toItem).collect(Collectors.toList());
        return ChatHistoryResp.builder()
                .list(items)
                .nextCursor(nextCursor)
                .hasMore(hasMore)
                .build();
    }

    /** 标记会话已读（对方发给我的消息 status<3 → 3）；listingId 为空处理未挂技能的旧会话 */
    public void markRead(long userId, long peerId, Long listingId) {
        LambdaUpdateWrapper<ChatMessage> mark = new LambdaUpdateWrapper<ChatMessage>()
                .set(ChatMessage::getStatus, STATUS_READ)
                .eq(ChatMessage::getToUserId, userId)
                .eq(ChatMessage::getFromUserId, peerId)
                .lt(ChatMessage::getStatus, STATUS_READ);
        if (listingId == null) {
            mark.isNull(ChatMessage::getListingId);
        } else {
            mark.eq(ChatMessage::getListingId, listingId);
        }
        chatMessageMapper.update(null, mark);
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
                .listingId(m.getListingId())
                .content(m.getContent())
                .typeu(m.getTypeu())
                .isAuto(m.getIsAuto())
                .fp(m.getFp())
                .status(m.getStatus())
                .createTime(m.getCreatedAt())
                .build();
    }
}
