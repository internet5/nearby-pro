package com.nearby.pro.dto;

import lombok.Data;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** 发布详情：联系方式只在这里返回 */
@Data
public class ListingDetail {

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
    private String description = "";
    private List<String> photoUrls = new ArrayList<>();
    private String contactType;
    private String contactValue;
    private Double latitude;
    private Double longitude;
    private String address = "";
    private String city = "";
    /** 请求带 viewerLatitude/viewerLongitude 时才有 */
    private Integer distance;
    private Integer status;
    private OffsetDateTime expireTime;
    private Integer viewCount;
    private OffsetDateTime createTime;
    private Boolean isOwner;
}
