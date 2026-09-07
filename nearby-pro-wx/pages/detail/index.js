const api = require('../../utils/api')
const { formatDistance } = require('../../utils/geo')

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
    remainDays: null
  },

  onLoad(query) {
    // 带上当前位置，后端换算距离；globalData.location 兜底为默认城市坐标
    const loc = getApp().globalData.location || {}
    const viewer = {}
    if (loc.latitude && loc.longitude) {
      viewer.viewerLatitude = loc.latitude
      viewer.viewerLongitude = loc.longitude
    }
    api
      .listingDetail(query.id, viewer)
      .then((item) => {
        const tags = item.tags || []
        const items = item.items || []
        const decorated = {
          ...item,
          tags,
          items,
          tagText: tags.join(' · '),
          itemText: items.map((g) => (g.names || []).join('、')).filter(Boolean).join('；'),
          distanceText: item.distance === null || item.distance === undefined
            ? ''
            : formatDistance(item.distance)
        }
        // 位置卡片的小地图标记，用分类图标与地图页保持一致
        const locMarkers = item.latitude && item.longitude
          ? [{
              id: 1,
              latitude: item.latitude,
              longitude: item.longitude,
              width: 28,
              height: 36,
              iconPath: `/assets/markers/${item.categoryCode || 'other'}.png`,
              anchor: { x: 0.5, y: 1 }
            }]
          : []
        // 有效期剩余天数，向上取整；仅上架中的发布展示
        const remainDays = item.expireTime
          ? Math.max(0, Math.ceil((new Date(item.expireTime).getTime() - Date.now()) / 86400000))
          : null
        this.setData({ item: decorated, missing: false, locMarkers, remainDays })
      })
      .catch(() => {
        // 失败原因（已删除/下架/封禁）已由请求层 toast，这里切到空态
        this.setData({ missing: true })
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

  // 点地址或小地图，打开微信原生位置页，可缩放、看周边
  onOpenLocation() {
    const item = this.data.item
    if (!item || !item.latitude || !item.longitude) return
    wx.openLocation({
      latitude: item.latitude,
      longitude: item.longitude,
      name: item.title,
      address: item.address || '',
      scale: 18
    })
  },

  onShareAppMessage() {
    const item = this.data.item
    if (item) {
      return {
        title: `「${item.title}」｜${item.categoryName}师傅就在附近`,
        path: `/pages/detail/index?id=${item.id}`
      }
    }
    return {
      title: '找附近的手艺人，上附近职人',
      path: '/pages/map/index'
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
