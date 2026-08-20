const { findCategory, joinList } = require('./categories')
const { addDays } = require('./geo')

const MINE_KEY = 'nearby_pro_my_listings'
const OFFLINE_KEY = 'nearby_pro_offline_ids'

function getMine() {
  return wx.getStorageSync(MINE_KEY) || []
}

function saveMine(list) {
  wx.setStorageSync(MINE_KEY, list)
}

function getOfflineIds() {
  return wx.getStorageSync(OFFLINE_KEY) || []
}

function addListing(payload) {
  const cat = findCategory(payload.categoryId)
  const item = {
    id: Date.now(),
    userId: 'me',
    nickname: '我',
    avatarUrl: '',
    categoryId: payload.categoryId,
    categoryCode: cat.code,
    categoryName: cat.name,
    tags: payload.tags || [],
    tagText: joinList(payload.tags || []),
    items: payload.items || [],
    itemText: joinList(payload.items || []),
    title: payload.title,
    description: payload.description || '',
    photoUrls: [],
    contactType: payload.contactType,
    contactValue: payload.contactValue,
    latitude: payload.latitude,
    longitude: payload.longitude,
    address: payload.address || '',
    status: 1,
    expireTime: addDays(new Date(), 30).toISOString(),
    viewCount: 0,
    createTime: new Date().toISOString(),
    isOwner: true
  }
  const list = getMine()
  list.unshift(item)
  saveMine(list)
  return item
}

function offlineListing(id) {
  const mine = getMine().map((item) => {
    if (item.id === id) return { ...item, status: 2 }
    return item
  })
  saveMine(mine)
  const ids = getOfflineIds()
  if (ids.indexOf(id) < 0) {
    ids.push(id)
    wx.setStorageSync(OFFLINE_KEY, ids)
  }
}

function isOffline(id) {
  return getOfflineIds().indexOf(id) >= 0
}

module.exports = {
  getMine,
  addListing,
  offlineListing,
  isOffline
}
