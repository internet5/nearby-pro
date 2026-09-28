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
    /** 消息关联的技能发布 id；NULL=未挂技能 */
    private Long listingId;
    private String content;
    private Integer typeu;
    /** 1=服务端自动回复 */
    private Integer isAuto;
    private String fp;
    private Integer status;
    private OffsetDateTime createTime;
}
