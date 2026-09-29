package com.nearby.pro.dto;

import jakarta.validation.constraints.Size;
import lombok.Data;

/** 更新头像昵称请求：两者均可为空，空昵称由前端展示层兜底 */
@Data
public class UserProfileReq {

    @Size(max = 30, message = "昵称最长 30 字")
    private String nickname;

    @Size(max = 500, message = "头像地址过长")
    private String avatarUrl;
}
