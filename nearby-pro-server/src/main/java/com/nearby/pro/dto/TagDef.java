package com.nearby.pro.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 分类字典里的工种定义：工种名 + 可选的具体项目列表 */
@Data
public class TagDef {

    private String name = "";
    private List<String> items = new ArrayList<>();
}
