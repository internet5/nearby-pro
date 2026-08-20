const { getMine, offlineListing } = require('../../utils/store')
const { openDetail } = require('../../utils/listings')

const STATUS_TEXT = {
  1: '上架中',
  2: '已下架',
  3: '已过期',
  4: '已封禁'
}

Page({
  data: {
    list: []
  },

  onShow() {
    const list = getMine().map((item) => ({
      ...item,
      statusText: STATUS_TEXT[item.status] || '未知'
    }))
    this.setData({ list })
  },

  onOpen(e) {
    const id = e.currentTarget.dataset.listingId
    const listing = this.data.list.find((item) => String(item.id) === String(id))
    openDetail(listing)
  },

  onOffline(e) {
    offlineListing(Number(e.currentTarget.dataset.listingId))
    this.onShow()
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  }
})
