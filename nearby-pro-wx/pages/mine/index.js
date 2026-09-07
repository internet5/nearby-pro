const api = require('../../utils/api')
const { getUserInfo } = require('../../utils/request')
const { joinList, flattenItems } = require('../../utils/categories')
const { openDetail } = require('../../utils/listings')

const STATUS_TEXT = {
  1: '上架中',
  2: '已下架',
  3: '已过期',
  4: '已封禁'
}

Page({
  data: {
    list: [],
    user: null
  },

  onShow() {
    this.setData({ user: getUserInfo() })
    this.loadList()
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

  onOpen(e) {
    openDetail(e.currentTarget.dataset.listingId)
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
    // 列表里点某条发布的「分享」按钮，带上这条技能的信息
    if (res && res.from === 'button' && res.target && res.target.dataset.title) {
      const d = res.target.dataset
      return {
        title: `「${d.title}」｜${d.category}师傅就在附近`,
        path: '/pages/map/index'
      }
    }
    return {
      title: '找附近的手艺人，上附近职人',
      path: '/pages/map/index'
    }
  }
})
