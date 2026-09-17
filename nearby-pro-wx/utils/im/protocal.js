// MobileIMSDK 协议帧构造层：与服务端 Protocal 的 JSON 字段严格对齐（字段名大小写敏感，
// 服务端 gson 按字段名反序列化）：
//   type(int) dataContent(String) from/to/fp(String) QoS(boolean，大写Q开头)
//   typeu(int) bridge(boolean) sm(long)
// undefined 的字段 JSON.stringify 不输出，与服务端 gson 忽略 null 字段的行为一致

// ===== 客户端 -> 服务端 type 常量（与服务端 ProtocalType.C.S* 一致）=====
var TYPE_LOGIN = 0 // 登录首包
var TYPE_KEEP_ALIVE = 1 // 心跳
var TYPE_COMMON_DATA = 2 // C2C 数据消息
var TYPE_LOGOUT = 3 // 登出
var TYPE_RECIVED = 4 // QoS 回执 ACK（dataContent = 被确认消息的 fp）

// ===== 服务端 -> 客户端 type 常量（ProtocalType.S.C2S*）=====
var S2C_RESPONSE_LOGIN = 50 // 登录响应 dataContent = {"code":0,"firstLoginTime":...}
var S2C_RESPONSE_KEEP_ALIVE = 51 // 心跳响应
var S2C_RESPONSE_FOR_ERROR = 52 // 错误响应
var S2C_RESPONSE_ECHO = 53
var S2C_KICKOUT = 54 // 被顶号/踢出

// ===== 错误码 =====
var ERROR_CODE_OK = 0 // 登录成功
var ERROR_CODE_NO_LOGIN = 1 // 未登录（服务端随即断连）
// 本项目自定义错误码从 1025 起（与服务端 AuthInterceptor 区间约定一致）
var ERROR_LOGIN_VERIFY_FAILED = 1025 // JWT 校验失败 -> 需 forceLogin 重试

// ===== 消息业务类型（Protocal.typeu 透传落库）=====
var TYPEU_TEXT = 1 // 文本消息（typeu=-1 表示未设置）

// 生成消息指纹 fp：时间戳 + 随机串。
// 客户端 QoS 包必须自带 fp（服务端不会为客户端消息代生成），全局唯一即可
function genFp() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}

// 构造协议帧并序列化。参数与 Protocal 字段一一对应
function buildProtocal(type, dataContent, qos, fp, from, to, typeu, bridge) {
  var p = {
    type: type,
    dataContent: dataContent === undefined ? null : dataContent,
    QoS: !!qos
  }
  if (fp) {
    p.fp = fp
  }
  if (from) {
    p.from = String(from)
  }
  if (to) {
    p.to = String(to)
  }
  if (typeu !== undefined && typeu !== null) {
    p.typeu = typeu
  }
  if (bridge) {
    p.bridge = bridge
  }
  return JSON.stringify(p)
}

// 登录首包：dataContent 是内层 JSON（字段名与服务端 LoginInfoOutDto 对齐），to 固定 "0"
function buildLogin(userId, token) {
  var inner = JSON.stringify({
    loginUserId: String(userId),
    loginToken: token,
    extra: '',
    firstLoginTime: 0
  })
  return buildProtocal(TYPE_LOGIN, inner, false, genFp(), String(userId), '0')
}

// 心跳包
function buildKeepAlive() {
  return buildProtocal(TYPE_KEEP_ALIVE, null, false)
}

// C2C 文本消息（QoS 可靠传输，等接收方/服务端伪应答回执）。
// fp 可选：外部先 genFp() 拿到指纹再传入，便于发送方匹配回执；缺省自动生成
function buildSendText(fromUserId, toUserId, text, fp) {
  return buildProtocal(
    TYPE_COMMON_DATA,
    text,
    true,
    fp || genFp(),
    String(fromUserId),
    String(toUserId),
    TYPEU_TEXT
  )
}

// QoS 回执：收到 isQoS=true 的消息后必须回（dataContent = 其 fp），否则服务端会重发
function buildRecived(fromUserId, fp) {
  return buildProtocal(TYPE_RECIVED, fp, false, null, String(fromUserId), '0')
}

// 登出
function buildLogout(userId) {
  return buildProtocal(TYPE_LOGOUT, null, false, genFp(), String(userId), '0')
}

module.exports = {
  TYPE_LOGIN: TYPE_LOGIN,
  TYPE_KEEP_ALIVE: TYPE_KEEP_ALIVE,
  TYPE_COMMON_DATA: TYPE_COMMON_DATA,
  TYPE_LOGOUT: TYPE_LOGOUT,
  TYPE_RECIVED: TYPE_RECIVED,
  S2C_RESPONSE_LOGIN: S2C_RESPONSE_LOGIN,
  S2C_RESPONSE_KEEP_ALIVE: S2C_RESPONSE_KEEP_ALIVE,
  S2C_RESPONSE_FOR_ERROR: S2C_RESPONSE_FOR_ERROR,
  S2C_RESPONSE_ECHO: S2C_RESPONSE_ECHO,
  S2C_KICKOUT: S2C_KICKOUT,
  ERROR_CODE_OK: ERROR_CODE_OK,
  ERROR_CODE_NO_LOGIN: ERROR_CODE_NO_LOGIN,
  ERROR_LOGIN_VERIFY_FAILED: ERROR_LOGIN_VERIFY_FAILED,
  TYPEU_TEXT: TYPEU_TEXT,
  genFp: genFp,
  buildProtocal: buildProtocal,
  buildLogin: buildLogin,
  buildKeepAlive: buildKeepAlive,
  buildSendText: buildSendText,
  buildRecived: buildRecived,
  buildLogout: buildLogout
}
