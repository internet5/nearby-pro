const api = require('../../utils/api')
const imManager = require('../../utils/im/im-manager')
const { refreshChatBadge } = require('../../utils/badge')
const { formatChatTime } = require('../../utils/time')

Page({
  data: {
    toMe: [],   // 找我的（对方先开口的会话）
    fromMe: [], // 我发起的
    loading: true
  },

  onShow() {
    // 懒连接：进入本页才与 IM 网关握手（未登录时内部静默登录）
    imManager.ensureConnected().catch(() => {})
    this.loadSessions()
    // 在本页期间收到新消息即刷新列表（实时消息与对方状态变化都走这里）
    this.offIncoming = imManager.onIncoming(() => this.loadSessions())
  },

  onHide() {
    if (this.offIncoming) this.offIncoming()
  },

  onUnload() {
    if (this.offIncoming) this.offIncoming()
  },

  loadSessions() {
    api
      .chatSessions()
      .then((data) => {
        // 按会话方向分两组（组内仍按最新消息时间倒序）；「找我的」排前面
        const toMe = []
        const fromMe = []
        ;(data.list || []).forEach((s) => {
          const item = {
            ...s,
            timeText: s.lastTime ? formatChatTime(new Date(s.lastTime).getTime()) : ''
          }
          if (s.initiatedByMe) fromMe.push(item)
          else toMe.push(item)
        })
        this.setData({ toMe, fromMe, loading: false })
        refreshChatBadge()
      })
      .catch(() => this.setData({ loading: false }))
  },

  onOpenChat(e) {
    const d = e.currentTarget.dataset
    wx.navigateTo({
      url:
        '/pages/chat/index?peerId=' +
        d.peerId +
        '&nickname=' +
        encodeURIComponent(d.nickname || '') +
        '&avatarUrl=' +
        encodeURIComponent(d.avatarUrl || '')
    })
  }
})
