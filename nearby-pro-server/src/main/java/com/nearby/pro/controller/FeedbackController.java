package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.common.UserContext;
import com.nearby.pro.dto.FeedbackReq;
import com.nearby.pro.service.FeedbackService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class FeedbackController {

    private final FeedbackService feedbackService;

    /** 意见与建议（需登录）：落库由运营人工处理 */
    @PostMapping("/api/feedbacks")
    public ApiResult<Void> submit(@Valid @RequestBody FeedbackReq req) {
        feedbackService.submit(UserContext.require(), req.getContent());
        return ApiResult.ok();
    }
}
