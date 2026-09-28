package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.common.UserContext;
import com.nearby.pro.service.CosService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** COS 上传凭证（需登录） */
@RestController
@RequestMapping("/api/cos")
@RequiredArgsConstructor
public class CosController {

    private final CosService cosService;

    @GetMapping("/credentials")
    public ApiResult<Map<String, Object>> credentials() {
        UserContext.require();
        return ApiResult.ok(cosService.getCredentials());
    }
}
