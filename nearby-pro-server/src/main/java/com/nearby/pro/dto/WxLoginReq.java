package com.nearby.pro.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class WxLoginReq {

    /** wx.login 拿到的 code */
    @NotBlank(message = "缺少登录凭证")
    private String code;

    /** 可选，首次登录时让用户补充昵称 */
    private String nickname;

    /** 可选 */
    private String avatarUrl;
}
