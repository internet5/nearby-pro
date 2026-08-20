const { getMine, offlineListing } = require('../../utils/store')

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
    wx.navigateTo({ url: `/pages/detail/index?id=${e.currentTarget.dataset.id}` })
  },

  onOffline(e) {
    offlineListing(Number(e.currentTarget.dataset.id))
    this.onShow()
  },

  onPublish() {
    wx.navigateTo({ url: '/pages/publish/index' })
  }
})
