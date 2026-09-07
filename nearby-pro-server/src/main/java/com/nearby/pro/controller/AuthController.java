package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.dto.LoginResp;
import com.nearby.pro.dto.WxLoginReq;
import com.nearby.pro.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/wxLogin")
    public ApiResult<LoginResp> wxLogin(@Valid @RequestBody WxLoginReq req) {
        return ApiResult.ok(authService.wxLogin(req));
    }
}
