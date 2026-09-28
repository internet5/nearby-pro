package com.nearby.pro.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** 标记已读请求：listingId 为空表示未挂技能的旧会话 */
@Data
public class ChatReadReq {

    @NotNull
    private Long peerId;

    private Long listingId;
}
