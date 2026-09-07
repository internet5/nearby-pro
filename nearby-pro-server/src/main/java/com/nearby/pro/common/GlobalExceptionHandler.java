package com.nearby.pro.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /** 业务异常：message 直接给前端 */
    @ExceptionHandler(ApiException.class)
    public ApiResult<Void> handleApi(ApiException e) {
        return ApiResult.fail(e.getMessage());
    }

    /** @Valid 校验失败：取第一条提示 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ApiResult<Void> handleValid(MethodArgumentNotValidException e) {
        String message = e.getBindingResult().getFieldErrors().stream()
                .findFirst()
                .map(f -> f.getDefaultMessage())
                .orElse("参数不合法");
        return ApiResult.fail(message);
    }

    /** 请求体解析失败（JSON 格式错、编码错等）：给明确提示而不是兜底文案 */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ApiResult<Void> handleUnreadable(HttpMessageNotReadableException e) {
        log.warn("请求体解析失败：{}", e.getMessage());
        return ApiResult.fail("请求格式不正确，请重试");
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ApiResult<Void> handleMissingParam(MissingServletRequestParameterException e) {
        return ApiResult.fail("缺少参数：" + e.getParameterName());
    }

    @ExceptionHandler(Exception.class)
    public ApiResult<Void> handleOther(Exception e) {
        log.error("未处理异常", e);
        return ApiResult.fail("服务开小差了，请稍后再试");
    }
}
