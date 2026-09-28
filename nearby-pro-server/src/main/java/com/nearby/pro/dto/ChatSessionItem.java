package com.nearby.pro.dto;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

/** 会话列表条目：会话按 (对方用户, 技能) 维度区分，listingId 为空表示未挂技能的旧会话 */
@Data
@Builder
public class ChatSessionItem {

    private Long peerId;
    private String nickname;
    private String avatarUrl;
    /** 会话关联的技能发布 id；NULL=旧会话/老客户端消息 */
    private Long listingId;
    /** 会话关联的技能名称（标题），列表条目副标题展示 */
    private String listingTitle;
    private String lastContent;
    private Integer lastTypeu;
    private OffsetDateTime lastTime;
    private Integer unread;
    /** 会话方向：true=我发起的（会话第一条消息是我发的），false=对方找我的 */
    private Boolean initiatedByMe;
}
