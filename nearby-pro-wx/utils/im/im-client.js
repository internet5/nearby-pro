// MobileIMSDK WebSocket 连接层（wx.connectSocket 封装）。
// 只负责：连接握手（登录首包/响应）、心跳、QoS 发送重试与回执匹配、断线重连、fp 去重。
// 业务分发（当前聊天页路由、状态订阅）在 im-manager.js。
// 注意：本项目小程序端无转译（es6:false），禁用 ?. / ?? / async-await，全部 Promise 链
var protocal = require('./protocal')
var config = require('../config')

// 心跳间隔 8s：服务端 SenseModeWebsocket.MODE_10S 下读超时 15s（间隔*1+5），8s 留足余量
var HEARTBEAT_INTERVAL = 8000
// QoS 发送：3s 没等到回执就重发同一帧，最多 5 次后放弃回调失败
// （服务端 fp 唯一索引保证重复发送不会重复落库，属最终一致）
var QOS_RETRY_INTERVAL = 3000
var QOS_RETRY_MAX = 5
// 重连退避序列（ms），用完封顶 60s；登录成功后清零
var RETRY_DELAYS = [2000, 4000, 8000, 15000]
var RETRY_MAX_DELAY = 60000
// 收消息 fp 去重容量（简单 LRU：命中即移到队尾，超限淘汰队首）
var DEDUP_MAX = 200

// 连接状态：idle 未连 / connecting 握手中 / online 在线 / closed 已断开
var state = {
  status: 'idle',
  task: null,
  userId: null,
  active: false, // 是否需要维持连接（主动 close 置 false，不再重连）
  retryCount: 0,
  retryTimer: null,
  heartbeatTimer: null,
  // QoS 待确认队列：fp -> { frame, onAck, onFail, timer, tries }
  qosPending: {},
  // 本次连接内登录尝试次数（防 1025 死循环：token 持续校验失败时放弃等待重连）
  loginTries: 0,
  // 收到消息的 fp 去重队列
  dedupKeys: [],
  // 业务层回调（im-manager 注入）
  onMessage: null,
  onStatusChange: null,
  firstLoginTime: 0
}

function setStatus(s) {
  if (state.status === s) {
    return
  }
  state.status = s
  if (state.onStatusChange) {
    state.onStatusChange(s)
  }
}

// ============ 收发底层 ============

function sendFrame(text) {
  var task = state.task
  if (!task) {
    return false
  }
  try {
    task.send({ data: text })
    return true
  } catch (e) {
    return false
  }
}

// 发送 QoS 帧并等回执：fp 匹配的 type=4 回执到达（含服务端对方离线时的伪应答）即成功
function sendQos(frame, fp, onAck, onFail) {
  state.qosPending[fp] = { frame: frame, onAck: onAck, onFail: onFail, timer: null, tries: 0 }
  fireQos(fp)
}

// 首发与重发共用：发帧 + 启动超时计时
function fireQos(fp) {
  var item = state.qosPending[fp]
  if (!item) {
    return
  }
  item.tries += 1
  sendFrame(item.frame)
  if (item.timer) {
    clearTimeout(item.timer)
  }
  item.timer = setTimeout(function () {
    var cur = state.qosPending[fp]
    if (!cur) {
      return
    }
    if (cur.tries < QOS_RETRY_MAX) {
      fireQos(fp)
    } else {
      delete state.qosPending[fp]
      if (cur.onFail) {
        cur.onFail()
      }
    }
  }, QOS_RETRY_INTERVAL)
}

// 收到 type=4 回执：匹配待确认队列，成功清理
function handleAck(fp) {
  var item = state.qosPending[fp]
  if (!item) {
    return
  }
  delete state.qosPending[fp]
  if (item.timer) {
    clearTimeout(item.timer)
  }
  if (item.onAck) {
    item.onAck()
  }
}

function clearQosPending() {
  var fps = Object.keys(state.qosPending)
  for (var i = 0; i < fps.length; i++) {
    var item = state.qosPending[fps[i]]
    if (item.timer) {
      clearTimeout(item.timer)
    }
    if (item.onFail) {
      item.onFail()
    }
  }
  state.qosPending = {}
}

// ============ fp 去重 ============

function isDuplicated(fp) {
  var idx = state.dedupKeys.indexOf(fp)
  if (idx >= 0) {
    // LRU：命中移到队尾
    state.dedupKeys.splice(idx, 1)
    state.dedupKeys.push(fp)
    return true
  }
  state.dedupKeys.push(fp)
  if (state.dedupKeys.length > DEDUP_MAX) {
    state.dedupKeys.shift()
  }
  return false
}

// ============ 心跳 ============

function startHeartbeat() {
  stopHeartbeat()
  state.heartbeatTimer = setInterval(function () {
    sendFrame(protocal.buildKeepAlive())
  }, HEARTBEAT_INTERVAL)
}

function stopHeartbeat() {
  if (state.heartbeatTimer) {
    clearInterval(state.heartbeatTimer)
    state.heartbeatTimer = null
  }
}

// ============ 登录握手 ============

// 发登录首包（token 实时从 storage 取，重连后自动用最新 token）
// 注意：不在这里重置 loginTries——1025 重登后的重发也走本函数，重置会破坏防死循环计数
function sendLoginFrame() {
  var token = require('../request').getToken()
  if (!token) {
    return false
  }
  sendFrame(protocal.buildLogin(state.userId, token))
  return true
}

// 登录响应处理
function handleLoginResponse(dataContent) {
  var code = null
  try {
    var inner = JSON.parse(dataContent || '{}')
    code = inner.code
    state.firstLoginTime = inner.firstLoginTime || 0
  } catch (e) {
    code = null
  }
  if (code !== protocal.ERROR_CODE_OK) {
    // token 失效：清登录态重登一次再握手（每次连接最多重试 3 次，防 1025 死循环）
    if (code === protocal.ERROR_LOGIN_VERIFY_FAILED && state.loginTries < 3) {
      state.loginTries += 1
      require('../request')
        .forceLogin()
        .then(function (user) {
          if (user && user.userId) {
            state.userId = String(user.userId)
            if (state.status !== 'connecting') {
              return
            }
            sendLoginFrame()
          }
        })
        .catch(function () {
          setStatus('closed')
          teardownTask()
        })
      return
    }
    // 其他错误码或重试耗尽：服务端会随即断连，交给 onClose 重连
    return
  }
  // 登录成功：启心跳、清重连计数、恢复待发队列
  state.retryCount = 0
  setStatus('online')
  startHeartbeat()
  var fps = Object.keys(state.qosPending)
  for (var i = 0; i < fps.length; i++) {
    fireQos(fps[i])
  }
}

// ============ 消息分发 ============

function handleRawText(text) {
  var p = null
  try {
    p = JSON.parse(text)
  } catch (e) {
    return
  }
  if (!p || typeof p.type !== 'number') {
    return
  }
  if (p.type === protocal.S2C_RESPONSE_LOGIN) {
    handleLoginResponse(p.dataContent)
    return
  }
  if (p.type === protocal.S2C_RESPONSE_KEEP_ALIVE) {
    return
  }
  if (p.type === protocal.TYPE_RECIVED) {
    handleAck(p.dataContent)
    return
  }
  if (p.type === protocal.S2C_KICKOUT) {
    // 被顶号：主动断开且不重连（下次进聊天页会重新握手）
    close()
    return
  }
  if (p.type === protocal.TYPE_COMMON_DATA) {
    if (p.QoS && p.fp) {
      // 回执优先：无论是否重复都先回 ACK，抑制服务端重发
      sendFrame(protocal.buildRecived(state.userId, p.fp))
      if (isDuplicated(p.fp)) {
        return
      }
    }
    if (state.onMessage) {
      state.onMessage({
        from: p.from,
        to: p.to,
        content: p.dataContent,
        typeu: p.typeu,
        fp: p.fp
      })
    }
  }
}

// ============ 连接管理 ============

function teardownTask() {
  var task = state.task
  state.task = null
  if (!task) {
    return
  }
  try {
    task.close({})
  } catch (e) {
    // 已断开时 close 可能报错，忽略
  }
}

function cleanupOnDrop() {
  stopHeartbeat()
  clearQosPending()
}

// 断线重连：指数退避 2/4/8/15s 封顶 60s；仅 active（用户仍需要长连接）时重连
function scheduleReconnect() {
  if (!state.active || state.retryTimer) {
    return
  }
  var delay =
    state.retryCount < RETRY_DELAYS.length ? RETRY_DELAYS[state.retryCount] : RETRY_MAX_DELAY
  state.retryCount += 1
  state.retryTimer = setTimeout(function () {
    state.retryTimer = null
    if (state.active) {
      doConnect()
    }
  }, delay)
}

function doConnect() {
  if (state.task) {
    teardownTask()
  }
  state.loginTries = 0 // 每次新连接重新计数，同一次握手中的 1025 重登最多 3 次
  setStatus('connecting')
  var task = wx.connectSocket({
    url: config.IM_WS_URL,
    fail: function () {
      // 域名不合法/网络失败等：走重连退避
      setStatus('closed')
      scheduleReconnect()
    }
  })
  if (!task) {
    // 个别基础库 connectSocket 同步失败不进 fail 回调
    setStatus('closed')
    scheduleReconnect()
    return
  }
  state.task = task
  task.onOpen(function () {
    // 握手路径 /websocket 已在 URL 中，onOpen 后直接发登录首包
    if (!sendLoginFrame()) {
      // 无 token：让 request 层静默登录后再发
      require('../request')
        .ensureLogin()
        .then(function (user) {
          if (state.status !== 'connecting' || !state.task) {
            return
          }
          if (user && user.userId) {
            state.userId = String(user.userId)
          }
          sendLoginFrame()
        })
        .catch(function () {
          setStatus('closed')
          teardownTask()
          scheduleReconnect()
        })
    }
  })
  task.onMessage(function (res) {
    handleRawText(res.data)
  })
  task.onError(function () {
    // onError 后通常紧跟 onClose，重连统一在 onClose 触发；这里只兜底清理
  })
  task.onClose(function () {
    if (state.task !== task) {
      // 旧连接的遗留回调，忽略
      return
    }
    state.task = null
    cleanupOnDrop()
    if (!state.active) {
      setStatus('closed')
      return
    }
    setStatus('closed')
    scheduleReconnect()
  })
}

// 建立连接并完成登录握手（幂等：已在线/正在握手时重复调用无副作用）
function connect(userId) {
  if (state.status === 'online' || state.status === 'connecting') {
    state.active = true
    return
  }
  state.active = true
  state.userId = userId ? String(userId) : state.userId
  state.retryCount = 0
  doConnect()
}

// 主动断开（离开聊天相关页也不断——保持在线收消息；只在明确不需要时调用）
function close() {
  state.active = false
  if (state.retryTimer) {
    clearTimeout(state.retryTimer)
    state.retryTimer = null
  }
  cleanupOnDrop()
  setStatus('closed')
  teardownTask()
}

// 当前是否在线（聊天页发送前判断）
function isOnline() {
  return state.status === 'online'
}

function getStatus() {
  return state.status
}

// 注入业务回调（im-manager 在模块加载时调用，避免反向依赖）
function setMessageHandler(cb) {
  state.onMessage = cb
}

function setStatusHandler(cb) {
  state.onStatusChange = cb
}

module.exports = {
  connect: connect,
  close: close,
  isOnline: isOnline,
  getStatus: getStatus,
  sendQos: sendQos,
  setMessageHandler: setMessageHandler,
  setStatusHandler: setStatusHandler
}
