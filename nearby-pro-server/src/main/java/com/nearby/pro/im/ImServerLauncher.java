package com.nearby.pro.im;

import net.x52im.mobileimsdk.server.ServerLauncher;
import net.x52im.mobileimsdk.server.event.MessageQoSEventListenerS2C;
import net.x52im.mobileimsdk.server.event.ServerEventListener;
import net.x52im.mobileimsdk.server.network.Gateway;
import net.x52im.mobileimsdk.server.network.GatewayTCP;
import net.x52im.mobileimsdk.server.network.GatewayWebsocket;
import net.x52im.mobileimsdk.server.utils.ServerToolKits;
import net.x52im.mobileimsdk.server.utils.ServerToolKits.SenseModeWebsocket;

import java.io.IOException;

/**
 * MobileIMSDK 服务端启动器：只开 WebSocket + TCP 两个网关（UDP 关闭）。
 * <p>
 * MobileIMSDK 的网关端口等配置都在类的静态块里初始化，无法走 Spring 注入，
 * 因此端口通过 System.setProperty 传入（由 {@link ImServerRunner} 保证先设属性再触发本类加载）。
 */
public class ImServerLauncher extends ServerLauncher {

    static {
        // WebSocket 网关：小程序端走这里（握手路径固定 /websocket）
        GatewayWebsocket.PORT = Integer.getInteger("im.websocket.port", 3000);
        // TCP 网关：官方开源 Java Demo 联调对手端走这里
        GatewayTCP.PORT = Integer.getInteger("im.tcp.port", 8901);
        // 按位开启 WebSocket + TCP 网关（关闭 UDP）
        ServerLauncher.supportedGateways = Gateway.SOCKET_TYPE_WEBSOCKET | Gateway.SOCKET_TYPE_TCP;
        // 心跳模式 10S：服务端读超时 = 10s + 5s 链路容忍；小程序端心跳间隔配 8s 与之配套
        ServerToolKits.setSenseModeWebsocket(SenseModeWebsocket.MODE_10S);
        // 单机部署，关闭与 MobileIMSDK-Web 的 MQ 互通桥接
        ServerLauncher.bridgeEnabled = false;
    }

    private final ServerEventListener eventListener;

    public ImServerLauncher(ServerEventListener eventListener) throws IOException {
        super();
        this.eventListener = eventListener;
    }

    @Override
    protected void initListeners() {
        this.setServerEventListener(eventListener);
        this.setServerMessageQoSEventListener(new ImQosEventListener());
    }

    /** 服务端主动发送消息的 QoS 事件回调（本期 S2C 只用于日志观测） */
    static class ImQosEventListener implements MessageQoSEventListenerS2C {

        @Override
        public void messagesLost(java.util.ArrayList<net.x52im.mobileimsdk.server.protocal.Protocal> lostMessages) {
            // QoS 判定无法实时送达的消息（离线场景已落库兜底，这里仅观测）
        }

        @Override
        public void messagesBeReceived(String theFingerPrint) {
            // 接收方回执了某条消息的 fp（可用于后续“已送达”展示，本期忽略）
        }
    }
}
