const { fetchWalkingRoute } = require('../../utils/route')
const { formatDistance } = require('../../utils/geo')

// 起/终点标记：assets/markers/start.png（起，蓝）、end.png（终，红），圆形中心对准坐标点
const START_MARKER = { iconPath: '/assets/markers/start.png', width: 32, height: 32, anchor: { x: 0.5, y: 0.5 } }
const END_MARKER = { iconPath: '/assets/markers/end.png', width: 32, height: 32, anchor: { x: 0.5, y: 0.5 } }

Page({
  data: {
    latitude: 30.657486,
    longitude: 104.065735,
    scale: 14,
    markers: [],
    polylines: [],
    includePoints: [],
    title: '',
    address: '',
    distanceText: '',
    durationText: ''
  },

  onLoad(query) {
    const lat = Number(query.lat)
    const lng = Number(query.lng)
    this._target = {
      latitude: lat,
      longitude: lng,
      title: decodeURIComponent(query.title || ''),
      address: decodeURIComponent(query.address || '')
    }
    // 先定位到技能位置、只显示终点；定位/路线就绪后再补起点与连线
    this.setData({
      latitude: lat,
      longitude: lng,
      title: this._target.title,
      address: this._target.address,
      markers: [Object.assign({ id: 1, latitude: lat, longitude: lng }, END_MARKER)]
    })
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this._me = { latitude: res.latitude, longitude: res.longitude }
        this.drawRoute()
      },
      fail: () => {}
    })
  },

  drawRoute() {
    const me = this._me
    const target = this._target
    if (!me || !target || !target.latitude) return
    const markers = [
      Object.assign({ id: 1, latitude: target.latitude, longitude: target.longitude }, END_MARKER),
      Object.assign({ id: 2, latitude: me.latitude, longitude: me.longitude }, START_MARKER)
    ]
    fetchWalkingRoute(me, target).then((route) => {
      const points = route ? route.points : null
      const routePoints = points || [
        { latitude: me.latitude, longitude: me.longitude },
        { latitude: target.latitude, longitude: target.longitude }
      ]
      this.setData({
        markers,
        // 用整条路线所有点（而非仅首尾），让地图自动缩放真正包含整条折线
        includePoints: routePoints,
        polylines: [{
          points: routePoints,
          color: '#3B82F6',
          width: 6,
          dottedLine: !points
        }],
        distanceText: route ? formatDistance(route.distance) : '',
        durationText: route ? `${route.duration} 分钟` : ''
      })
    })
  },

  // 底部「导航」按钮：跳微信原生位置页，走真正的导航 / 打车 / 收藏
  onNav() {
    const target = this._target
    if (!target) return
    wx.openLocation({
      latitude: target.latitude,
      longitude: target.longitude,
      name: target.title,
      address: target.address || '',
      scale: 18
    })
  }
})
