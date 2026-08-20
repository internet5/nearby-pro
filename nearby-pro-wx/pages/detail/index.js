const { findListing } = require('../../utils/listings')
const { offlineListing } = require('../../utils/store')

Page({
  data: {
    item: null,
    missing: false
  },

  onLoad(query) {
    const item = findListing(query.id)
    if (!item) {
      this.setData({ missing: true })
      return
    }
    this.setData({ item, missing: false })
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

  onReport() {
    wx.showToast({ title: '已记录，我们会尽快处理', icon: 'none' })
  },

  onOffline() {
    wx.showModal({
      title: '下架这条发布？',
      content: '下架后地图上不再显示，可重新发布。',
      success: (res) => {
        if (!res.confirm) return
        offlineListing(this.data.item.id)
        wx.showToast({ title: '已下架', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 300)
      }
    })
  }
})
