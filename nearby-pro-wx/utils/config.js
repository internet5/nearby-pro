// 全局配置：接口地址与登录模式，按小程序版本自动区分环境，无需手动切换
// envVersion：develop = 开发版（开发者工具 / 真机预览）、trial = 体验版、release = 正式版
let envVersion = 'release'
try {
  envVersion = wx.getAccountInfoSync().miniProgram.envVersion
} catch (e) {
  // 取不到版本信息时按正式版处理（最保守）
}

const CONFIG = {
  // 开发版：本地后端联调；真机预览时把 localhost 换成电脑的局域网 IP（如 http://192.168.1.5:8080）
  develop: {
    BASE_URL: 'https://www.red-packet.com.cn',
    MOCK_LOGIN: true
  },
  // 体验版 / 正式版：连线上后端。前置：后端 WX_MOCK=false、域名备案通过、
  // mp 后台配好 request 合法域名（体验版同样强制校验合法域名，不能用 IP 或 http）
  trial: {
    BASE_URL: 'https://red-packet.com.cn',
    MOCK_LOGIN: false
  },
  release: {
    BASE_URL: 'https://www.red-packet.com.cn',
    MOCK_LOGIN: false
  }
}

module.exports = CONFIG[envVersion] || CONFIG.release
