// 全局配置：接口地址与登录模式
module.exports = {
  // 后端接口地址：开发者工具用 localhost；真机预览改成电脑的局域网 IP（如 http://192.168.1.5:8080）
  BASE_URL: 'http://localhost:8080',

  // 登录模式开关：
  // true  = 本地联调：登录 code 用本机持久化的随机 ID（后端 wx.mock=true 时 openid 稳定，不会每次登录变成新用户）
  // false = 正式环境：登录 code 用 wx.login 的真实 code（后端需同步关掉 wx.mock）
  MOCK_LOGIN: true
}
