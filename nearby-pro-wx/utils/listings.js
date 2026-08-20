const { CATEGORIES } = require('../../utils/categories')
const { getMine } = require('../../utils/store')

function findListing(id) {
  const numId = Number(id)
  const cached = (getApp().globalData.listings || []).find((item) => Number(item.id) === numId)
  if (cached) return cached
  return getMine().find((item) => Number(item.id) === numId) || null
}

module.exports = {
  CATEGORIES,
  findListing
}
