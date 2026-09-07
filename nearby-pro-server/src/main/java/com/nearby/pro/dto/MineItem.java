package com.nearby.pro.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** 我的发布列表元素：精简展示字段；编辑回填走详情接口 */
@Data
public class MineItem {

    private Long id;
    private Integer categoryId;
    private String categoryCode;
    private String categoryName;
    private List<String> tags = new ArrayList<>();
    private List<ItemGroup> items = new ArrayList<>();
    private String title;
    private String address = "";
    private Double latitude;
    private Double longitude;
    private Integer status;
    private Integer viewCount;
    private OffsetDateTime expireTime;
    private OffsetDateTime createTime;
}
