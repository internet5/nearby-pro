package com.nearby.pro.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 分类列表元素，tags 供发布页勾选与地图筛选条使用 */
@Data
public class CategoryResp {

    private Integer id;
    private String code;
    private String name;
    private List<TagDef> tags = new ArrayList<>();
}
