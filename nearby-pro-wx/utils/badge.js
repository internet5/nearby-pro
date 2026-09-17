// tabBar「消息」角标：有未读显示数字，无未读移除；失败静默（tabBar 未渲染完时 set 可能报错）
const api = require('./api')

const CHAT_TAB_INDEX = 1 // tabBar 顺序：附近 / 消息 / 我的

function refreshChatBadge() {
  api
    .chatUnread()
    .then((d) => {
      const total = (d && d.total) || 0
      if (total > 0) {
        wx.setTabBarBadge({
          index: CHAT_TAB_INDEX,
          text: total > 99 ? '99+' : String(total),
          fail: () => {}
        })
      } else {
        wx.removeTabBarBadge({ index: CHAT_TAB_INDEX, fail: () => {} })
      }
    })
    .catch(() => {})
}

module.exports = { refreshChatBadge }
