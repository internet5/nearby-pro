// 订阅消息授权：聊天离线提醒（微信「服务通知」）。
// 一次性订阅机制：用户允许一次 = 服务端可下发一条；用户勾选「总是保持以上选择」后
// 后续调用不再弹窗、静默累积授权额度，因此放在「联系TA」「发送」等点击行为里每次调用。
// 必须在用户点击回调内调用（微信限制），失败/拒绝一律静默，不打扰聊天主流程。
const { SUBSCRIBE_TMPL_ID } = require('./config')

function askChatSubscribe() {
  if (!SUBSCRIBE_TMPL_ID || !wx.requestSubscribeMessage) {
    return
  }
  wx.requestSubscribeMessage({
    tmplIds: [SUBSCRIBE_TMPL_ID],
    success: (res) => {
      // accept=已授权（额度+1）；reject=本次拒绝（服务端推送会 43101 静默失败）
      if (res[SUBSCRIBE_TMPL_ID] !== 'accept') {
        console.log('订阅消息未授权', res.errMsg || '')
      }
    },
    fail: () => {}
  })
}

module.exports = { askChatSubscribe }
