package com.nearby.pro.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 腾讯云 COS 配置：与红包项目共用同一桶，Key 前缀用 nearby/ 隔离 */
@Data
@ConfigurationProperties(prefix = "tencent.cos")
public class CosProperties {

    private String secretId = "";
    private String secretKey = "";
    private String bucket = "";
    private String region = "";

    /** 拼接访问 URL 用的基础地址，如 https://bucket-appid.cos.ap-chengdu.myqcloud.com */
    private String baseUrl = "";
}
