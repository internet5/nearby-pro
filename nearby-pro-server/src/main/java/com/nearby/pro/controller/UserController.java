package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.common.UserContext;
import com.nearby.pro.dto.UserProfileReq;
import com.nearby.pro.service.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/user")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    /** 更新头像昵称（需登录） */
    @PutMapping("/profile")
    public ApiResult<Map<String, String>> updateProfile(@Valid @RequestBody UserProfileReq req) {
        return ApiResult.ok(userService.updateProfile(UserContext.require(), req.getNickname(), req.getAvatarUrl()));
    }
}
