package com.nearby.pro.common;

/** 业务异常：message 会原样返回给前端展示 */
public class ApiException extends RuntimeException {

    public ApiException(String message) {
        super(message);
    }
}
