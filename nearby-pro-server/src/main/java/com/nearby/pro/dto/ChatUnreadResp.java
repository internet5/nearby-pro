package com.nearby.pro.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/** 未读消息总数 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatUnreadResp {

    private int total;
}
