// 本地偏好存储：数据已全部走后端接口，这里只保留发布引导弹窗的本地状态
const PUBLISHED_KEY = 'nearby_pro_has_published'

// 是否发布过技能（本地标记，成功发布一次就永久成立）：决定要不要弹发布引导
function hasPublished() {
  return !!wx.getStorageSync(PUBLISHED_KEY)
}

function markPublished() {
  wx.setStorageSync(PUBLISHED_KEY, true)
}

module.exports = {
  hasPublished,
  markPublished
}
