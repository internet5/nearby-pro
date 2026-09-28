// 全局配置：接口地址（含 IM 长连接），按小程序版本自动区分环境，无需手动切换
// envVersion：develop = 开发版（开发者工具 / 真机预览）、trial = 体验版、release = 正式版
let envVersion = 'release'
try {
  envVersion = wx.getAccountInfoSync().miniProgram.envVersion
} catch (e) {
  // 取不到版本信息时按正式版处理（最保守）
}

const CONFIG = {
  // 开发版：本地后端联调；真机预览时把 localhost 换成电脑的局域网 IP（如 http://192.168.1.5:8080）
  // 连线上联调时 IM 走 nginx 443 反代（wss），不要直连 3000：
  // 小程序强制 wss + 合法域名，且安全组未对公网开放 3000
  develop: {
    //BASE_URL: 'http://127.0.0.1:8080',
    BASE_URL: 'https://www.red-packet.com.cn',
    // IM WebSocket 长连接（MobileIMSDK 网关，握手路径 /websocket 必须带上）
    // 本地后端联调时用：IM_WS_URL: 'ws://127.0.0.1:3000/websocket'（开发者工具勾「不校验合法域名」）
    //IM_WS_URL: 'ws://127.0.0.1:3000/websocket',
    IM_WS_URL: 'wss://www.red-packet.com.cn/websocket'
  },
  // 体验版 / 正式版：连线上后端。前置：域名备案通过、
  // mp 后台配好 request 合法域名（体验版同样强制校验合法域名，不能用 IP 或 http）、
  // socket 合法域名加 wss://www.red-packet.com.cn
  trial: {
    BASE_URL: 'https://www.red-packet.com.cn',
    IM_WS_URL: 'wss://www.red-packet.com.cn/websocket'
  },
  release: {
    BASE_URL: 'https://www.red-packet.com.cn',
    IM_WS_URL: 'wss://www.red-packet.com.cn/websocket'
  }
}

// 聊天离线提醒的订阅消息模板 id（三环境相同；与后端 wx.subscribe-template-id 保持一致。
// 一次性订阅：用户允许一次可发一条，每次发送消息时静默攒授权额度）
const SUBSCRIBE_TMPL_ID = '0fA2jnuqS0NcYNtvPjFYugBtz3lg0J-PVAdZA07hpNU'

module.exports = {
  ...CONFIG[envVersion],
  SUBSCRIBE_TMPL_ID
}
