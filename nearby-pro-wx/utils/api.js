const { request, ensureLogin } = require('./request')

// ---- 免登录接口 ----

/** 分类字典（含两级工种/项目） */
function loadCategories() {
  return request({ url: '/api/categories' })
}

/** 附近发布：params = { latitude, longitude, radius?, categoryId?, tag? }；限流 60 秒 6 次/IP */
function nearby(params) {
  return request({ url: '/api/listings/nearby', data: params })
}

/** 发布详情：viewer 可选 { viewerLatitude, viewerLongitude }，带上返回 distance（米） */
function listingDetail(id, viewer) {
  return request({ url: `/api/listings/${id}`, data: viewer || {} })
}

// ---- 需登录接口：先静默登录再发请求 ----

function createListing(payload) {
  return ensureLogin().then(() =>
    request({ url: '/api/listings', method: 'POST', data: payload })
  )
}

function updateListing(id, payload) {
  return ensureLogin().then(() =>
    request({ url: `/api/listings/${id}`, method: 'PUT', data: payload })
  )
}

function offlineListing(id) {
  return ensureLogin().then(() =>
    request({ url: `/api/listings/${id}/offline`, method: 'POST' })
  )
}

function relistListing(id) {
  return ensureLogin().then(() =>
    request({ url: `/api/listings/${id}/relist`, method: 'POST' })
  )
}

function deleteListing(id) {
  return ensureLogin().then(() =>
    request({ url: `/api/listings/${id}`, method: 'DELETE' })
  )
}

/** 我的发布（含下架/过期） */
function mineList() {
  return ensureLogin().then(() => request({ url: '/api/listings/mine' }))
}

/** 举报：reason = fake | spam | illegal | other */
function report(listingId, reason) {
  return ensureLogin().then(() =>
    request({ url: `/api/listings/${listingId}/report`, method: 'POST', data: { reason } })
  )
}

/** 意见反馈 */
function addFeedback(content) {
  return ensureLogin().then(() =>
    request({ url: '/api/feedbacks', method: 'POST', data: { content } })
  )
}

/** 收藏技能（重复收藏幂等） */
function addFavorite(listingId) {
  return ensureLogin().then(() =>
    request({ url: `/api/favorites/${listingId}`, method: 'POST' })
  )
}

/** 取消收藏 */
function removeFavorite(listingId) {
  return ensureLogin().then(() =>
    request({ url: `/api/favorites/${listingId}`, method: 'DELETE' })
  )
}

/** 我的收藏（只含上架中的） */
function favoriteList() {
  return ensureLogin().then(() => request({ url: '/api/favorites' }))
}

/** COS 上传临时凭证（30 分钟有效，直传用） */
function getCosCredentials() {
  return ensureLogin().then(() => request({ url: '/api/cos/credentials' }))
}

// ---- 私聊（REST 辅助；实时收发走 utils/im/ 的 WebSocket 长连接）----

/** 会话列表：[{peerId,nickname,avatarUrl,listingId,listingTitle,lastContent,lastTypeu,lastTime,unread}] */
function chatSessions() {
  return ensureLogin().then(() => request({ url: '/api/chat/sessions' }))
}

/**
 * 聊天历史：peerId 对方用户 id；cursor 首页传 0；副作用把对方发我的 status=1 置 2。
 * listingId 限定技能会话（不传 = 无技能的旧会话，对应后端 listing_id IS NULL）
 */
function chatMessages(peerId, cursor, limit, listingId) {
  return ensureLogin().then(() => {
    const data = { peerId, cursor: cursor || 0, limit: limit || 20 }
    if (listingId) data.listingId = listingId
    return request({ url: '/api/chat/messages', data })
  })
}

/** 标记会话已读（listingId 含义同上） */
function chatMarkRead(peerId, listingId) {
  return ensureLogin().then(() => {
    const data = { peerId }
    if (listingId) data.listingId = listingId
    return request({ url: '/api/chat/read', method: 'POST', data })
  })
}

/** 未读总数（「我的」页角标） */
function chatUnread() {
  return ensureLogin().then(() => request({ url: '/api/chat/unread' }))
}

module.exports = {
  loadCategories,
  nearby,
  listingDetail,
  createListing,
  updateListing,
  offlineListing,
  relistListing,
  deleteListing,
  mineList,
  report,
  addFeedback,
  addFavorite,
  removeFavorite,
  favoriteList,
  getCosCredentials,
  chatSessions,
  chatMessages,
  chatMarkRead,
  chatUnread
}
