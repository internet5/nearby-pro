package com.nearby.pro.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.nearby.pro.common.JsonUtil;
import com.nearby.pro.dto.CategoryResp;
import com.nearby.pro.dto.TagDef;
import com.nearby.pro.entity.Category;
import com.nearby.pro.mapper.CategoryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
public class CategoryService {

    private final CategoryMapper categoryMapper;

    /** 启用的分类，按 sort_order 排序；「全部」由前端自己拼，不入库 */
    public List<CategoryResp> listEnabled() {
        List<Category> list = categoryMapper.selectList(new LambdaQueryWrapper<Category>()
                .eq(Category::getEnabled, true)
                .orderByAsc(Category::getSortOrder));
        return list.stream().map(category -> {
            CategoryResp resp = new CategoryResp();
            resp.setId(category.getId());
            resp.setCode(category.getCode());
            resp.setName(category.getName());
            resp.setTags(JsonUtil.parseList(category.getTags(), TagDef.class));
            return resp;
        }).toList();
    }
}
