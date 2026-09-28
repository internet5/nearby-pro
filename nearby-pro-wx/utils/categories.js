const { request } = require('./request')

const CACHE_KEY = 'nearby_pro_categories'
const ALL_ITEM = { id: 0, code: 'all', name: '全部', tags: [] }

// 硬编码兜底：接口不可用时保证基本可用（与数据库种子一致）
// tags 为可选预设标签（发布可选 0~3 个，可跳过）；保留 [{name}] 对象形状与接口返回一致
const CATEGORIES = [
  { id: 0, code: 'all', name: '全部', tags: [] },
  {
    id: 1,
    code: 'clean',
    name: '家政保洁',
    tags: [
      { name: '日常保洁' },
      { name: '深度保洁' },
      { name: '油烟机清洗' },
      { name: '空调清洗' },
      { name: '家电清洗' },
      { name: '收纳整理' }
    ]
  },
  {
    id: 2,
    code: 'repair',
    name: '维修安装',
    tags: [
      { name: '水电维修' },
      { name: '家电维修' },
      { name: '门窗维修' },
      { name: '家具安装' },
      { name: '管道疏通' },
      { name: '开锁换锁' }
    ]
  },
  {
    id: 3,
    code: 'tutor',
    name: '家教',
    tags: [
      { name: '小学课辅' },
      { name: '中学课辅' },
      { name: '英语辅导' },
      { name: '音乐' },
      { name: '美术' },
      { name: '书法' }
    ]
  },
  {
    id: 4,
    code: 'photo',
    name: '摄影',
    tags: [
      { name: '婚礼跟拍' },
      { name: '儿童摄影' },
      { name: '证件照' },
      { name: '约拍' },
      { name: '产品拍摄' }
    ]
  },
  {
    id: 5,
    code: 'run',
    name: '代驾跑腿',
    tags: [
      { name: '代驾' },
      { name: '代买' },
      { name: '代送' },
      { name: '排队代办' },
      { name: '同城取件' }
    ]
  },
  { id: 6, code: 'other', name: '其他', tags: [] },
  {
    id: 7,
    code: 'care',
    name: '陪护',
    tags: [
      { name: '老人陪护' },
      { name: '病人陪护' },
      { name: '母婴护理' },
      { name: '育儿嫂' },
      { name: '钟点照护' }
    ]
  },
  {
    id: 8,
    code: 'sell',
    name: '卖货',
    tags: [
      { name: '水果生鲜' },
      { name: '小吃熟食' },
      { name: '手工艺品' },
      { name: '日用百货' },
      { name: '花卉绿植' }
    ]
  },
  {
    id: 9,
    code: 'move',
    name: '搬运搬家',
    tags: [
      { name: '搬家' },
      { name: '搬货' },
      { name: '家具搬运' },
      { name: '设备搬运' },
      { name: '家具拆装' }
    ]
  },
  {
    id: 10,
    code: 'design',
    name: 'IT·设计',
    tags: [
      { name: '小程序开发' },
      { name: '网站开发' },
      { name: 'App开发' },
      { name: 'UI设计' },
      { name: '平面设计' },
      { name: 'Logo设计' },
      { name: '文案策划' },
      { name: '视频剪辑' }
    ]
  }
]

// 地图 marker 图标：assets/markers/{code}.png；新分类暂用相近图标占位，后续替换同名文件即可
const CODE_ICONS = {
  clean: 'clean',
  repair: 'repair',
  tutor: 'tutor',
  photo: 'photo',
  run: 'run',
  other: 'other',
  care: 'clean',
  sell: 'other',
  move: 'run',
  design: 'photo'
}

function iconForCode(code) {
  return CODE_ICONS[code] || 'other'
}

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

function joinList(values) {
  return (values || []).join(' · ')
}

module.exports = {
  CATEGORIES,
  currentCategories,
  loadFromApi,
  findCategory,
  tagList,
  joinList,
  iconForCode
}
