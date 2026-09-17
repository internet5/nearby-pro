const api = require('../../utils/api')
const { getUserInfo } = require('../../utils/request')
const { joinList, flattenItems } = require('../../utils/categories')
const { openDetail, focusOnMap } = require('../../utils/listings')

const STATUS_TEXT = {
  1: '上架中',
  2: '已下架',
  3: '已过期',
  4: '已封禁'
}

Page({
  data: {
    tab: 'publish',   // publish=我的发布 favorite=我的收藏
    list: [],
    favorites: [],
    user: null
  },

  onShow() {
    this.setData({ user: getUserInfo() })
    // 收藏会在详情页变动，每次进入按当前 tab 刷新
    if (this.data.tab === 'favorite') this.loadFavorites()
    else this.loadList()
  },

  onTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.tab) return
    this.setData({ tab })
    if (tab === 'favorite') this.loadFavorites()
    else this.loadList()
  },

  loadList() {
    api
      .mineList()
      .then((data) => {
        // mine 接口不返回 tagText/itemText，渲染前派生
        const list = (data.list || []).map((item) => ({
          ...item,
          tagText: joinList(item.tags),
          itemText: joinList(flattenItems(item.items)),
          statusText: STATUS_TEXT[item.status] || '未知'
        }))
        this.setData({ list })
      })
      .catch(() => {})
  },

  loadFavorites() {
    api
      .favoriteList()
      .then((data) => {
        // 收藏接口不返回 tagText/itemText，渲染前派生
        const favorites = (data.list || []).map((item) => ({
          ...item,
          tagText: joinList(item.tags),
          itemText: joinList(flattenItems(item.items))
        }))
        this.setData({ favorites })
      })
      .catch(() => {})
  },

  onOpen(e) {
    openDetail(e.currentTarget.dataset.listingId)
  },

  // 收藏卡片「看位置」：跳地图页聚焦该技能（与转发落地同一链路）
  onLocateOnMap(e) {
    focusOnMap(Number(e.currentTarget.dataset.listingId))
  },

  onUnfavorite(e) {
    api
      .removeFavorite(Number(e.currentTarget.dataset.listingId))
      .then(() => {
        wx.showToast({ title: '已取消收藏', icon: 'none' })
        this.loadFavorites()
      })
      .catch(() => {})
  },

  onOffline(e) {
    api
      .offlineListing(Number(e.currentTarget.dataset.listingId))
      .then(() => {
        wx.showToast({ title: '已下架', icon: 'none' })
        this.loadList()
      })
      .catch(() => {})
  },

  onEdit(e) {
    wx.navigateTo({ url: '/pages/publish/index?id=' + e.currentTarget.dataset.listingId })
  },

  onRelist(e) {
    api
      .relistListing(Number(e.currentTarget.dataset.listingId))
      .then(() => {
        wx.showToast({ title: '已重新上架，有效期 30 天', icon: 'none' })
        this.loadList()
      })
      .catch(() => {})
  },

  onDelete(e) {
    const id = Number(e.currentTarget.dataset.listingId)
    wx.showModal({
      title: '删除这条发布？',
      content: '删除后不可恢复，需要重新填写发布。',
      success: (res) => {
        if (!res.confirm) return
        api
          .deleteListing(id)
          .then(() => {
            wx.showToast({ title: '已删除', icon: 'none' })
            this.loadList()
          })
          .catch(() => {})
      }
    })
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/feedback/index' })
  },

  // 空函数：catchtap 阻止「分享」按钮把点击冒泡到卡片的打开详情
  noop() {},

  onShareAppMessage(res) {
    // 列表里点某条发布的「分享」按钮，带上这条技能的信息；落地地图并聚焦该技能
    if (res && res.from === 'button' && res.target && res.target.dataset.listingId) {
      const d = res.target.dataset
      return {
        title: `「${d.title}」｜${d.category}师傅就在附近`,
        path: `/pages/map/index?listingId=${d.listingId}`
      }
    }
    return {
      title: '找附近的手艺人，上附近职人',
      path: '/pages/map/index'
    }
  }
})
