const CATEGORIES = [
  { id: 0, code: 'all', name: '全部' },
  { id: 1, code: 'clean', name: '家政保洁' },
  { id: 2, code: 'repair', name: '维修安装' },
  { id: 3, code: 'tutor', name: '家教陪练' },
  { id: 4, code: 'photo', name: '摄影跟拍' },
  { id: 5, code: 'run', name: '代驾跑腿' },
  { id: 6, code: 'other', name: '其他' }
]

function findCategory(id) {
  return CATEGORIES.find((item) => item.id === id) || CATEGORIES[6]
}

module.exports = {
  CATEGORIES,
  findCategory
}
