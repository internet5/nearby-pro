const api = require('../../utils/api')
const { getUserInfo } = require('../../utils/request')
const imManager = require('../../utils/im/im-manager')
const protocal = require('../../utils/im/protocal')
const { formatChatTime } = require('../../utils/time')

// 相邻消息间隔超过 5 分钟时插入时间提示条
const TIME_GAP = 5 * 60 * 1000

Page({
  data: {
    peer: { id: null, nickname: '', avatarUrl: '' },
    messages: [], // {fp, mine, content, status, ts, timeText} status: sending/sent/failed/received
    scrollInto: '',
    input: '',
    loading: true,
    hasMore: false,
    noMore: false
  },

  // 页面实例属性（不进 data）：fp -> messages 下标，用于去重与状态定位
  fpIndex: {},
  nextCursor: 0,
  historyLoading: false,

  onLoad(query) {
    const peerId = Number(query.peerId)
    const nickname = decodeURIComponent(query.nickname || '')
    if (nickname) wx.setNavigationBarTitle({ title: nickname })
    this.setData({
      peer: { id: peerId, nickname, avatarUrl: decodeURIComponent(query.avatarUrl || '') }
    })
    // 懒连接 + 注册当前聊天页收消息回调
    imManager.ensureConnected().catch(() => {})
    imManager.setCurrentChat(peerId, (msg) => this.onReceive(msg))
    this.loadHistory(0)
  },

  onShow() {
    imManager.ensureConnected().catch(() => {})
    if (this.data.peer.id) {
      // 从其他页面回来重新注册回调（setCurrentChat 指向本页）
      imManager.setCurrentChat(this.data.peer.id, (msg) => this.onReceive(msg))
      // 已有消息时重拉首页并按 fp 合并，兜底离线期间错过的实时消息
      if (this.data.messages.length) this.loadHistory(0, true)
    }
  },

  onHide() {
    this.markRead()
  },

  onUnload() {
    this.markRead()
    imManager.clearCurrentChat()
  },

  // 标记会话已读：进页/收消息/离开时上报，失败静默
  markRead() {
    const peerId = this.data.peer.id
    if (!peerId) return
    api.chatMarkRead(peerId).catch(() => {})
  },

  // 拉取历史：cursor=0 首页（后端把 <=0 当首页）；merge=true 时与现有消息按 fp 合并
  loadHistory(cursor, merge) {
    if (this.historyLoading) return
    this.historyLoading = true
    api
      .chatMessages(this.data.peer.id, cursor)
      .then((data) => {
        this.historyLoading = false
        const me = String((getUserInfo() || {}).userId || '')
        // 后端已按时间正序返回（旧→新），直接渲染即可
        const rows = data.list || []
        const fresh = []
        for (let i = 0; i < rows.length; i++) {
          const m = rows[i]
          if (this.fpIndex[m.fp] !== undefined) continue
          fresh.push({
            fp: m.fp,
            mine: String(m.from) === me,
            content: m.content,
            status: 'received',
            ts: new Date(m.createTime).getTime(),
            timeText: ''
          })
        }
        const hasMore = !!data.hasMore
        this.nextCursor = data.nextCursor || 0
        let messages
        let scrollInto = this.data.scrollInto
        if (merge && this.data.messages.length) {
          // 合并模式：fp 为键去重后按时间排序（发送中/失败的本地状态保留）
          const byFp = {}
          const old = this.data.messages
          for (let i = 0; i < old.length; i++) byFp[old[i].fp] = old[i]
          for (let i = 0; i < fresh.length; i++) {
            if (!byFp[fresh[i].fp]) byFp[fresh[i].fp] = fresh[i]
          }
          messages = Object.keys(byFp)
            .map((k) => byFp[k])
            .sort((a, b) => a.ts - b.ts)
        } else if (merge) {
          messages = fresh
        } else {
          messages = fresh
        }
        messages = this.withTimeHints(messages)
        this.rebuildFpIndex(messages)
        // 首屏与合并出新消息时滚到底部；加载更早时保持视角（见 onScrollUpper 传锚点）
        if (messages.length && (this.data.scrollInto === '' || !merge)) {
          scrollInto = 'm-' + (messages.length - 1)
        }
        this.setData({ messages, loading: false, hasMore, noMore: !hasMore, scrollInto })
        if (!cursor) this.markRead()
      })
      .catch(() => {
        this.historyLoading = false
        this.setData({ loading: false })
      })
  },

  // 滚到顶部加载更早：prepend 后把 scrollInto 定位到加载前的第一条，避免视角跳动
  onScrollUpper() {
    if (!this.data.hasMore || this.historyLoading) return
    const oldFirstFp = this.data.messages.length ? this.data.messages[0].fp : null
    api
      .chatMessages(this.data.peer.id, this.nextCursor)
      .then((data) => {
        const me = String((getUserInfo() || {}).userId || '')
        // 后端已按时间正序返回（旧→新），prepend 到现有消息前面
        const rows = data.list || []
        const fresh = []
        for (let i = 0; i < rows.length; i++) {
          const m = rows[i]
          if (this.fpIndex[m.fp] !== undefined) continue
          fresh.push({
            fp: m.fp,
            mine: String(m.from) === me,
            content: m.content,
            status: 'received',
            ts: new Date(m.createTime).getTime(),
            timeText: ''
          })
        }
        const hasMore = !!data.hasMore
        this.nextCursor = data.nextCursor || 0
        const messages = this.withTimeHints(fresh.concat(this.data.messages))
        this.rebuildFpIndex(messages)
        let scrollInto = this.data.scrollInto
        if (oldFirstFp) {
          const idx = messages.findIndex((m) => m.fp === oldFirstFp)
          if (idx >= 0) scrollInto = 'm-' + idx
        }
        this.setData({ messages, hasMore, noMore: !hasMore, scrollInto })
      })
      .catch(() => {})
  },

  // 给相邻间隔超过 TIME_GAP 的消息打时间提示
  withTimeHints(messages) {
    let prev = 0
    return messages.map((m) => {
      const show = m.ts - prev > TIME_GAP
      prev = m.ts
      return { ...m, timeText: show ? formatChatTime(m.ts) : '' }
    })
  },

  rebuildFpIndex(messages) {
    this.fpIndex = {}
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].fp) this.fpIndex[messages[i].fp] = i
    }
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  onSend() {
    const text = (this.data.input || '').trim()
    if (!text) return
    if (text.length > 500) {
      wx.showToast({ title: '消息太长，请分条发送', icon: 'none' })
      return
    }
    // 预生成 fp：发送前就把气泡与回执绑定，resolve 后按 fp 翻转状态
    const fp = protocal.genFp()
    const m = { fp, mine: true, content: text, status: 'sending', ts: Date.now(), timeText: '' }
    const messages = this.withTimeHints(this.data.messages.concat([m]))
    this.rebuildFpIndex(messages)
    this.setData({ messages, input: '', scrollInto: 'm-' + this.fpIndex[fp] })
    this.doSend(fp, text)
  },

  doSend(fp, text) {
    imManager
      .sendText(this.data.peer.id, text, fp)
      .then((res) => {
        const idx = this.fpIndex[fp]
        if (idx === undefined) return
        this.setData({ ['messages[' + idx + '].status']: res.ok ? 'sent' : 'failed' })
      })
      .catch(() => {
        // 连接超时等异常：翻转为失败态，可点击重发
        const idx = this.fpIndex[fp]
        if (idx === undefined) return
        this.setData({ ['messages[' + idx + '].status']: 'failed' })
      })
  },

  // 点击失败气泡重发（同 fp：服务端唯一约束保证不会重复落库）
  onResend(e) {
    const fp = e.currentTarget.dataset.fp
    const idx = this.fpIndex[fp]
    if (idx === undefined) return
    const msg = this.data.messages[idx]
    if (!msg || msg.status === 'sending') return
    this.setData({ ['messages[' + idx + '].status']: 'sending' })
    this.doSend(fp, msg.content)
  },

  // 实时消息到达（im-manager 路由）：fp 去重后追加并滚到底
  onReceive(msg) {
    if (!msg.fp || this.fpIndex[msg.fp] !== undefined) return
    const me = String((getUserInfo() || {}).userId || '')
    const m = {
      fp: msg.fp,
      mine: String(msg.from) === me,
      content: msg.content,
      status: 'received',
      ts: Date.now(),
      timeText: ''
    }
    const messages = this.withTimeHints(this.data.messages.concat([m]))
    this.rebuildFpIndex(messages)
    this.setData({ messages, scrollInto: 'm-' + (messages.length - 1) })
    this.markRead()
  }
})
