const { findCategory, joinList, flattenItems } = require('./categories')
const { addDays } = require('./geo')

// items 按工种分组存储：[{ tag: '工种名', names: ['会做的项目'] }]
const SEEDS = [
  { categoryId: 2, tags: ['水电维修'], items: [{ tag: '水电维修', names: ['电路跳闸', '水管漏水'] }], name: '张师傅', title: '上门水电维修', desc: '电路跳闸、水管漏水，一般当天能上门。', contactType: 'wechat', contactValue: 'zhang_sdwx', dy: 0.0018, dx: 0.0024 },
  { categoryId: 1, tags: ['日常保洁', '收纳整理'], items: [], name: '刘阿姨', title: '家庭保洁收纳', desc: '日常保洁、开荒、收纳整理，自带工具。', contactType: 'phone', contactValue: '13800001111', dy: -0.0021, dx: 0.0011 },
  { categoryId: 3, tags: ['学科辅导'], items: [{ tag: '学科辅导', names: ['小学数学'] }], name: '陈老师', title: '小学数学辅导', desc: '三到六年级，周末可上门，先试听一次。', contactType: 'wechat', contactValue: 'chen_math', dy: 0.0032, dx: -0.0016 },
  { categoryId: 4, tags: ['活动跟拍'], items: [], name: '阿森', title: '活动跟拍摄影', desc: '生日、求婚、小型活动跟拍，出图快。', contactType: 'wechat', contactValue: 'sen_photo', dy: -0.0012, dx: -0.0028 },
  { categoryId: 5, tags: ['代驾', '跑腿取送'], items: [], name: '老周', title: '同城代驾跑腿', desc: '夜间代驾、取送文件，按公里计价。', contactType: 'phone', contactValue: '13900002222', dy: 0.0006, dx: 0.0036 },
  { categoryId: 2, tags: ['家电维修'], items: [{ tag: '家电维修', names: ['空调'] }], name: '王工', title: '只修空调', desc: '挂机柜机清洗加氟，不修电磁炉和厨电。', contactType: 'phone', contactValue: '13700003333', dy: 0.0026, dx: -0.0031 },
  { categoryId: 2, tags: ['家电维修'], items: [{ tag: '家电维修', names: ['电磁炉', '油烟机', '热水器'] }], name: '周师傅', title: '厨电维修', desc: '电磁炉、灶具、油烟机、热水器，上门检测。', contactType: 'wechat', contactValue: 'zhou_chudian', dy: -0.0015, dx: 0.0029 },
  { categoryId: 1, tags: ['开荒保洁', '家电清洗'], items: [{ tag: '家电清洗', names: ['油烟机'] }], name: '小梅', title: '深度开荒保洁', desc: '新房开荒、油烟机清洗，按面积报价。', contactType: 'wechat', contactValue: 'meimei_clean', dy: -0.0034, dx: 0.0008 },
  { categoryId: 3, tags: ['兴趣陪练'], items: [{ tag: '兴趣陪练', names: ['篮球'] }], name: '林教练', title: '少儿篮球陪练', desc: '小区球场即可，兴趣启蒙为主。', contactType: 'wechat', contactValue: 'lin_ball', dy: 0.0011, dx: -0.0042 },
  { categoryId: 6, tags: ['宠物照看'], items: [{ tag: '宠物照看', names: ['喂猫'] }], name: '阿宁', title: '宠物上门喂养', desc: '出差期间上门喂猫，可发视频。', contactType: 'wechat', contactValue: 'ning_pet', dy: -0.0004, dx: 0.0019 },
  { categoryId: 4, tags: ['证件形象'], items: [], name: '苏苏', title: '证件照形象照', desc: '室内自然光拍摄，修图包含在内。', contactType: 'phone', contactValue: '13600004444', dy: 0.0041, dx: 0.0014 },
  { categoryId: 2, tags: ['家具安装'], items: [{ tag: '家具安装', names: ['灯具窗帘', '电视挂墙'] }], name: '赵师傅', title: '家具家电安装', desc: '灯具、窗帘、晾衣架、电视挂墙。', contactType: 'wechat', contactValue: 'zhao_az', dy: -0.0027, dx: -0.0018 },
  { categoryId: 5, tags: ['搬家搬运'], items: [], name: '阿凯', title: '帮忙搬家搬运', desc: '小件搬运、学生搬家，有小面包车。', contactType: 'phone', contactValue: '13500005555', dy: 0.0009, dx: -0.0022 }
]

function buildMockListings(center) {
  const expireTime = addDays(new Date(), 30).toISOString()
  return SEEDS.map((seed, index) => {
    const cat = findCategory(seed.categoryId)
    const tags = seed.tags || []
    const items = seed.items || []
    return {
      id: 1000 + index,
      userId: `mock_${index}`,
      nickname: seed.name,
      avatarUrl: '',
      categoryId: seed.categoryId,
      categoryCode: cat.code,
      categoryName: cat.name,
      tags,
      tagText: joinList(tags),
      items,
      itemText: joinList(flattenItems(items)),
      title: seed.title,
      description: seed.desc,
      photoUrls: [],
      contactType: seed.contactType,
      contactValue: seed.contactValue,
      latitude: center.latitude + seed.dy,
      longitude: center.longitude + seed.dx,
      address: '当前位置附近',
      status: 1,
      expireTime,
      viewCount: 8 + index * 3,
      createTime: new Date().toISOString(),
      isOwner: false
    }
  })
}

module.exports = {
  buildMockListings
}
