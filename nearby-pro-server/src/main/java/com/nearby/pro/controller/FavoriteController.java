package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.common.UserContext;
import com.nearby.pro.dto.FavoriteItem;
import com.nearby.pro.service.FavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/favorites")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    /** 我的收藏（需登录）：只返回上架中的 */
    @GetMapping
    public ApiResult<Map<String, Object>> list() {
        List<FavoriteItem> list = favoriteService.list(UserContext.require());
        return ApiResult.ok(Map.of("list", list, "total", list.size()));
    }

    /** 收藏（需登录）：重复收藏幂等 */
    @PostMapping("/{listingId}")
    public ApiResult<Void> add(@PathVariable long listingId) {
        favoriteService.add(UserContext.require(), listingId);
        return ApiResult.ok();
    }

    /** 取消收藏（需登录） */
    @DeleteMapping("/{listingId}")
    public ApiResult<Void> remove(@PathVariable long listingId) {
        favoriteService.remove(UserContext.require(), listingId);
        return ApiResult.ok();
    }
}
