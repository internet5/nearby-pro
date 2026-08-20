const { CATEGORIES, findCategory, tagList, itemsOfTag, shortLabel } = require('../../utils/categories')
const { distanceMeters, formatDistance } = require('../../utils/geo')
const { buildMockListings } = require('../../utils/mock')
const { getMine, isOffline } = require('../../utils/store')
const { openDetail } = require('../../utils/listings')

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
    tagOptions: [],
    itemOptions: [],
    activeTag: '',
    activeItem: '',
    listings: [],
    filtered: [],
    markers: [],
    selected: null,
    showList: false,
    emptyText: '这一带还没有人发布'
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
      const tags = item.tags || []
      const items = item.items || []
      return {
        ...item,
        tags,
        items,
        tagText: item.tagText || tags.join(' · '),
        itemText: item.itemText || items.join(' · '),
        distance: meters,
        distanceText: formatDistance(meters)
      }
    })
    listings.sort((a, b) => a.distance - b.distance)
    getApp().globalData.listings = listings
    this.setData({ listings }, () => this.applyFilter())
  },

  emptyTextOf() {
    const { activeItem, activeTag } = this.data
    if (activeItem) return `附近暂时没人会「${activeItem}」，可先看「${activeTag}」全部`
    if (activeTag) return `附近暂时没有「${activeTag}」，换个工种看看`
    return '这一带还没有人发布，换个分类或稍后过来看'
  },

  applyFilter() {
    const { listings, categoryId, activeTag, activeItem, selected } = this.data
    const filtered = listings.filter((item) => {
      if (item.status !== 1) return false
      if (categoryId !== 0 && item.categoryId !== categoryId) return false
      if (activeTag && !(item.tags || []).includes(activeTag)) return false
      if (activeItem && !(item.items || []).includes(activeItem)) return false
      return true
    })
    const selectedStill = selected && filtered.some((item) => item.id === selected.id)
      ? filtered.find((item) => item.id === selected.id)
      : null
    this.setData({
      filtered,
      selected: selectedStill,
      emptyText: this.emptyTextOf(),
      markers: filtered.map((item) => this.toMarker(item, selectedStill && selectedStill.id === item.id))
    })
  },

  toMarker(item, active) {
    const cat = findCategory(item.categoryId)
    const label = shortLabel(item)
    return {
      id: Number(item.id),
      latitude: item.latitude,
      longitude: item.longitude,
      width: active ? 40 : 32,
      height: active ? 52 : 42,
      iconPath: `/assets/markers/${cat.code}.png`,
      anchor: { x: 0.5, y: 1 },
      zIndex: active ? 9 : 1,
      callout: {
        content: active ? `${item.title}  ${item.distanceText}` : label,
        color: active ? '#F4EFE6' : '#1C1917',
        fontSize: active ? 13 : 12,
        borderRadius: 8,
        bgColor: active ? '#C45C26' : '#FFFDF8',
        padding: 8,
        display: 'ALWAYS',
        textAlign: 'center',
        borderWidth: active ? 0 : 1,
        borderColor: '#E7E5E4'
      }
    }
  },

  onCategory(e) {
    const categoryId = Number(e.currentTarget.dataset.id)
    this.setData({
      categoryId,
      tagOptions: tagList(categoryId),
      itemOptions: [],
      activeTag: '',
      activeItem: '',
      selected: null,
      showList: false
    }, () => this.applyFilter())
  },

  onTagAll() {
    this.setData({
      activeTag: '',
      activeItem: '',
      itemOptions: [],
      selected: null
    }, () => this.applyFilter())
  },

  onTag(e) {
    const tag = e.currentTarget.dataset.tag
    const same = this.data.activeTag === tag
    this.setData({
      activeTag: same ? '' : tag,
      activeItem: '',
      itemOptions: same ? [] : itemsOfTag(this.data.categoryId, tag),
      selected: null
    }, () => this.applyFilter())
  },

  onItemAll() {
    this.setData({ activeItem: '', selected: null }, () => this.applyFilter())
  },

  onItem(e) {
    const item = e.currentTarget.dataset.item
    this.setData({
      activeItem: this.data.activeItem === item ? '' : item,
      selected: null
    }, () => this.applyFilter())
  },

  selectListing(id) {
    const selected = this.data.filtered.find((item) => Number(item.id) === Number(id))
    if (!selected) return
    this.setData({
      selected,
      showList: false,
      markers: this.data.filtered.map((item) => this.toMarker(item, Number(item.id) === Number(id)))
    })
  },

  onMarkerTap(e) {
    const id = e.markerId || (e.detail && e.detail.markerId)
    this.selectListing(id)
  },

  onCalloutTap(e) {
    const id = e.markerId || (e.detail && e.detail.markerId)
    this.selectListing(id)
  },

  onLocate() {
    this.setData({ selected: null })
    this.loadLocationThenListings()
  },

  toggleList() {
    this.setData({ showList: !this.data.showList, selected: null }, () => {
      if (!this.data.showList) this.applyFilter()
    })
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  onOpenDetail(e) {
    const id = e.currentTarget.dataset.listingId
    const listing = this.data.filtered.find((item) => String(item.id) === String(id))
      || this.data.selected
    openDetail(listing)
  }
})
