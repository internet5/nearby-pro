package com.nearby.pro.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 收藏列表元素：精简展示字段；坐标带上，供「看位置」跳地图聚焦 */
@Data
public class FavoriteItem {

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
}
