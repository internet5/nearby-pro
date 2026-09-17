package com.nearby.pro.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** 标记已读请求 */
@Data
public class ChatReadReq {

    @NotNull
    private Long peerId;
}
