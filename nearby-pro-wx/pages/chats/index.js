const api = require('../../utils/api')
const imManager = require('../../utils/im/im-manager')
const { refreshChatBadge } = require('../../utils/badge')
const { formatChatTime } = require('../../utils/time')

Page({
  data: {
    sessions: [], // 会话列表（单列表，按最后聊天时间倒序）
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
        // 单列表：技能名（+方向标签）主导，用户名次要；按最后聊天时间倒序
        const sessions = (data.list || []).map((s) => ({
          ...s,
          key: s.peerId + ':' + (s.listingId || 0),
          timeText: s.lastTime ? formatChatTime(new Date(s.lastTime).getTime()) : '',
          // 方向：对方先开口=找我；我先开口=我找
          directionLabel: s.initiatedByMe ? '我找' : '找我',
          directionClass: s.initiatedByMe ? 'dir-out' : 'dir-in'
        }))
        sessions.sort((a, b) => {
          const ta = a.lastTime ? new Date(a.lastTime).getTime() : 0
          const tb = b.lastTime ? new Date(b.lastTime).getTime() : 0
          return tb - ta
        })
        this.setData({ sessions, loading: false })
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
        encodeURIComponent(d.avatarUrl || '') +
        '&listingId=' +
        (d.listingId || 0) +
        '&title=' +
        encodeURIComponent(d.title || '')
    })
  }
})
