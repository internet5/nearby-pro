// IM 业务粘合层：懒连接、收消息路由（当前聊天页）、发送状态翻转、全局收消息通知。
// 页面只与本模块交互，不直接碰 im-client。
// 懒连接策略：不在 app.onLaunch 连接，首次进入聊天相关页（聊天页/会话页）才握手，
// 连接保持常驻（收到消息才能实时提醒），主动断开仅 KICKOUT 时发生。
var protocal = require('./protocal')
var imClient = require('./im-client')
var request = require('../request')

// 当前打开的聊天页：{ peerId, onMessage }；离开页面置 null
var currentChat = null
// 全局收消息监听（会话列表页刷新用）：[fn(msg)]
var incomingCbs = []
// 连接状态监听（等 online 的内部用途 + 页面订阅）：[fn(status)]
var statusCbs = []

function fireIncoming(msg) {
  for (var i = 0; i < incomingCbs.length; i++) {
    try {
      incomingCbs[i](msg)
    } catch (e) {
      // 页面回调异常不影响其他订阅者
    }
  }
}

function dispatchStatus(s) {
  for (var i = 0; i < statusCbs.length; i++) {
    try {
      statusCbs[i](s)
    } catch (e) {
      // 忽略单个监听异常
    }
  }
}

// 等待连接在线（含首次握手与断线重连），超时 reject
function waitForOnline(timeoutMs) {
  if (imClient.isOnline()) {
    return Promise.resolve()
  }
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      var idx = statusCbs.indexOf(onStatus)
      if (idx >= 0) {
        statusCbs.splice(idx, 1)
      }
      reject(new Error('连接超时'))
    }, timeoutMs)
    function onStatus(s) {
      if (s !== 'online') {
        return
      }
      clearTimeout(timer)
      var idx = statusCbs.indexOf(onStatus)
      if (idx >= 0) {
        statusCbs.splice(idx, 1)
      }
      resolve()
    }
    statusCbs.push(onStatus)
  })
}

// 懒连接入口：确保已登录并在线。所有聊天相关页面 onLoad/onShow 调用
function ensureConnected() {
  return request
    .ensureLogin()
    .then(function (user) {
      if (!user || !user.userId) {
        throw new Error('未获取到用户信息')
      }
      imClient.connect(user.userId)
      return waitForOnline(10000).then(function () {
        return String(user.userId)
      })
    })
}

// 发送文本消息：返回 Promise<{fp, ok}>——ok=true 表示收到回执确认；
// ok=false 表示重试耗尽（消息可能实际已送达，fp 唯一约束保证不重复落库）。
// fp 可选：页面预生成指纹以便发送前就把气泡与回执绑定；缺省自动生成
function sendText(peerId, text, fp) {
  return ensureConnected().then(function (userId) {
    return new Promise(function (resolve) {
      var useFp = fp || protocal.genFp()
      var frame = protocal.buildSendText(userId, peerId, text, useFp)
      imClient.sendQos(
        frame,
        useFp,
        function () {
          resolve({ fp: useFp, ok: true })
        },
        function () {
          resolve({ fp: useFp, ok: false })
        }
      )
    })
  })
}

// 收消息路由：在当前聊天页则直接回调页面，同时广播全局通知
function handleIncoming(msg) {
  if (currentChat && currentChat.peerId === String(msg.from)) {
    try {
      currentChat.onMessage(msg)
    } catch (e) {
      // 页面渲染异常不影响全局通知
    }
  }
  fireIncoming(msg)
}

// 聊天页进入时注册（peerId 为对方用户 id）
function setCurrentChat(peerId, onMessage) {
  currentChat = { peerId: String(peerId), onMessage: onMessage }
}

// 离开聊天页时注销
function clearCurrentChat() {
  currentChat = null
}

// 订阅全局新消息（chats 页刷新列表）；返回注销函数
function onIncoming(cb) {
  incomingCbs.push(cb)
  return function () {
    var idx = incomingCbs.indexOf(cb)
    if (idx >= 0) {
      incomingCbs.splice(idx, 1)
    }
  }
}

// 订阅连接状态变化；返回注销函数
function onStatusChange(cb) {
  statusCbs.push(cb)
  return function () {
    var idx = statusCbs.indexOf(cb)
    if (idx >= 0) {
      statusCbs.splice(idx, 1)
    }
  }
}

function isOnline() {
  return imClient.isOnline()
}

// 模块加载即挂好回调（im-client 不反向依赖本模块）
imClient.setMessageHandler(handleIncoming)
imClient.setStatusHandler(dispatchStatus)

module.exports = {
  ensureConnected: ensureConnected,
  sendText: sendText,
  setCurrentChat: setCurrentChat,
  clearCurrentChat: clearCurrentChat,
  onIncoming: onIncoming,
  onStatusChange: onStatusChange,
  isOnline: isOnline
}
