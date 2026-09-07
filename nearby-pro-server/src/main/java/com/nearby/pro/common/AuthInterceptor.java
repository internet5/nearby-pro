package com.nearby.pro.common;

import com.nearby.pro.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 登录拦截：挂在 /api/listings/** 与 /api/feedbacks/**（nearby 已在 WebConfig 排除）。
 * 规则：
 * - 带合法 token：解析 userId 写入 UserContext
 * - 无 token 的 GET（看详情）：允许游客通过，isOwner 由 controller 判断
 * - 无 token 的写操作与「我的发布」：抛「请先登录」
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final AuthService authService;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        Long userId = authService.parseUserId(request.getHeader("Authorization"));
        if (userId != null) {
            UserContext.set(userId);
            return true;
        }
        boolean isGet = "GET".equalsIgnoreCase(request.getMethod());
        boolean isMine = request.getRequestURI().endsWith("/mine");
        if (isGet && !isMine) {
            return true;
        }
        throw new ApiException("请先登录");
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }
}
