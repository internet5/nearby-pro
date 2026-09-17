package com.nearby.pro.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/** 会话列表响应：对齐项目列表接口的 {list} 惯例结构 */
@Data
@Builder
public class ChatSessionsResp {

    private List<ChatSessionItem> list;
}
