package com.nearby.pro.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Data
@ConfigurationProperties(prefix = "wx")
public class WxProperties {

    private String appId = "";
    private String secret = "";

    /** true 时不调微信真实接口，任意 code 换 openid = mock_{code}，本地联调用 */
    private boolean mock = true;

    /** 发布内容安全检测（msgSecCheck）开关，正式上线前必须改为 true */
    private boolean securityCheck = false;

    /** JWT 签名密钥，生产环境在 application-local.yml 覆盖为随机长串 */
    private String jwtSecret = "nearby-pro-dev-jwt-secret-0123456789abcdef";

    /** token 有效期（天） */
    private int jwtExpireDays = 30;
}
