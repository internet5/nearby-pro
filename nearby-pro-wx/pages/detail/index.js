const api = require('../../utils/api')
const { formatDistance } = require('../../utils/geo')
const { askChatSubscribe } = require('../../utils/subscribe')
const { skillCard, DEFAULT_COVER } = require('../../utils/share')
const { fetchWalkingRoute } = require('../../utils/route')

// 举报理由：文案与后端 reason 枚举一一对应
const REPORT_REASONS = [
  { label: '虚假信息', value: 'fake' },
  { label: '垃圾广告', value: 'spam' },
  { label: '违法违规', value: 'illegal' },
  { label: '其他', value: 'other' }
]

Page({
  data: {
    item: null,
    missing: false,
    locMarkers: [],
    locPolylines: [],
    locIncludePoints: []
  },

  onLoad(query) {
    // 带上当前位置，后端换算距离；globalData.location 兜底为默认城市坐标
    const loc = getApp().globalData.location || {}
    const viewer = {}
    if (loc.latitude && loc.longitude) {
      viewer.viewerLatitude = loc.latitude
      viewer.viewerLongitude = loc.longitude
    }
    // 导航路线需要真实定位（起点）：拉一次精确定位，拿不到就不画线（保持只显示终点）
    this._myLocation = null
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this._myLocation = { latitude: res.latitude, longitude: res.longitude }
        this.applyRoute()
      },
      fail: () => {}
    })
    api
      .listingDetail(query.id, viewer)
      .then((item) => {
        const tags = item.tags || []
        const decorated = {
          ...item,
          tags,
          tagText: tags.join(' · '),
          distanceText: item.distance === null || item.distance === undefined
            ? ''
            : formatDistance(item.distance)
        }
        // 位置卡片的小地图标记：终点用「终」图标，起点待定位到位后由 applyRoute 补「起」
        const locMarkers = item.latitude && item.longitude
          ? [{
              id: 1,
              latitude: item.latitude,
              longitude: item.longitude,
              width: 26,
              height: 26,
              iconPath: '/assets/markers/end.png',
              anchor: { x: 0.5, y: 0.5 }
            }]
          : []
        this.setData({ item: decorated, missing: false, locMarkers }, () => this.applyRoute())
      })
      .catch(() => {
        // 失败原因（已删除/下架/封禁）已由请求层 toast，这里切到空态
        this.setData({ missing: true })
      })
  },

  // 小地图导航路线：定位到位后，优先拉腾讯步行路线（沿道路），拿不到就画直线虚线兜底
  applyRoute() {
    const item = this.data.item
    const my = this._myLocation
    if (!item || !my || !item.latitude || !item.longitude || this._routeApplied) return
    this._routeApplied = true
    // 追加起点「起」标记（id=2 与终点 id=1 区分）
    const markers = (this.data.locMarkers || []).concat([{
      id: 2,
      latitude: my.latitude,
      longitude: my.longitude,
      width: 26,
      height: 26,
      iconPath: '/assets/markers/start.png',
      anchor: { x: 0.5, y: 0.5 },
      zIndex: 10
    }])
    fetchWalkingRoute(my, item).then((route) => {
      // 有真实路线用真实路线（实线）；否则回退直线（虚线）提示「非真实路径」
      const points = route ? route.points : null
      const routePoints = points || [
        { latitude: my.latitude, longitude: my.longitude },
        { latitude: item.latitude, longitude: item.longitude }
      ]
      this.setData({
        locMarkers: markers,
        locPolylines: [{
          points: routePoints,
          color: '#3B82F6',
          width: 4,
          dottedLine: !points
        }],
        locIncludePoints: routePoints
      })
    })
  },

  onCopy() {
    const value = this.data.item.contactValue
    wx.setClipboardData({
      data: value,
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    })
  },

  onCall() {
    wx.makePhoneCall({ phoneNumber: this.data.item.contactValue })
  },

  // 预览技能图片（微信原生大图浏览，可左右滑动）
  onPreviewPhoto(e) {
    const item = this.data.item
    if (!item) return
    wx.previewImage({ current: e.currentTarget.dataset.src, urls: item.photoUrls || [] })
  },

  // 点地址或小地图，打开自建路线页：画「我→技能」的真实步行路线，底部可再跳原生导航
  onOpenLocation() {
    const item = this.data.item
    if (!item || !item.latitude || !item.longitude) return
    wx.navigateTo({
      url:
        '/pages/route/index?lat=' +
        item.latitude +
        '&lng=' +
        item.longitude +
        '&title=' +
        encodeURIComponent(item.title || '') +
        '&address=' +
        encodeURIComponent(item.address || '')
    })
  },

  // 联系TA：进入私聊页（懒连接，进聊天页才与 IM 网关握手）；
  // 带 listingId+技能名：聊天按「对方+技能」分会话，服务端首次咨询还会触发技能自动回复
  onChat() {
    const item = this.data.item
    if (!item || !item.userId) return
    // 顺带攒一条订阅消息授权额度（用户勾「总是允许」后静默累积）
    askChatSubscribe()
    wx.navigateTo({
      url:
        '/pages/chat/index?peerId=' +
        item.userId +
        '&nickname=' +
        encodeURIComponent(item.nickname || '') +
        '&avatarUrl=' +
        encodeURIComponent(item.avatarUrl || '') +
        '&listingId=' +
        (item.id || 0) +
        '&title=' +
        encodeURIComponent(item.title || '')
    })
  },

  // 收藏 / 取消收藏：按当前收藏态切换，成功后翻转星标
  onFavorite() {
    const item = this.data.item
    if (!item) return
    const favorited = !!item.isFavorited
    const call = favorited ? api.removeFavorite(item.id) : api.addFavorite(item.id)
    call
      .then(() => {
        this.setData({ 'item.isFavorited': !favorited })
        wx.showToast({ title: favorited ? '已取消收藏' : '已收藏，可在「我的」页查看', icon: 'none' })
      })
      .catch(() => {})
  },

  onShareAppMessage() {
    const item = this.data.item
    if (item) {
      // 落地到地图并聚焦这条技能，等价于在地图上点了它；封面用第一张图
      return skillCard({
        id: item.id,
        title: item.title,
        cover: (item.photoUrls || [])[0]
      })
    }
    return {
      title: '找附近的手艺人，上附近职人',
      path: '/pages/map/index',
      imageUrl: DEFAULT_COVER
    }
  },

  // 举报：选理由后提交，同一用户对同一条 24 小时只能举报一次
  onReport() {
    wx.showActionSheet({
      itemList: REPORT_REASONS.map((item) => item.label),
      success: (res) => {
        const reason = REPORT_REASONS[res.tapIndex]
        if (!reason || !this.data.item) return
        api
          .report(this.data.item.id, reason.value)
          .then(() => wx.showToast({ title: '已收到举报，我们会尽快处理', icon: 'none' }))
          .catch(() => {})
      }
    })
  },

  onOffline() {
    wx.showModal({
      title: '下架这条发布？',
      content: '下架后地图上不再显示，可重新发布。',
      success: (res) => {
        if (!res.confirm) return
        api
          .offlineListing(this.data.item.id)
          .then(() => {
            wx.showToast({ title: '已下架', icon: 'none' })
            setTimeout(() => wx.navigateBack(), 300)
          })
          .catch(() => {})
      }
    })
  }
})
