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

// 网格占位：相邻/同点技能各占一格防遮挡。参考最大级别（18）下保证最小间距；
// 缩小后重合不做处理（产品确认接受），低倍率由原生聚簇收成数字簇兜底
const GRID_SPACING_PX = 80   // 格子最小间距（逻辑像素）
const GRID_REF_SCALE = 18    // 换算格子地理跨度所参考的缩放级别
const GRID_MAX_RING = 8      // 挪移时最多向外搜的圈数（17×17=289 格 ≥ 数据上限 240 条）

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
    listItems: [],      // 列表抽屉的数据源：全部 filtered
    markers: [],
    selected: null,
    showList: false,
    showPrompt: false,
    emptyText: '这一带还没有人发布'
  },

  onLoad(query) {
    // 分享卡片带 listingId 进入（分享 path 指向本页可带参数）：数据到位后聚焦该技能
    if (query && query.listingId) {
      this._focusId = Number(query.listingId)
    }
  },

  onShow() {
    // 分类字典可能已被接口热更新，切过来时刷新一次
    this.setData({ categories: currentCategories() })
    // 站内跳转（如收藏列表「看位置」）：switchTab 不能带参数，经 globalData 传过来
    const focusFromApp = getApp().globalData.focusListingId
    if (focusFromApp) {
      this._focusId = Number(focusFromApp)
      getApp().globalData.focusListingId = null
    }
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
        // 聚焦模式下不把地图中心切到用户位置，等数据到位后直接定位到目标技能，避免地图先跳走再跳回
        if (!this._focusId) {
          this.setData({ latitude: center.latitude, longitude: center.longitude })
        }
        this.refreshListings(center)
      },
      fail: () => {
        wx.showToast({ title: '定位失败，显示示例位置', icon: 'none' })
        this.refreshListings(DEFAULT_CENTER)
      }
    })
  },

  // 列表条目的展示字段派生：nearby 主拉取与聚焦补拉详情共用
  decorateListing(item) {
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
  },

  // 拉取 10 公里内的上架发布（后端按分类配额返回）；自己的发布也在 nearby 结果里，无需单独请求
  refreshListings(center) {
    api.nearby({ latitude: center.latitude, longitude: center.longitude, radius: FETCH_RADIUS })
      .then((nearbyData) => {
        const listings = (nearbyData.list || []).map((item) => this.decorateListing(item))
        listings.sort((a, b) => (a.distance || 0) - (b.distance || 0))
        this._extra = []            // 新数据集到位，清掉上次的筛选补查缓存
        this._fetchedKey = ''       // 同一筛选条件失败只补查一次
        getApp().globalData.listings = listings
        this.setData({ listings }, () => {
          this.applyFilter()
          // 转发/收藏「看位置」进入：数据到位后聚焦目标技能，只聚焦一次
          if (this._focusId) {
            const id = this._focusId
            this._focusId = null
            this.focusListing(id)
          }
        })
      })
  },

  // 聚焦某条技能：等价于用户在地图上点了它（居中 + 选中 + callout 常驻 + 底部卡片）
  focusListing(id) {
    const finish = (item) => {
      // 清掉筛选，保证目标技能一定在渲染结果里
      this.setData({
        categoryId: 0,
        tagOptions: [],
        itemOptions: [],
        activeTag: '',
        activeItem: '',
        latitude: item.latitude,
        longitude: item.longitude,
        scale: 16
      }, () => {
        this.applyFilter()
        this.selectListing(Number(id))
      })
    }
    const target = this.allListings().find((item) => Number(item.id) === Number(id))
    if (target) {
      finish(target)
      return
    }
    // 目标不在附近结果里（超出拉取半径或被配额截断）：补拉详情并入数据源
    const loc = getApp().globalData.location || {}
    const viewer = loc.latitude && loc.longitude
      ? { viewerLatitude: loc.latitude, viewerLongitude: loc.longitude }
      : {}
    api
      .listingDetail(id, viewer)
      .then((item) => {
        const decorated = this.decorateListing(item)
        this._extra = (this._extra || []).concat([decorated])
        finish(decorated)
      })
      .catch(() => {
        // 失败原因（已删除/下架/封禁）已由请求层 toast，这里保持地图默认状态
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
    this.setData({
      filtered,
      selected: selectedStill,
      emptyText: this.emptyTextOf(),
      listItems: filtered,
      markers: this.buildMarkers(filtered, selectedStill)
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

  // 一个技能一个 marker：渲染坐标经网格占位摊开，相邻/同点的技能各占一格，图标与文字不再互相遮挡。
  // 只偏移渲染坐标；距离、详情、导航一律用真实坐标。非选中时 callout 点击才显示（常驻 callout 是卡顿主因），密集时参与原生聚簇
  buildMarkers(listings, selectedStill) {
    const markers = this.placeOnGrid(listings).map(({ item, latitude, longitude }) => {
      const active = selectedStill && item.id === selectedStill.id
      const cat = findCategory(item.categoryId)
      // callout 只在选中时展示标题+距离；未选中的常驻文字改用轻量 label（callout 常驻是卡顿主因）
      const content = `${item.title}  ${item.distanceText}`
      return {
        id: Number(item.id),
        latitude,
        longitude,
        width: active ? 40 : 32,
        height: active ? 52 : 42,
        iconPath: `/assets/markers/${cat.code}.png`,
        anchor: { x: 0.5, y: 1 },
        zIndex: active ? 9 : 1,
        joinCluster: !active,
        // 常驻 label：显示分类名
        label: !active
          ? {
              content: item.categoryName,
              color: '#2F3A32',
              bgColor: '#FFFFFF',
              borderColor: '#DDE8D6',
              borderWidth: 1,
              borderRadius: 8,
              fontSize: 11,
              padding: 4,
              width: 60,
              textAlign: 'center',
              // label 中心点相对图标底尖（坐标点）偏移：anchorX 0 水平居中，anchorY 再抬高避免压住图标
              anchorX: 0,
              anchorY: -66
            }
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

  // 网格占位：每个技能登记一个格子，本格被占时螺旋向外找最近空格，渲染在空格中心；
  // 超出搜索圈数仍找不到（极端密集）时退回真实坐标。对位置精度要求低，几十米内的视觉偏移可接受
  placeOnGrid(listings) {
    if (!listings.length) return []
    // 格子地理跨度：参考最大级别下 GRID_SPACING_PX 像素对应的距离，经度按 cos(纬度) 放大修正
    const radLat = (listings[0].latitude * Math.PI) / 180
    const cosLat = Math.max(0.2, Math.cos(radLat))
    const cellMeters = GRID_SPACING_PX * (156543.03392 * cosLat / Math.pow(2, GRID_REF_SCALE))
    const latSpan = cellMeters / 111320
    const lngSpan = latSpan / cosLat
    const occupied = {}
    return listings.map((item) => {
      let cx = Math.round(item.longitude / lngSpan)
      let cy = Math.round(item.latitude / latSpan)
      if (occupied[`${cx},${cy}`]) {
        let found = null
        for (let ring = 1; ring <= GRID_MAX_RING && !found; ring++) {
          for (let dx = -ring; dx <= ring && !found; dx++) {
            for (let dy = -ring; dy <= ring && !found; dy++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
              if (!occupied[`${cx + dx},${cy + dy}`]) found = { dx, dy }
            }
          }
        }
        if (!found) {
          return { item, latitude: item.latitude, longitude: item.longitude }
        }
        cx += found.dx
        cy += found.dy
      }
      occupied[`${cx},${cy}`] = true
      return { item, latitude: cy * latSpan, longitude: cx * lngSpan }
    })
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

  // 选中一条技能：callout 常驻 + 底部出卡片（每个技能都有独立 marker，无需再分组）
  selectListing(id) {
    const selected = this.data.filtered.find((item) => Number(item.id) === Number(id))
    if (!selected) return
    this.setData({
      selected,
      showList: false,
      listItems: this.data.filtered,
      markers: this.buildMarkers(this.data.filtered, selected)
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
      { showList: !this.data.showList, selected: null },
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
