// 详情数据统一由详情页按 id 向后端拉取，这里只负责跳转
function openDetail(id) {
  if (id === undefined || id === null || id === '') {
    wx.showToast({ title: '找不到这条发布', icon: 'none' })
    return
  }
  wx.navigateTo({
    url: `/pages/detail/index?id=${id}`
  })
}

// 跳到地图页并聚焦某条技能：地图是 tabBar 页，switchTab 不能带参数，经 globalData 传递、地图页 onShow 读取
function focusOnMap(id) {
  if (id === undefined || id === null || id === '') return
  getApp().globalData.focusListingId = id
  wx.switchTab({ url: '/pages/map/index' })
}

module.exports = {
  openDetail,
  focusOnMap
}
