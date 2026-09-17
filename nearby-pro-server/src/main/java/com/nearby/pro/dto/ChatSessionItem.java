package com.nearby.pro.dto;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

/** 会话列表条目 */
@Data
@Builder
public class ChatSessionItem {

    private Long peerId;
    private String nickname;
    private String avatarUrl;
    private String lastContent;
    private Integer lastTypeu;
    private OffsetDateTime lastTime;
    private Integer unread;
    /** 会话方向：true=我发起的（会话第一条消息是我发的），false=对方找我的 */
    private Boolean initiatedByMe;
}
