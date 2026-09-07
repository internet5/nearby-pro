package com.nearby.pro.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/** 微信用户，发布方和需求方共用 */
@Data
@TableName("users")
public class User {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String openid;
    private String unionid;
    private String nickname;
    private String avatarUrl;
    private String phone;
    private OffsetDateTime createdAt;
    private OffsetDateTime updatedAt;
}
