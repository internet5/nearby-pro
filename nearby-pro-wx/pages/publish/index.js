const { CATEGORIES, tagList, itemsOfTags } = require('../../utils/categories')
const { addListing, getMine } = require('../../utils/store')

function toChipItems(options, selected) {
  return options.map((name) => ({
    name,
    on: selected.indexOf(name) >= 0
  }))
}

Page({
  data: {
    categories: CATEGORIES.filter((item) => item.id !== 0),
    tagItems: toChipItems(tagList(2), []),
    skillItems: [],
    showSkills: false,
    form: {
      categoryId: 2,
      tags: [],
      items: [],
      title: '',
      description: '',
      latitude: 0,
      longitude: 0,
      address: '',
      contactType: 'wechat',
      contactValue: ''
    }
  },

  syncSkills(categoryId, tags, items) {
    const options = itemsOfTags(categoryId, tags)
    const kept = items.filter((name) => options.indexOf(name) >= 0)
    return {
      skillItems: toChipItems(options, kept),
      showSkills: options.length > 0,
      items: kept
    }
  },

  onCategory(e) {
    const categoryId = Number(e.currentTarget.dataset.id)
    this.setData({
      tagItems: toChipItems(tagList(categoryId), []),
      skillItems: [],
      showSkills: false,
      'form.categoryId': categoryId,
      'form.tags': [],
      'form.items': []
    })
  },

  onTag(e) {
    const tag = e.currentTarget.dataset.tag
    const tags = this.data.form.tags.slice()
    const index = tags.indexOf(tag)
    if (index >= 0) {
      tags.splice(index, 1)
    } else {
      if (tags.length >= 3) {
        wx.showToast({ title: '工种最多选 3 个', icon: 'none' })
        return
      }
      tags.push(tag)
    }
    const skills = this.syncSkills(this.data.form.categoryId, tags, this.data.form.items)
    this.setData({
      tagItems: toChipItems(tagList(this.data.form.categoryId), tags),
      skillItems: skills.skillItems,
      showSkills: skills.showSkills,
      'form.tags': tags,
      'form.items': skills.items
    })
  },

  onSkill(e) {
    const name = e.currentTarget.dataset.name
    const items = this.data.form.items.slice()
    const index = items.indexOf(name)
    if (index >= 0) {
      items.splice(index, 1)
    } else {
      items.push(name)
    }
    this.setData({
      skillItems: toChipItems(itemsOfTags(this.data.form.categoryId, this.data.form.tags), items),
      'form.items': items
    })
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
    if (!form.tags.length) {
      wx.showToast({ title: '请至少选一个工种', icon: 'none' })
      return
    }
    if (this.data.showSkills && !form.items.length) {
      wx.showToast({ title: '请勾选你会做的具体项目', icon: 'none' })
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
