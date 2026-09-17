package com.nearby.pro.dto;

import lombok.Builder;
import lombok.Data;

import java.time.OffsetDateTime;

/** 单条聊天消息 */
@Data
@Builder
public class ChatMessageItem {

    private Long id;
    private Long from;
    private Long to;
    private String content;
    private Integer typeu;
    private String fp;
    private Integer status;
    private OffsetDateTime createTime;
}
