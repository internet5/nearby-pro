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

    /** 工种，最多 3 个 */
    private List<String> tags = new ArrayList<>();

    /** 具体会做的项目，按工种分组 */
    private List<ItemGroup> items = new ArrayList<>();

    @NotBlank(message = "请填写技能名称")
    @Size(max = 40, message = "技能名称最长 40 字")
    private String title;

    @Size(max = 500, message = "补充说明最长 500 字")
    private String description = "";

    /** MVP 暂无图片上传，前端固定传 [] */
    private List<String> photoUrls = new ArrayList<>();

    @NotBlank(message = "请选择联系方式类型")
    private String contactType;

    @NotBlank(message = "请填写联系方式")
    @Size(max = 64, message = "联系方式最长 64 字")
    private String contactValue;

    @NotNull(message = "请选择服务位置")
    private Double latitude;

    @NotNull(message = "请选择服务位置")
    private Double longitude;

    @Size(max = 200, message = "地址过长")
    private String address = "";

    @Size(max = 40, message = "城市名过长")
    private String city = "";
}
