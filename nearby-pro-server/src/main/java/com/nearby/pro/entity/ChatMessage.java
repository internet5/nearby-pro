package com.nearby.pro.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.OffsetDateTime;

/**
 * 私聊消息（MobileIMSDK C2C 消息落库）。消息不可变，无 updated_at。
 */
@Data
@TableName("chat_messages")
public class ChatMessage {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long fromUserId;
    private Long toUserId;
    private String content;
    /** 消息业务类型（Protocal.typeu 透传）：1=文本，预留扩展 */
    private Integer typeu;
    /** 消息指纹（Protocal.fp），全局唯一防重发落库 */
    private String fp;
    /** 1=已存储 2=接收方已拉取 3=已读 */
    private Integer status;
    private OffsetDateTime createdAt;
}
