package com.nearby.pro.common;

import lombok.Data;

/**
 * 统一响应，与 docs/api.md 约定一致：
 * 成功 { success: true, data: {}, message: "" }
 * 失败 { success: false, data: null, message: 原因 }（HTTP 仍为 200，小程序端统一在 success 回调里判断）
 */
@Data
public class ApiResult<T> {

    private boolean success;
    private T data;
    private String message;

    public static <T> ApiResult<T> ok(T data) {
        ApiResult<T> result = new ApiResult<>();
        result.success = true;
        result.data = data;
        result.message = "";
        return result;
    }

    public static ApiResult<Void> ok() {
        return ok(null);
    }

    public static <T> ApiResult<T> fail(String message) {
        ApiResult<T> result = new ApiResult<>();
        result.success = false;
        result.data = null;
        result.message = message;
        return result;
    }
}
