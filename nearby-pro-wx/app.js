const { ensureLogin } = require('./utils/request')
const { loadFromApi } = require('./utils/categories')

// mock 时代的本地存储 key，接入后端后一次性清掉
const LEGACY_KEYS = [
  'nearby_pro_my_listings',
  'nearby_pro_offline_ids',
  'nearby_pro_feedbacks'
]

App({
  onLaunch() {
    LEGACY_KEYS.forEach((key) => wx.removeStorageSync(key))
    // 静默登录 + 分类热更新：失败不打扰，接口层会在需要时自动重试登录
    ensureLogin().catch(() => {})
    loadFromApi().catch(() => {})
  },

  globalData: {
    listings: [],            // 地图页刷新后写入，供分享/兜底场景用
    location: { latitude: 30.657486, longitude: 104.065735 },  // 成都默认坐标
    publishPromptShown: false
  }
})
