package com.nearby.pro.controller;

import com.nearby.pro.common.ApiResult;
import com.nearby.pro.dto.CategoryResp;
import com.nearby.pro.service.CategoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @GetMapping("/api/categories")
    public ApiResult<List<CategoryResp>> list() {
        return ApiResult.ok(categoryService.listEnabled());
    }
}
