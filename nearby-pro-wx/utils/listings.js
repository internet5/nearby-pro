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

module.exports = {
  openDetail
}
