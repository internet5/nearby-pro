package com.nearby.pro.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 技能分类，预置数据。
 * tags 存两级字典的 JSON 文本：[{"name":"水电维修","items":["电路跳闸",...]}]
 */
@Data
@TableName("categories")
public class Category {

    @TableId(type = IdType.AUTO)
    private Integer id;

    private String code;
    private String name;
    /** JSON 文本：List<TagDef> */
    private String tags;
    private Integer sortOrder;
    private Boolean enabled;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
