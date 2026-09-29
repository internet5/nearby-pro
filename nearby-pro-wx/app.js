const { ensureLogin } = require('./utils/request')
const { loadFromApi } = require('./utils/categories')
const { refreshChatBadge } = require('./utils/badge')
const api = require('./utils/api')
const { hasPublished, markPublished } = require('./utils/store')
const imManager = require('./utils/im/im-manager')

// 早期纯本地 / 联调期的存储 key，接入后端后一次性清掉
const LEGACY_KEYS = [
  'nearby_pro_my_listings',
  'nearby_pro_offline_ids',
  'nearby_pro_feedbacks',
  'nearby_pro_device_id'
]

App({
  onLaunch() {
    LEGACY_KEYS.forEach((key) => wx.removeStorageSync(key))
    // 静默登录 + 分类热更新：失败不打扰，接口层会在需要时自动重试登录
    ensureLogin()
      .then(() => {
        refreshChatBadge()
        // 登录后同步「是否发布过」到本地：换设备时本地标记缺失，靠后端校正，避免重复弹发布引导。
        // 仅当本机无标记才查一次；发布过的用户同步后本地短路，不再查
        if (!hasPublished()) {
          api.mineList()
            .then((data) => {
              if (data && data.total > 0) markPublished()
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    loadFromApi().catch(() => {})
    // 实时收到消息即刷新「消息」tab 角标（连接懒建立，进入聊天相关页后才会生效）
    imManager.onIncoming(() => refreshChatBadge())
  },

  // 热启动经分享卡片进入时 onLoad 不会再触发，把 query 转交给地图页；
  // 同一份进入参数只转交一次，避免用户反复切回前台时地图重复聚焦
  onShow(options) {
    const query = (options && options.query) || {}
    const key = JSON.stringify(query)
    if (query.listingId && this._lastEntryQuery !== key) {
      this._lastEntryQuery = key
      this.globalData.focusListingId = query.listingId
    }
    // 从后台切回时刷新聊天未读角标
    refreshChatBadge()
  },

  globalData: {
    listings: [],            // 地图页刷新后写入，供分享/兜底场景用
    location: { latitude: 30.657486, longitude: 104.065735 },  // 成都默认坐标
    focusListingId: null,    // 站内/热启动跳转要聚焦的技能 id，地图页 onShow 消费后清空
    publishPromptShown: false
  }
})
