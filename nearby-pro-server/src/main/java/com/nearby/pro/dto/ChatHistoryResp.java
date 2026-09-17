package com.nearby.pro.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/** 会话历史分页响应：list 按时间正序，nextCursor 供继续向更早翻页 */
@Data
@Builder
public class ChatHistoryResp {

    private List<ChatMessageItem> list;
    private Long nextCursor;
    private Boolean hasMore;
}
