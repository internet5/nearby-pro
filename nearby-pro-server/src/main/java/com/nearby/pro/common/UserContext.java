package com.nearby.pro.common;

/** 当前登录用户，由 AuthInterceptor 在请求开始时写入 */
public final class UserContext {

    private static final ThreadLocal<Long> HOLDER = new ThreadLocal<>();

    private UserContext() {
    }

    public static void set(Long userId) {
        HOLDER.set(userId);
    }

    /** 可能为 null：游客访问详情时未登录 */
    public static Long get() {
        return HOLDER.get();
    }

    /** 必须已登录的业务（发布、下架等）用这个取 */
    public static long require() {
        Long userId = HOLDER.get();
        if (userId == null) {
            throw new ApiException("请先登录");
        }
        return userId;
    }

    public static void clear() {
        HOLDER.remove();
    }
}
