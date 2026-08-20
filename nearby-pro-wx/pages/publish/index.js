const { CATEGORIES } = require('../../utils/categories')
const { addListing, getMine } = require('../../utils/store')

Page({
  data: {
    categories: CATEGORIES.filter((item) => item.id !== 0),
    form: {
      categoryId: 2,
      title: '',
      description: '',
      latitude: 0,
      longitude: 0,
      address: '',
      contactType: 'wechat',
      contactValue: ''
    }
  },

  onCategory(e) {
    this.setData({ 'form.categoryId': Number(e.currentTarget.dataset.id) })
  },

  onTitle(e) {
    this.setData({ 'form.title': e.detail.value })
  },

  onDesc(e) {
    this.setData({ 'form.description': e.detail.value })
  },

  onContactType(e) {
    this.setData({ 'form.contactType': e.currentTarget.dataset.type })
  },

  onContactValue(e) {
    this.setData({ 'form.contactValue': e.detail.value })
  },

  onChooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.latitude': res.latitude,
          'form.longitude': res.longitude,
          'form.address': res.name || res.address || '已选位置'
        })
      },
      fail: () => {
        wx.showToast({ title: '未选择位置', icon: 'none' })
      }
    })
  },

  onSubmit() {
    const form = this.data.form
    const title = (form.title || '').trim()
    const contactValue = (form.contactValue || '').trim()
    if (!form.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
      return
    }
    if (title.length < 2) {
      wx.showToast({ title: '请填写技能名称', icon: 'none' })
      return
    }
    if (!form.latitude || !form.longitude) {
      wx.showToast({ title: '请选择服务位置', icon: 'none' })
      return
    }
    if (!contactValue) {
      wx.showToast({ title: '请填写联系方式', icon: 'none' })
      return
    }
    const activeCount = getMine().filter((item) => item.status === 1).length
    if (activeCount >= 3) {
      wx.showToast({ title: '同时最多上架 3 条', icon: 'none' })
      return
    }
    addListing({
      ...form,
      title,
      description: (form.description || '').trim(),
      contactValue
    })
    wx.showToast({ title: '已发布到地图', icon: 'success' })
    setTimeout(() => {
      wx.switchTab({ url: '/pages/map/index' })
    }, 400)
  }
})
