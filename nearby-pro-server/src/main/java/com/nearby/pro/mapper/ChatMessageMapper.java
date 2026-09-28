package com.nearby.pro.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.nearby.pro.entity.ChatMessage;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

public interface ChatMessageMapper extends BaseMapper<ChatMessage> {

    /**
     * 每个会话（对方 + 技能 维度）的最新一条消息。
     * listing_id 为 NULL 表示未挂技能的旧会话，PostgreSQL 的 DISTINCT ON/GROUP BY 把 NULL 视为同组。
     */
    @Select("""
            SELECT DISTINCT ON (peer_id, listing_id) peer_id, listing_id, id, from_user_id, to_user_id,
                   content, typeu, is_auto, status, created_at
            FROM (
                SELECT CASE WHEN from_user_id = #{userId} THEN to_user_id ELSE from_user_id END AS peer_id,
                       listing_id, id, from_user_id, to_user_id, content, typeu, is_auto, status, created_at
                FROM chat_messages
                WHERE from_user_id = #{userId} OR to_user_id = #{userId}
            ) t
            ORDER BY peer_id, listing_id, id DESC
            """)
    List<Map<String, Object>> selectLatestPerPeer(@Param("userId") long userId);

    /** 各会话（对方 + 技能 维度）未读数（status=1 且接收方是我） */
    @Select("""
            SELECT to_user_id AS peer_id, listing_id, COUNT(*) AS unread
            FROM chat_messages
            WHERE to_user_id = #{userId} AND status = 1
            GROUP BY to_user_id, listing_id
            """)
    List<Map<String, Object>> countUnreadGroupByPeer(@Param("userId") long userId);

    /** 每个会话第一条消息的发送人（判会话方向：我发起 / 对方找我） */
    @Select("""
            SELECT DISTINCT ON (peer_id, listing_id) peer_id, listing_id, from_user_id
            FROM (
                SELECT CASE WHEN from_user_id = #{userId} THEN to_user_id ELSE from_user_id END AS peer_id,
                       listing_id, from_user_id, id
                FROM chat_messages
                WHERE from_user_id = #{userId} OR to_user_id = #{userId}
            ) t
            ORDER BY peer_id, listing_id, id ASC
            """)
    List<Map<String, Object>> selectFirstFromPerPeer(@Param("userId") long userId);

    /** 会话历史倒查（cursor 传 Long.MAX_VALUE 表示第一页；listingId 为空过滤 listing_id IS NULL） */
    @Select("""
            <script>
            SELECT * FROM chat_messages
            WHERE ((from_user_id = #{userId} AND to_user_id = #{peerId})
                OR (from_user_id = #{peerId} AND to_user_id = #{userId}))
              <choose>
                <when test="listingId != null">AND listing_id = #{listingId}</when>
                <otherwise>AND listing_id IS NULL</otherwise>
              </choose>
              AND id &lt; #{cursor}
            ORDER BY id DESC
            LIMIT #{limit}
            </script>
            """)
    List<ChatMessage> selectHistory(@Param("userId") long userId,
                                    @Param("peerId") long peerId,
                                    @Param("listingId") Long listingId,
                                    @Param("cursor") long cursor,
                                    @Param("limit") int limit);

    /** 某技能会话（双向）已有消息数：自动回复只在该会话首条消息时触发 */
    @Select("""
            SELECT COUNT(*) FROM chat_messages
            WHERE listing_id = #{listingId}
              AND ((from_user_id = #{a} AND to_user_id = #{b})
                OR (from_user_id = #{b} AND to_user_id = #{a}))
            """)
    long countByConversation(@Param("a") long a, @Param("b") long b, @Param("listingId") long listingId);
}
