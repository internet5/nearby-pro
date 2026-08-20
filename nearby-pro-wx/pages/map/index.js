const { CATEGORIES, findCategory } = require('../../utils/categories')
const { distanceMeters, formatDistance } = require('../../utils/geo')
const { buildMockListings } = require('../../utils/mock')
const { getMine, isOffline } = require('../../utils/store')

const DEFAULT_CENTER = {
  latitude: 30.657486,
  longitude: 104.065735
}

Page({
  data: {
    latitude: DEFAULT_CENTER.latitude,
    longitude: DEFAULT_CENTER.longitude,
    scale: 15,
    categories: CATEGORIES,
    categoryId: 0,
    listings: [],
    filtered: [],
    markers: [],
    selected: null,
    showList: false
  },

  onShow() {
    this.loadLocationThenListings()
  },

  loadLocationThenListings() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const center = { latitude: res.latitude, longitude: res.longitude }
        getApp().globalData.location = center
        this.setData({ latitude: center.latitude, longitude: center.longitude })
        this.refreshListings(center)
      },
      fail: () => {
        wx.showToast({ title: '定位失败，显示示例位置', icon: 'none' })
        this.refreshListings(DEFAULT_CENTER)
      }
    })
  },

  refreshListings(center) {
    const mine = getMine().filter((item) => item.status === 1)
    const mock = buildMockListings(center).filter((item) => !isOffline(item.id))
    const listings = mine.concat(mock).map((item) => {
      const meters = distanceMeters(
        center.latitude,
        center.longitude,
        item.latitude,
        item.longitude
      )
      return {
        ...item,
        distance: meters,
        distanceText: formatDistance(meters)
      }
    })
    listings.sort((a, b) => a.distance - b.distance)
    getApp().globalData.listings = listings
    this.setData({ listings }, () => this.applyFilter())
  },

  applyFilter() {
    const { listings, categoryId, selected } = this.data
    const filtered = listings.filter((item) => {
      if (item.status !== 1) return false
      if (categoryId === 0) return true
      return item.categoryId === categoryId
    })
    const selectedStill = selected && filtered.some((item) => item.id === selected.id)
      ? filtered.find((item) => item.id === selected.id)
      : null
    this.setData({
      filtered,
      selected: selectedStill,
      markers: filtered.map((item) => this.toMarker(item, selectedStill && selectedStill.id === item.id))
    })
  },

  toMarker(item, active) {
    const cat = findCategory(item.categoryId)
    return {
      id: Number(item.id),
      latitude: item.latitude,
      longitude: item.longitude,
      width: active ? 44 : 36,
      height: active ? 58 : 48,
      iconPath: `/assets/markers/${cat.code}.png`,
      anchor: { x: 0.5, y: 1 },
      zIndex: active ? 9 : 1
    }
  },

  onCategory(e) {
    this.setData({ categoryId: Number(e.currentTarget.dataset.id) }, () => this.applyFilter())
  },

  onMarkerTap(e) {
    const id = Number(e.markerId || e.detail.markerId)
    const selected = this.data.filtered.find((item) => Number(item.id) === id)
    if (!selected) return
    this.setData({
      selected,
      showList: false,
      latitude: selected.latitude,
      longitude: selected.longitude,
      markers: this.data.filtered.map((item) => this.toMarker(item, Number(item.id) === id))
    })
  },

  onMapTap() {
    if (!this.data.selected) return
    this.setData({
      selected: null,
      markers: this.data.filtered.map((item) => this.toMarker(item, false))
    })
  },

  onLocate() {
    this.loadLocationThenListings()
  },

  toggleList() {
    this.setData({ showList: !this.data.showList, selected: null })
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/detail/index?id=${id}` })
  }
})
