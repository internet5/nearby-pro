package com.nearby.pro.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "wx")
public class WxProperties {

    private String appId = "";
    private String secret = "";

    /** 发布内容安全检测（msgSecCheck）开关，正式上线前必须改为 true */
    private boolean securityCheck = false;

    /** JWT 签名密钥，生产环境在 application-local.yml 覆盖为随机长串 */
    private String jwtSecret = "nearby-pro-dev-jwt-secret-0123456789abcdef";

    /** token 有效期（天） */
    private int jwtExpireDays = 30;

    /** 订阅消息模板 id（聊天离线提醒），mp 后台申请；留空则不推送 */
    private String subscribeTemplateId = "";
}
