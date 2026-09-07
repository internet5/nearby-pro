package com.nearby.pro.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 意见与建议，运营查库人工处理 */
@Data
@TableName("feedbacks")
public class Feedback {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long userId;
    private String content;
    private OffsetDateTime createdAt;
}
