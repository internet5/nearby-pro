package com.nearby.pro.dto;

import lombok.Data;

/** 分类字典里的预设标签定义（发布可选 0~3 个，可跳过；老数据里的 items 字段已被废弃忽略） */
@Data
public class TagDef {

    private String name = "";
}
