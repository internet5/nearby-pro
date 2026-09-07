const { CATEGORIES, currentCategories, tagList, itemsOfTag, normalizeItems } = require('../../utils/categories')
const api = require('../../utils/api')
const { markPublished } = require('../../utils/store')

function toChipItems(options, selected) {
  return options.map((name) => ({
    name,
    on: selected.indexOf(name) >= 0
  }))
}

// 按选中的工种生成分组勾选项：[{ tag, options: [{ name, on }] }]
// form.items 形状为 [{ tag, names }]，names 取各组里勾上的项目
function toGroupOptions(categoryId, tags, items) {
  const groups = []
  ;(tags || []).forEach((tag) => {
    const names = itemsOfTag(categoryId, tag)
    if (!names.length) return
    const group = (items || []).find((item) => item.tag === tag)
    const selected = (group && group.names) || []
    groups.push({
      tag,
      options: toChipItems(names, selected)
    })
  })
  return groups
}

Page({
  data: {
    categories: currentCategories().filter((item) => item.id !== 0),
    tagItems: toChipItems(tagList(2), []),
    skillGroups: [],
    showSkills: false,
    published: false,
    publishedTitle: '',
    editId: 0,
    submitting: false,
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

  // 由分组勾选项派生 form.items，保证勾选状态只有一份来源
  applyGroups(groups) {
    const items = groups.map((group) => ({
      tag: group.tag,
      names: group.options.filter((opt) => opt.on).map((opt) => opt.name)
    }))
    this.setData({
      skillGroups: groups,
      showSkills: groups.length > 0,
      'form.items': items
    })
  },

  // 带 id 进入 = 编辑模式：从详情接口回填（mine 列表不含联系方式与描述），提交时更新而不是新增
  onLoad(options) {
    const editId = options && options.id ? Number(options.id) : 0
    if (!editId) return
    api
      .listingDetail(editId)
      .then((listing) => {
        const form = {
          categoryId: listing.categoryId,
          tags: (listing.tags || []).slice(),
          items: normalizeItems(listing.items),
          title: listing.title || '',
          description: listing.description || '',
          latitude: listing.latitude || 0,
          longitude: listing.longitude || 0,
          address: listing.address || '',
          contactType: listing.contactType || 'wechat',
          contactValue: listing.contactValue || ''
        }
        this.setData({
          editId,
          form,
          tagItems: toChipItems(tagList(form.categoryId), form.tags)
        })
        this.applyGroups(toGroupOptions(form.categoryId, form.tags, form.items))
        wx.setNavigationBarTitle({ title: '编辑技能' })
      })
      .catch(() => {})
  },

  onCategory(e) {
    const categoryId = Number(e.currentTarget.dataset.id)
    this.setData({
      tagItems: toChipItems(tagList(categoryId), []),
      'form.categoryId': categoryId,
      'form.tags': []
    })
    this.applyGroups([])
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
    this.setData({ tagItems: toChipItems(tagList(this.data.form.categoryId), tags), 'form.tags': tags })
    this.applyGroups(toGroupOptions(this.data.form.categoryId, tags, this.data.form.items))
  },

  onSkill(e) {
    const { tag, name } = e.currentTarget.dataset
    const groups = this.data.skillGroups.map((group) => {
      if (group.tag !== tag) return group
      return {
        ...group,
        options: group.options.map((opt) => (opt.name === name ? { ...opt, on: !opt.on } : opt))
      }
    })
    this.applyGroups(groups)
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

  // 分类字典可能已被接口热更新：非编辑状态下切进来时刷新一次
  onShow() {
    if (!this.data.editId && !this.data.published) {
      this.setData({ categories: currentCategories().filter((item) => item.id !== 0) })
    }
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
    const pickedCount = form.items.reduce((sum, group) => sum + group.names.length, 0)
    if (this.data.showSkills && !pickedCount) {
      wx.showToast({ title: '请勾选你会做的具体项目', icon: 'none' })
      return
    }
    if (title.length < 2) {
      wx.showToast({
        title: title.length === 0 ? '请填写技能名称（一句话介绍）' : '技能名称至少两个字',
        icon: 'none'
      })
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
    if (this.data.submitting) return
    this.setData({ submitting: true })
    // payload 与后端 ListingSaveReq 对齐；图片上传暂未开放
    const payload = {
      ...form,
      title,
      description: (form.description || '').trim(),
      contactValue,
      photoUrls: [],
      city: ''
    }
    const done = () => this.setData({ submitting: false })
    // 编辑模式：只更新内容，不重置有效期、不清浏览数；保存后直接返回列表
    if (this.data.editId) {
      api
        .updateListing(this.data.editId, payload)
        .then(() => {
          wx.showToast({ title: '已保存', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 400)
        })
        .catch(done)
      return
    }
    api
      .createListing(payload)
      .then((data) => {
        console.log('[发布] 提交成功，返回 =', JSON.stringify(data))
        try {
          // 停在成功页引导转发，不自动跳走；同时释放提交锁
          this.setData({ published: true, publishedTitle: title, submitting: false })
          markPublished()
        } catch (e) {
          // 任何异常都不吞掉成功反馈
          console.error('[发布] 成功页渲染异常', e)
          wx.showToast({ title: '已发布，但成功页展示异常', icon: 'none' })
        }
      })
      .catch((e) => {
        console.error('[发布] 提交失败', e)
        done()
      })
  },

  onGoMap() {
    wx.switchTab({ url: '/pages/map/index' })
  },

  onShareAppMessage() {
    if (this.data.published && this.data.publishedTitle) {
      return {
        title: `我发布了「${this.data.publishedTitle}」，附近的朋友看过来`,
        path: '/pages/map/index'
      }
    }
    return {
      title: '找附近的手艺人，上附近职人',
      path: '/pages/map/index'
    }
  }
})
