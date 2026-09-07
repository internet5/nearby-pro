package com.nearby.pro.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 具体会做的项目，按工种分组：{"tag":"家电维修","names":["空调","电磁炉"]} */
@Data
public class ItemGroup {

    private String tag = "";
    private List<String> names = new ArrayList<>();
}
