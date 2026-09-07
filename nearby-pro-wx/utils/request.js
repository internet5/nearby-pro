const { BASE_URL, MOCK_LOGIN } = require('./config')

const TOKEN_KEY = 'nearby_pro_token'
const USER_KEY = 'nearby_pro_user'
const DEVICE_KEY = 'nearby_pro_device_id'

// 进行中的登录 Promise：防止并发请求同时触发多次登录
let pendingLogin = null

function getToken() {
  return wx.getStorageSync(TOKEN_KEY) || ''
}

function getUserInfo() {
  return wx.getStorageSync(USER_KEY) || null
}

function clearAuth() {
  wx.removeStorageSync(TOKEN_KEY)
}

// 登录凭证：联调模式用本机持久 ID（保证后端 mock openid 稳定），正式模式用 wx.login 的 code
function getLoginCode() {
  if (MOCK_LOGIN) {
    let deviceId = wx.getStorageSync(DEVICE_KEY)
    if (!deviceId) {
      deviceId = 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
      wx.setStorageSync(DEVICE_KEY, deviceId)
    }
    return Promise.resolve(deviceId)
  }
  return new Promise((resolve, reject) => {
    wx.login({
      success: (res) => (res.code ? resolve(res.code) : reject(new Error('wx.login 未返回 code'))),
      fail: reject
    })
  })
}

// 真正发起登录：code -> wxLogin -> 存 token 与用户信息
function doLogin() {
  return getLoginCode()
    .then(
      (code) =>
        new Promise((resolve, reject) => {
          wx.request({
            url: `${BASE_URL}/api/auth/wxLogin`,
            method: 'POST',
            data: { code },
            success: (res) => {
              const body = res.data || {}
              if (res.statusCode === 200 && body.success && body.data) {
                wx.setStorageSync(TOKEN_KEY, body.data.token)
                wx.setStorageSync(USER_KEY, {
                  userId: body.data.userId,
                  nickname: body.data.nickname,
                  avatarUrl: body.data.avatarUrl || ''
                })
                resolve(body.data)
              } else {
                reject(new Error(body.message || '登录失败'))
              }
            },
            fail: () => reject(new Error('network'))
          })
        })
    )
}

// 强制重新登录（token 失效时用）：先清旧 token 再走登录
function forceLogin() {
  clearAuth()
  if (!pendingLogin) {
    pendingLogin = doLogin().finally(() => {
      pendingLogin = null
    })
  }
  return pendingLogin
}

// 确保已登录：有 token 直接返回用户信息，否则静默登录
function ensureLogin() {
  if (getToken()) {
    return Promise.resolve(getUserInfo())
  }
  return forceLogin()
}

// 统一请求：返回 Promise<data>。业务失败 toast 后 reject；「请先登录」自动重登并重试一次
function request({ url, method = 'GET', data }) {
  const attempt = (retries) =>
    new Promise((resolve, reject) => {
      const header = {}
      const token = getToken()
      if (token) header.Authorization = `Bearer ${token}`
      wx.request({
        url: BASE_URL + url,
        method,
        data,
        header,
        success: (res) => {
          const body = res.data || {}
          if (res.statusCode === 200 && body.success) {
            resolve(body.data)
            return
          }
          const message = body.message || '请求失败，请稍后再试'
          // 登录态失效（后端重启换密钥 / token 过期）：重登一次再试
          if (retries > 0 && message.indexOf('请先登录') >= 0) {
            forceLogin()
              .then(() => resolve(attempt(retries - 1)))
              .catch(() => {
                wx.showToast({ title: '登录失败，请稍后再试', icon: 'none' })
                reject(new Error(message))
              })
            return
          }
          wx.showToast({ title: message, icon: 'none' })
          reject(new Error(message))
        },
        fail: () => {
          wx.showToast({ title: '网络开小差了，请稍后再试', icon: 'none' })
          reject(new Error('network'))
        }
      })
    })
  return attempt(1)
}

module.exports = {
  request,
  ensureLogin,
  forceLogin,
  getToken,
  getUserInfo
}
