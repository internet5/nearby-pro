package com.nearby.pro.dto;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class LoginResp {

    private String token;
    private Long userId;
    private String nickname;
    private String avatarUrl;
    private String phone;
}
