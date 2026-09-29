// 分享卡片工具
//
// 微信 onShareAppMessage 只认三个字段：title / path / imageUrl，写别的没用。
// 文案格式和封面取图集中在这里，三处技能分享入口（发布成功页、详情页、我的列表）保持一致，
// 以后改文案只改这个文件。
//
// 注意 imageUrl 用网络图（COS 地址）时，域名必须配在小程序后台的 downloadFile 合法域名里，
// 它和 request / uploadFile 是三个互相独立的分类；没配的话封面不显示，微信会退回截取当前页面。

// 默认封面：技能没传图时用应用 Logo（本地代码包图，无需配 downloadFile 域名），
// 保证分享卡片有图，而不是退回截取当前页面
const DEFAULT_COVER = '/assets/logo.jpg'

// 生成「个人技能名片」卡片。id 拼进 path，好友点开时由 app.js 的 onShow 读出
// query.listingId -> globalData.focusListingId -> 地图页聚焦到这条技能
function skillCard(options) {
  const share = {
    title: `【个人名片】${options.title}`,
    // 没有 id 就别拼参数：listingId=0 会让地图页去补拉一条不存在的技能，好友那边报错
    path: options.id ? `/pages/map/index?listingId=${options.id}` : '/pages/map/index',
    // 封面用第一张图；没图时退回应用 Logo
    imageUrl: options.cover || DEFAULT_COVER
  }
  return share
}

module.exports = { skillCard, DEFAULT_COVER }
