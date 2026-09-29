const { uploadImage } = require('../../utils/cos-upload')
const api = require('../../utils/api')
const { getUserInfo, updateUserInfo } = require('../../utils/request')

Page({
  data: {
    nickname: '',
    avatarUrl: '',
    saving: false
  },

  onLoad() {
    const user = getUserInfo() || {}
    this.setData({
      nickname: user.nickname || '',
      avatarUrl: user.avatarUrl || ''
    })
  },

  // 头像选择：微信头像选择器（可选微信头像/相册/拍照），回填临时路径，保存时再上传
  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  onSave() {
    if (this.data.saving) return
    const nickname = (this.data.nickname || '').trim()
    if (nickname.length > 30) {
      wx.showToast({ title: '昵称最长 30 字', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中', mask: true })
    const avatarUrl = this.data.avatarUrl || ''
    // 头像可能是临时路径（新选）或 https URL（回填），uploadImage 对 https 直接放行
    const upload = avatarUrl ? uploadImage(avatarUrl) : Promise.resolve('')
    upload
      .then((url) => api.updateProfile({ nickname, avatarUrl: url }))
      .then((data) => {
        updateUserInfo({ nickname: data.nickname, avatarUrl: data.avatarUrl })
        wx.hideLoading()
        wx.showToast({ title: '已保存', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
      })
      .catch(() => {
        wx.hideLoading()
        this.setData({ saving: false })
      })
  }
})
