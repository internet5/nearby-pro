package com.nearby.pro.im;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import net.x52im.mobileimsdk.server.ServerLauncher;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * IM 网关生命周期管理：Spring 上下文就绪后启动 Netty 网关，进程退出前释放。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ImServerRunner implements ApplicationRunner, DisposableBean {

    private final ImProperties properties;
    private final ImEventListener eventListener;

    private ServerLauncher launcher;

    @Override
    public void run(ApplicationArguments args) throws Exception {
        if (!properties.isEnabled()) {
            log.info("IM 网关未启用（im.enabled=false），跳过启动");
            return;
        }
        // MobileIMSDK 的网关端口在 ImServerLauncher 静态块里初始化，
        // 必须先写入系统属性、再首次引用该类触发类加载，顺序不能反
        System.setProperty("im.websocket.port", String.valueOf(properties.getWebsocketPort()));
        System.setProperty("im.tcp.port", String.valueOf(properties.getTcpPort()));
        launcher = new ImServerLauncher(eventListener);
        launcher.startup();
        log.info("IM 网关启动完成：WebSocket 端口 {}（握手路径 /websocket）、TCP 端口 {}",
                properties.getWebsocketPort(), properties.getTcpPort());
    }

    @Override
    public void destroy() {
        if (launcher != null) {
            launcher.shutdown();
        }
    }
}
