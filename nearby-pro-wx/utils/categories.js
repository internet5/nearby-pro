const { request } = require('./request')

const CACHE_KEY = 'nearby_pro_categories'
const ALL_ITEM = { id: 0, code: 'all', name: '全部', tags: [] }

// 硬编码兜底：接口不可用时保证基本可用（与数据库种子一致）
const CATEGORIES = [
  { id: 0, code: 'all', name: '全部', tags: [] },
  {
    id: 1,
    code: 'clean',
    name: '家政保洁',
    tags: [
      { name: '日常保洁', items: [] },
      { name: '开荒保洁', items: [] },
      { name: '收纳整理', items: [] },
      { name: '家电清洗', items: ['油烟机', '空调', '洗衣机', '冰箱'] }
    ]
  },
  {
    id: 2,
    code: 'repair',
    name: '维修安装',
    tags: [
      { name: '水电维修', items: ['电路跳闸', '水管漏水', '开关插座', '灯具'] },
      { name: '家电维修', items: ['空调', '冰箱', '洗衣机', '热水器', '油烟机', '电磁炉', '电视'] },
      { name: '家具安装', items: ['灯具窗帘', '晾衣架', '家具组装', '电视挂墙'] },
      { name: '管道疏通', items: ['马桶', '地漏', '厨房管道'] }
    ]
  },
  {
    id: 3,
    code: 'tutor',
    name: '家教陪练',
    tags: [
      { name: '学科辅导', items: ['小学数学', '小学语文', '英语', '物理', '化学'] },
      { name: '兴趣陪练', items: ['篮球', '钢琴', '书法'] },
      { name: '语言培训', items: [] }
    ]
  },
  {
    id: 4,
    code: 'photo',
    name: '摄影跟拍',
    tags: [
      { name: '活动跟拍', items: [] },
      { name: '证件形象', items: [] },
      { name: '宠物拍摄', items: [] }
    ]
  },
  {
    id: 5,
    code: 'run',
    name: '代驾跑腿',
    tags: [
      { name: '代驾', items: [] },
      { name: '跑腿取送', items: [] },
      { name: '搬家搬运', items: [] }
    ]
  },
  {
    id: 6,
    code: 'other',
    name: '其他',
    tags: [
      { name: '宠物照看', items: ['喂猫', '喂狗'] },
      { name: '陪诊陪护', items: [] }
    ]
  }
]

// 当前生效的分类字典：接口数据 > 上次缓存 > 硬编码兜底
const cached = wx.getStorageSync(CACHE_KEY)
let dynamicCategories = cached && cached.length ? [ALL_ITEM].concat(cached) : null

function currentCategories() {
  return dynamicCategories || CATEGORIES
}

// 拉取服务端分类字典（运营可改库调整），成功写缓存；失败回退缓存/兜底
function loadFromApi() {
  return request({ url: '/api/categories' }).then((list) => {
    const categories = [ALL_ITEM].concat(list || [])
    dynamicCategories = categories
    wx.setStorageSync(CACHE_KEY, list || [])
    return categories
  })
}

function findCategory(id) {
  const list = currentCategories()
  return list.find((item) => item.id === id) || list[list.length - 1] || CATEGORIES[6]
}

function tagList(categoryId) {
  return (findCategory(categoryId).tags || []).map((tag) => tag.name)
}

function itemsOfTag(categoryId, tagName) {
  const tag = (findCategory(categoryId).tags || []).find((item) => item.name === tagName)
  return (tag && tag.items) || []
}

function itemsOfTags(categoryId, tagNames) {
  const result = []
  ;(tagNames || []).forEach((name) => {
    itemsOfTag(categoryId, name).forEach((item) => {
      if (result.indexOf(item) < 0) result.push(item)
    })
  })
  return result
}

// 把 items 归一化为按工种分组的统一形状 [{ tag, names: [] }]
// 兼容旧版平铺结构 ["空调","电磁炉"]（分不清归属，tag 记为空串）
function normalizeItems(items) {
  if (!items || !items.length) return []
  if (typeof items[0] === 'string') {
    return [{ tag: '', names: items.slice() }]
  }
  return items.map((group) => ({
    tag: group.tag || '',
    names: (group.names || []).slice()
  }))
}

// 打平所有组的项目名，用于列表文案和按项目筛选
function flattenItems(items) {
  const result = []
  normalizeItems(items).forEach((group) => {
    group.names.forEach((name) => {
      if (result.indexOf(name) < 0) result.push(name)
    })
  })
  return result
}

function joinList(values) {
  return (values || []).join(' · ')
}

function shortLabel(item) {
  const flat = flattenItems(item.items)
  if (flat.length) return flat[0]
  if (item.tags && item.tags.length) return item.tags[0]
  const title = item.title || ''
  return title.length > 8 ? `${title.slice(0, 8)}…` : title
}

module.exports = {
  CATEGORIES,
  currentCategories,
  loadFromApi,
  findCategory,
  tagList,
  itemsOfTag,
  itemsOfTags,
  normalizeItems,
  flattenItems,
  joinList,
  shortLabel
}
