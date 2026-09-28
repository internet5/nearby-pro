// 腾讯位置服务路线规划：key 到 lbs.qq.com 申请（选「WebServiceAPI」类型，开通「路线规划」服务）。
// 并在 mp 后台把 https://apis.map.qq.com 加进 request 合法域名（真机强制校验，开发者工具可勾「不校验」绕过）。
const TENCENT_MAP_KEY = '4T2BZ-63AK3-4CL3G-YNMUG-BN6N7-WNBC5'

// 拉取步行路线（沿道路）。成功 resolve { points, distance, duration }；无 key / 失败 resolve null 回退直线。
// points 为 map 组件 polyline 可用的点数组；distance 单位米，duration 单位分钟。
function fetchWalkingRoute(from, to) {
  return new Promise((resolve) => {
    if (!TENCENT_MAP_KEY) return resolve(null)
    wx.request({
      url: 'https://apis.map.qq.com/ws/direction/v1/walking/',
      data: {
        from: `${from.latitude},${from.longitude}`,
        to: `${to.latitude},${to.longitude}`,
        key: TENCENT_MAP_KEY
      },
      success: (res) => {
        const route = res.data && res.data.result && res.data.result.routes && res.data.result.routes[0]
        if (!route || !route.polyline) return resolve(null)
        // 腾讯返回的 polyline 是压缩坐标数组：[起点纬度, 起点经度, 之后每两个数为相对上一点的偏移(单位 1e-6 度)]
        const coords = route.polyline
        if (!Array.isArray(coords) || coords.length < 2) return resolve(null)
        const points = [{ latitude: coords[0], longitude: coords[1] }]
        for (let i = 2; i + 1 < coords.length; i += 2) {
          const prev = points[points.length - 1]
          points.push({
            latitude: prev.latitude + coords[i] / 1e6,
            longitude: prev.longitude + coords[i + 1] / 1e6
          })
        }
        resolve({ points, distance: route.distance, duration: route.duration })
      },
      fail: (err) => {
        // 常见失败：合法域名未配 https://apis.map.qq.com（真机强制校验）
        console.error('腾讯路线规划请求失败：', err && err.errMsg)
        resolve(null)
      }
    })
  })
}

module.exports = { fetchWalkingRoute }
