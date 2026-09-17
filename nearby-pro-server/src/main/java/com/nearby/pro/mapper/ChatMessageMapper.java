package com.nearby.pro.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.nearby.pro.entity.ChatMessage;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

import java.util.List;
import java.util.Map;

public interface ChatMessageMapper extends BaseMapper<ChatMessage> {

    /** 每个会话（peer 维度）的最新一条消息 */
    @Select("""
            SELECT DISTINCT ON (peer_id) peer_id, id, from_user_id, to_user_id,
                   content, typeu, status, created_at
            FROM (
                SELECT CASE WHEN from_user_id = #{userId} THEN to_user_id ELSE from_user_id END AS peer_id,
                       id, from_user_id, to_user_id, content, typeu, status, created_at
                FROM chat_messages
                WHERE from_user_id = #{userId} OR to_user_id = #{userId}
            ) t
            ORDER BY peer_id, id DESC
            """)
    List<Map<String, Object>> selectLatestPerPeer(@Param("userId") long userId);

    /** 各会话未读数（status=1 且接收方是我） */
    @Select("""
            SELECT to_user_id AS peer_id, COUNT(*) AS unread
            FROM chat_messages
            WHERE to_user_id = #{userId} AND status = 1
            GROUP BY to_user_id
            """)
    List<Map<String, Object>> countUnreadGroupByPeer(@Param("userId") long userId);

    /** 每个会话第一条消息的发送人（判会话方向：我发起 / 对方找我） */
    @Select("""
            SELECT DISTINCT ON (peer_id) peer_id, from_user_id
            FROM (
                SELECT CASE WHEN from_user_id = #{userId} THEN to_user_id ELSE from_user_id END AS peer_id,
                       from_user_id, id
                FROM chat_messages
                WHERE from_user_id = #{userId} OR to_user_id = #{userId}
            ) t
            ORDER BY peer_id, id ASC
            """)
    List<Map<String, Object>> selectFirstFromPerPeer(@Param("userId") long userId);

    /** 会话历史倒查（cursor 传 Long.MAX_VALUE 表示第一页） */
    @Select("""
            SELECT * FROM chat_messages
            WHERE ((from_user_id = #{userId} AND to_user_id = #{peerId})
                OR (from_user_id = #{peerId} AND to_user_id = #{userId}))
              AND id < #{cursor}
            ORDER BY id DESC
            LIMIT #{limit}
            """)
    List<ChatMessage> selectHistory(@Param("userId") long userId,
                                    @Param("peerId") long peerId,
                                    @Param("cursor") long cursor,
                                    @Param("limit") int limit);
}
