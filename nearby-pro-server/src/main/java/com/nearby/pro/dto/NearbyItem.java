package com.nearby.pro.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** 附近列表元素：不含联系方式，避免被爬取 */
@Data
public class NearbyItem {

    private Long id;
    private Long userId;
    private String nickname = "";
    private String avatarUrl = "";
    private Integer categoryId;
    private String categoryCode;
    private String categoryName;
    private List<String> tags = new ArrayList<>();
    private List<ItemGroup> items = new ArrayList<>();
    private String title;
    private Double latitude;
    private Double longitude;
    private String address = "";
    /** 距离，单位米（四舍五入取整） */
    private Integer distance;
    private OffsetDateTime expireTime;
}
