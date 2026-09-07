package com.nearby.pro.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 地图上的技能发布点。
 * photoUrls/tags/items 三个 JSONB 列在实体里以 JSON 文本读写，转换集中在 service 层。
 * geohash/geom 不映射：由数据库触发器根据经纬度自动填充。
 */
@Data
@TableName("listings")
public class Listing {

    /** 1 上架 / 2 主动下架 / 3 过期 / 4 封禁 */
    public static final int STATUS_ACTIVE = 1;
    public static final int STATUS_OFFLINE = 2;
    public static final int STATUS_EXPIRED = 3;
    public static final int STATUS_BANNED = 4;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;
    private Integer categoryId;
    private String title;
    private String description;
    /** JSON 文本：List<String> */
    private String photoUrls;
    /** JSON 文本：List<String> */
    private String tags;
    /** JSON 文本：List<ItemGroup> */
    private String items;
    private String contactType;
    private String contactValue;
    private Double latitude;
    private Double longitude;
    private String address;
    private String city;
    private Integer status;
    private OffsetDateTime expireAt;
    private Integer viewCount;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
