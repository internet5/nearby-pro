package com.nearby.pro.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 用户举报 */
@Data
@TableName("reports")
public class Report {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long listingId;
    private Long reporterId;
    private String reason;
    private String detail;
    private OffsetDateTime createdAt;
}
