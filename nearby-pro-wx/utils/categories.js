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

function findCategory(id) {
  return CATEGORIES.find((item) => item.id === id) || CATEGORIES[6]
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

function joinList(values) {
  return (values || []).join(' · ')
}

function shortLabel(item) {
  if (item.items && item.items.length) return item.items[0]
  if (item.tags && item.tags.length) return item.tags[0]
  const title = item.title || ''
  return title.length > 8 ? `${title.slice(0, 8)}…` : title
}

module.exports = {
  CATEGORIES,
  findCategory,
  tagList,
  itemsOfTag,
  itemsOfTags,
  joinList,
  shortLabel
}
