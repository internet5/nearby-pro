package com.nearby.pro.im;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * IM 网关配置（生产环境可用 IM_WEBSOCKET_PORT / IM_TCP_PORT 环境变量覆盖）
 */
@Data
@ConfigurationProperties(prefix = "im")
public class ImProperties {

    /** 是否启动 MobileIMSDK 网关（本地不需要聊天联调时可改 false） */
    private boolean enabled = true;

    /** WebSocket 网关端口：小程序端连接（握手路径固定 /websocket） */
    private int websocketPort = 3000;

    /** TCP 网关端口：留给官方开源 Java Demo 做联调对手端 */
    private int tcpPort = 8901;
}
