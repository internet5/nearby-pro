const { CATEGORIES, currentCategories, findCategory, tagList, itemsOfTag, flattenItems } = require('../../utils/categories')
const { formatDistance } = require('../../utils/geo')
const api = require('../../utils/api')
const { dismissPublishPrompt, getPublishPromptDismissedAt, hasPublished } = require('../../utils/store')
const { openDetail } = require('../../utils/listings')

const DEFAULT_CENTER = {
  latitude: 30.657486,
  longitude: 104.065735
}

// 数据拉取半径：一次拉 10km、每分类配额（后端约定），切分类纯前端筛选不发请求
const FETCH_RADIUS = 10000

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
    listItems: [],      // 列表抽屉的数据源：全部 filtered 或某个位置的分组
    groupFilter: '',    // 当前按位置过滤的分组 key
    markers: [],
    selected: null,
    showList: false,
    showPrompt: false,
    emptyText: '这一带还没有人发布'
  },

  onShow() {
    // 分类字典可能已被接口热更新，切过来时刷新一次
    this.setData({ categories: currentCategories() })
    this.loadLocationThenListings()
    this.maybeShowPrompt()
  },

  // 发布引导弹窗：只对没发布过技能的用户弹，每次启动最多一次，关闭后 7 天静默
  maybeShowPrompt() {
    const app = getApp()
    if (app.globalData.publishPromptShown) return
    if (hasPublished()) return
    const dismissedAt = getPublishPromptDismissedAt()
    if (dismissedAt && Date.now() - dismissedAt < 7 * 24 * 3600 * 1000) return
    app.globalData.publishPromptShown = true
    // 略等地图渲染完再弹，避免启动瞬间遮挡
    setTimeout(() => this.setData({ showPrompt: true }), 500)
  },

  onPromptGo() {
    this.setData({ showPrompt: false })
    // 点「去发布」不记静默：发布成功后自然不再弹，没发布下次启动还会提醒
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  onPromptClose() {
    this.setData({ showPrompt: false })
    dismissPublishPrompt()
  },

  // 空函数：catchtap 阻止点弹窗卡片时冒泡到遮罩误关
  noopPrompt() {},

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

  // 拉取 10 公里内的上架发布（后端按分类配额返回）；自己的发布也在 nearby 结果里，无需单独请求
  refreshListings(center) {
    api.nearby({ latitude: center.latitude, longitude: center.longitude, radius: FETCH_RADIUS })
      .then((nearbyData) => {
        const decorate = (item) => {
          const tags = item.tags || []
          const items = item.items || []
          return {
            ...item,
            tags,
            items,
            tagText: tags.join(' · '),
            itemText: flattenItems(items).join(' · '),
            distanceText: item.distance === null || item.distance === undefined
              ? ''
              : formatDistance(item.distance)
          }
        }
        const listings = (nearbyData.list || []).map(decorate)
        listings.sort((a, b) => (a.distance || 0) - (b.distance || 0))
        this._extra = []            // 新数据集到位，清掉上次的筛选补查缓存
        this._fetchedKey = ''       // 同一筛选条件失败只补查一次
        getApp().globalData.listings = listings
        this.setData({ listings }, () => this.applyFilter())
      })
  },

  emptyTextOf() {
    const { activeItem, activeTag } = this.data
    if (activeItem) return `附近暂时没人会「${activeItem}」，可先看「${activeTag}」全部`
    if (activeTag) return `附近暂时没有「${activeTag}」，换个工种看看`
    return '这一带还没有人发布，换个分类或稍后过来看'
  },

  // 全量数据源：主拉取结果 + 筛选补查累积，按 id 去重
  allListings() {
    const extra = this._extra || []
    if (!extra.length) return this.data.listings
    const seen = {}
    this.data.listings.forEach((item) => { seen[String(item.id)] = true })
    return this.data.listings.concat(extra.filter((item) => !seen[String(item.id)]))
  },

  applyFilter() {
    const { categoryId, activeTag, activeItem, selected } = this.data
    const listings = this.allListings()
    const filtered = listings.filter((item) => {
      // 数据源已保证均为上架中：nearby 服务端按 status=1 且未过期过滤
      if (categoryId !== 0 && item.categoryId !== categoryId) return false
      if (activeTag && !(item.tags || []).includes(activeTag)) return false
      if (activeItem && flattenItems(item.items || []).indexOf(activeItem) < 0) return false
      return true
    })
    const selectedStill = selected && filtered.some((item) => item.id === selected.id)
      ? filtered.find((item) => item.id === selected.id)
      : null
    // 按位置聚合：坐标约 11 米内视为同一位置，多条技能合成一个 marker
    const groups = {}
    filtered.forEach((item) => {
      const key = `${Number(item.latitude).toFixed(4)},${Number(item.longitude).toFixed(4)}`
      ;(groups[key] = groups[key] || []).push(item)
    })
    this._groups = groups
    // 之前点开的分组若已不在结果里，自动退回全量列表
    const groupFilter = this.data.groupFilter && groups[this.data.groupFilter]
      ? this.data.groupFilter
      : ''
    this.setData({
      filtered,
      selected: selectedStill,
      emptyText: this.emptyTextOf(),
      groupFilter,
      listItems: groupFilter ? groups[groupFilter] : filtered,
      markers: this.buildMarkers(groups, selectedStill)
    })
    // 配额模式可能截掉某筛选组合的数据：筛后为空时按条件精确补查一次
    if (!filtered.length && (categoryId !== 0 || activeTag || activeItem)) {
      this.fetchFilterExtra()
    }
  },

  // 按当前筛选条件向 10km 半径精确补查，结果并入数据源后重筛；同一条件只查一次
  fetchFilterExtra() {
    const { categoryId, activeTag, activeItem, latitude, longitude } = this.data
    const key = [categoryId, activeTag, activeItem].join('|')
    if (this._fetchedKey === key || this._fetchingFilter) return
    this._fetchedKey = key
    this._fetchingFilter = true
    // GET 参数只传有值的字段，避免 undefined 被序列化成 "undefined"
    const params = { latitude, longitude, radius: FETCH_RADIUS }
    if (categoryId) params.categoryId = categoryId
    if (activeTag) params.tag = activeTag
    if (activeItem) params.itemName = activeItem
    api
      .nearby(params)
      .then((data) => {
        this._fetchingFilter = false
        this._extra = (this._extra || []).concat(data.list || [])
        this.applyFilter()
      })
      .catch(() => {
        this._fetchingFilter = false
      })
  },

  // 一个位置一个 marker：非选中时 callout 点击才显示（常驻 callout 是卡顿主因）；密集时参与原生聚簇
  buildMarkers(groups, selectedStill) {
    const markers = Object.keys(groups).map((key) => {
      const group = groups[key]
      const first = group[0]
      const active = selectedStill && group.some((item) => item.id === selectedStill.id)
      const cat = findCategory(first.categoryId)
      // callout 只在选中时展示标题+距离；未选中的常驻文字改用轻量 label（callout 常驻是卡顿主因）
      const content = `${first.title}  ${first.distanceText}`
      return {
        id: Number(first.id),
        latitude: first.latitude,
        longitude: first.longitude,
        width: active ? 40 : 32,
        height: active ? 52 : 42,
        iconPath: `/assets/markers/${cat.code}.png`,
        anchor: { x: 0.5, y: 1 },
        zIndex: active ? 9 : 1,
        joinCluster: !active,
        // 常驻 label：单条显示分类名；同一位置多条时带上数量并用暖色区分
        label: !active
          ? (group.length > 1
              ? {
                  content: `${first.categoryName} ${group.length}项`,
                  color: '#C7401F',
                  bgColor: '#FDEBE6',
                  borderColor: '#F0C4B2',
                  borderWidth: 1,
                  borderRadius: 8,
                  fontSize: 11,
                  padding: 4,
                  width: 78,
                  textAlign: 'center',
                  // label 中心点相对图标底尖（坐标点）偏移：anchorX 0 水平居中，anchorY 再抬高避免压住图标
                  anchorX: 0,
                  anchorY: -66
                }
              : {
                  content: first.categoryName,
                  color: '#2F3A32',
                  bgColor: '#FFFFFF',
                  borderColor: '#DDE8D6',
                  borderWidth: 1,
                  borderRadius: 8,
                  fontSize: 11,
                  padding: 4,
                  width: 60,
                  textAlign: 'center',
                  anchorX: 0,
                  anchorY: -66
                })
          : undefined,
        callout: {
          content,
          color: '#FFFFFF',
          fontSize: 13,
          borderRadius: 8,
          bgColor: '#3E6B4F',
          padding: 8,
          display: active ? 'ALWAYS' : 'BYCLICK',
          textAlign: 'center',
          borderWidth: 0
        }
      }
    })
    this._markersById = {}
    markers.forEach((marker) => { this._markersById[marker.id] = marker })
    return markers
  },

  // 点聚合簇：以簇内 marker 的质心为中心放大一级，逐步看清密集区域
  onClusterClick(e) {
    const cluster = (e.detail && e.detail.cluster) || e.cluster
    const ids = (cluster && cluster.markerIds) || []
    const members = ids
      .map((id) => this._markersById[id])
      .filter(Boolean)
    if (!members.length) return
    const lat = members.reduce((sum, m) => sum + m.latitude, 0) / members.length
    const lng = members.reduce((sum, m) => sum + m.longitude, 0) / members.length
    this.setData({
      latitude: lat,
      longitude: lng,
      scale: Math.min(this.data.scale + 2, 18)
    })
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
    const groups = this._groups || {}
    const key = Object.keys(groups).find(
      (k) => groups[k].some((item) => Number(item.id) === Number(id))
    )
    const group = key ? groups[key] : []
    // 同一位置聚了多条技能：打开列表抽屉只看这一组
    if (group.length > 1) {
      this.setData({ showList: true, selected: null, groupFilter: key, listItems: group })
      return
    }
    const selected = this.data.filtered.find((item) => Number(item.id) === Number(id))
    if (!selected) return
    this.setData({
      selected,
      showList: false,
      groupFilter: '',
      listItems: this.data.filtered,
      markers: this.buildMarkers(groups, selected)
    })
  },

  onMarkerTap(e) {
    const id = e.markerId || (e.detail && e.detail.markerId)
    // 点 marker 会连带触发地图 tap，记下时间供 onMapTap 区分
    this._markerTappedAt = Date.now()
    this.selectListing(id)
  },

  // 点地图空白处：取消选中，底部回到默认提示；marker 点击 300ms 内触发的 tap 是连带的，忽略
  onMapTap() {
    if (this._markerTappedAt && Date.now() - this._markerTappedAt < 300) return
    if (!this.data.selected) return
    this.setData({ selected: null }, () => this.applyFilter())
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
    this.setData(
      { showList: !this.data.showList, selected: null, groupFilter: '' },
      () => {
        if (this.data.showList) {
          this.setData({ listItems: this.data.filtered })
        } else {
          this.applyFilter()
        }
      }
    )
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  onOpenDetail(e) {
    openDetail(e.currentTarget.dataset.listingId)
  },

  onShareAppMessage() {
    return {
      title: '找附近的手艺人，维修保洁家教跟拍都在地图上',
      path: '/pages/map/index'
    }
  }
})
