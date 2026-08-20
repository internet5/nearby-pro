const { getMine } = require('./store')

function sameId(a, b) {
  return String(a) === String(b)
}

function findListing(id) {
  const app = getApp()
  const current = app.globalData.currentListing
  if (current && (id === undefined || id === '' || id === 'undefined' || sameId(current.id, id))) {
    return current
  }
  const cached = (app.globalData.listings || []).find((item) => sameId(item.id, id))
  if (cached) return cached
  return getMine().find((item) => sameId(item.id, id)) || current || null
}

function openDetail(listing) {
  if (!listing) {
    wx.showToast({ title: '找不到这条发布', icon: 'none' })
    return
  }
  getApp().globalData.currentListing = listing
  wx.navigateTo({
    url: `/pages/detail/index?id=${listing.id}`
  })
}

module.exports = {
  findListing,
  openDetail
}
