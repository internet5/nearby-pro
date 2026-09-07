package com.nearby.pro.dto;

import lombok.Data;

import java.time.OffsetDateTime;

/** 附近查询的 SQL 投影：tags/items 以 JSON 文本返回，service 层再转结构 */
@Data
public class NearbyRow {

    private Long id;
    private Long userId;
    private String nickname;
    private String avatarUrl;
    private Integer categoryId;
    private String categoryCode;
    private String categoryName;
    private String tags;
    private String items;
    private String title;
    private Double latitude;
    private Double longitude;
    private String address;
    private OffsetDateTime expireTime;
    private Double distance;
}
