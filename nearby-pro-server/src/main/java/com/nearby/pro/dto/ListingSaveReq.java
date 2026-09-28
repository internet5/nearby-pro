package com.nearby.pro.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/** 发布/更新技能的请求体，字段与小程序发布页表单一一对应 */
@Data
public class ListingSaveReq {

    @NotNull(message = "请选择分类")
    private Integer categoryId;

    /** 预设标签，0~3 个，可跳过 */
    private List<String> tags = new ArrayList<>();

    /** 已废弃的三级字典遗留字段：老客户端可能还传，服务端不再校验，落库固定 [] */
    private List<ItemGroup> items = new ArrayList<>();

    @NotBlank(message = "请填写技能名称")
    @Size(max = 8, message = "技能名称最长 8 个字")
    private String title;

    @Size(max = 500, message = "补充说明最长 500 字")
    private String description = "";

    /** 图片为 COS 直传后的 URL，最多 3 张 */
    @Size(max = 3, message = "图片最多 3 张")
    private List<String> photoUrls = new ArrayList<>();

    /** 自动回复内容：有别人首次咨询该技能时由服务端以发布人身份发送 */
    @Size(max = 200, message = "自动回复最长 200 字")
    private String autoReply = "";

    /** 联系方式已不再收集：仅老客户端会传，兼容保留字段 */
    private String contactType = "";

    private String contactValue = "";

    @NotNull(message = "请选择服务位置")
    private Double latitude;

    @NotNull(message = "请选择服务位置")
    private Double longitude;

    @Size(max = 200, message = "地址过长")
    private String address = "";

    @Size(max = 40, message = "城市名过长")
    private String city = "";
}
