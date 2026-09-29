const { currentCategories, tagList } = require('../../utils/categories')
const api = require('../../utils/api')
const cos = require('../../utils/cos-upload')
const { markPublished } = require('../../utils/store')
const { limitInput, countInput } = require('../../utils/input')
const { skillCard, DEFAULT_COVER } = require('../../utils/share')

// 单张图片上限：COS 侧限制加上小程序压缩，超了直接拒绝避免上传白等
const MAX_IMAGES = 3

// 文本字段字数上限：wxml 里对应 maxlength="-1"，实际截断在 bindinput（原因见 utils/input.js）。
// 注意别改回原生 maxlength，那会让输入法拼音打到上限就卡住
const TITLE_MAX = 8
const DESC_MAX = 500
const AUTO_REPLY_MAX = 200

function toChipItems(options, selected) {
  return options.map((name) => ({
    name,
    on: selected.indexOf(name) >= 0
  }))
}

Page({
  data: {
    categories: currentCategories().filter((item) => item.id !== 0),
    // 二级工种标签：仅预设、可选 0~3 个、可跳过；选了分类才有选项
    tagItems: [],
    published: false,
    publishedTitle: '',
    // 发布成功后留存 id 与首图，供分享卡片拼 path 和封面
    publishedId: 0,
    publishedPhoto: '',
    editId: 0,
    submitting: false,
    // 技能名称已上屏字数（不含输入法未上屏的拼音），供计数器展示
    titleCount: 0,
    form: {
      categoryId: 0,
      tags: [],
      title: '',
      description: '',
      // 自动回复：仅在有别人首次咨询这个技能时由服务端代发
      autoReply: '',
      // 待上传图片列表：新选的是本地临时路径，编辑回填的是已上传 https 地址
      images: [],
      latitude: 0,
      longitude: 0,
      address: '',
      // 联系方式已不在页面收集（联系走私聊 IM）；字段保留用于兼容后端 NOT NULL 列与老数据编辑回传
      contactType: 'wechat',
      contactValue: ''
    }
  },

  // 带 id 进入 = 编辑模式：从详情接口回填，提交时更新而不是新增
  onLoad(options) {
    const editId = options && options.id ? Number(options.id) : 0
    if (!editId) return
    api
      .listingDetail(editId)
      .then((listing) => {
        const form = {
          categoryId: listing.categoryId,
          tags: (listing.tags || []).slice(),
          title: listing.title || '',
          description: listing.description || '',
          autoReply: listing.autoReply || '',
          // 老图是 https 直展示，提交时跳过上传
          images: (listing.photoUrls || []).slice(),
          latitude: listing.latitude || 0,
          longitude: listing.longitude || 0,
          address: listing.address || '',
          contactType: listing.contactType || 'wechat',
          contactValue: listing.contactValue || ''
        }
        this.setData({
          editId,
          form,
          titleCount: countInput(form.title),
          tagItems: toChipItems(tagList(form.categoryId), form.tags)
        })
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
  },

  onTag(e) {
    const tag = e.currentTarget.dataset.tag
    const tags = this.data.form.tags.slice()
    const index = tags.indexOf(tag)
    if (index >= 0) {
      tags.splice(index, 1)
    } else {
      if (tags.length >= 3) {
        wx.showToast({ title: '标签最多选 3 个', icon: 'none' })
        return
      }
      tags.push(tag)
    }
    this.setData({ tagItems: toChipItems(tagList(this.data.form.categoryId), tags), 'form.tags': tags })
  },

  onTitle(e) {
    const title = limitInput(e.detail.value, TITLE_MAX)
    this.setData({ 'form.title': title, titleCount: countInput(title) })
  },

  onDesc(e) {
    this.setData({ 'form.description': limitInput(e.detail.value, DESC_MAX) })
  },

  onAutoReply(e) {
    this.setData({ 'form.autoReply': limitInput(e.detail.value, AUTO_REPLY_MAX) })
  },

  // 添加图片：最多 3 张，压缩质量（直传 COS）
  onAddImage() {
    // 选择器开着的时候忽略重复点击：微信不允许并发调用 chooseMedia，
    // 第二次调用会直接 fail，且没有任何反馈，表现就是「点了没反应」
    if (this._choosingImage) return
    const remain = MAX_IMAGES - this.data.form.images.length
    if (remain <= 0) {
      wx.showToast({ title: '最多传 3 张', icon: 'none' })
      return
    }
    this._choosingImage = true
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = (res.tempFiles || []).map((file) => file.tempFilePath)
        if (paths.length) {
          this.setData({ 'form.images': this.data.form.images.concat(paths) })
        }
      },
      // 没有 fail 的话失败完全无声，用户只会看到「点了没反应」，这里必须给出反馈
      fail: (err) => {
        const msg = (err && err.errMsg) || ''
        // 用户主动取消是常态，不打扰
        if (msg.indexOf('cancel') >= 0) return
        console.error('chooseMedia 失败：', msg)
        // 相册/摄像头授权被拒过之后微信不再弹授权框，只能引导去设置页打开
        if (msg.indexOf('auth') >= 0 || msg.indexOf('deny') >= 0) {
          wx.showModal({
            title: '无法打开相册',
            content: '请在设置里允许「使用相册和摄像头」后重试',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting()
            }
          })
          return
        }
        wx.showToast({ title: '打开相册失败，请重试', icon: 'none' })
      },
      complete: () => {
        this._choosingImage = false
      }
    })
  },

  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.form.images })
  },

  onDeleteImage(e) {
    const index = Number(e.currentTarget.dataset.index)
    const images = this.data.form.images.slice()
    images.splice(index, 1)
    this.setData({ 'form.images': images })
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

  // 串行上传图片到 COS，resolve https 地址数组；任一失败即中止并 toast
  uploadAllImages() {
    const images = this.data.form.images
    const next = (i, urls) => {
      if (i >= images.length) return Promise.resolve(urls)
      wx.showLoading({ title: '上传图片 ' + (i + 1) + '/' + images.length, mask: true })
      return cos
        .uploadImage(images[i])
        .then((url) => {
          wx.hideLoading()
          return next(i + 1, urls.concat(url))
        })
        .catch((e) => {
          wx.hideLoading()
          wx.showToast({ title: (e && e.message) || '上传失败，请稍后再试', icon: 'none' })
          throw e
        })
    }
    return next(0, [])
  },

  onSubmit() {
    const form = this.data.form
    // 输入框已按 TITLE_MAX 截断，这里兜底再截一次（粘贴等绕过 bindinput 的路径）
    const title = (form.title || '').trim().slice(0, TITLE_MAX)
    if (!form.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' })
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
    if (this.data.submitting) return
    this.setData({ submitting: true })
    // 先串行直传图片到 COS（内部已是 https 的旧图会跳过），再提交表单
    this.uploadAllImages()
      .then((photoUrls) => {
        // payload 与后端 ListingSaveReq 对齐；联系方式不再收集：新建传空串，编辑回传原值
        const payload = {
          categoryId: form.categoryId,
          tags: form.tags,
          title,
          description: (form.description || '').trim(),
          autoReply: (form.autoReply || '').trim(),
          photoUrls,
          contactType: form.contactType || 'wechat',
          contactValue: (form.contactValue || '').trim(),
          latitude: form.latitude,
          longitude: form.longitude,
          address: form.address,
          city: ''
        }
        // 编辑模式：只更新内容，不重置有效期、不清浏览数；保存后直接返回列表
        if (this.data.editId) {
          return api.updateListing(this.data.editId, payload).then(() => {
            wx.showToast({ title: '已保存', icon: 'success' })
            setTimeout(() => wx.navigateBack(), 400)
          })
        }
        return api.createListing(payload).then((data) => {
          console.log('[发布] 提交成功，返回 =', JSON.stringify(data))
          try {
            // 停在成功页引导转发，不自动跳走；同时释放提交锁
            this.setData({
              published: true,
              publishedTitle: title,
              publishedId: (data && data.id) || 0,
              publishedPhoto: photoUrls[0] || '',
              submitting: false
            })
            markPublished()
            // 地图页 onShow 据此作废分类缓存并重拉（switchTab 不能传参）
            getApp().globalData.listingsDirty = true
          } catch (e) {
            // 任何异常都不吞掉成功反馈
            console.error('[发布] 成功页渲染异常', e)
            wx.showToast({ title: '已发布，但成功页展示异常', icon: 'none' })
          }
        })
      })
      .catch((e) => {
        console.error('[发布] 提交失败', e)
        this.setData({ submitting: false })
        // 上传失败已在 uploadAllImages 里 toast；接口错误由 request 统一 toast，这里不再重复
      })
  },

  onGoMap() {
    wx.switchTab({ url: '/pages/map/index' })
  },

  onShareAppMessage() {
    if (this.data.published && this.data.publishedTitle) {
      return skillCard({
        id: this.data.publishedId,
        title: this.data.publishedTitle,
        cover: this.data.publishedPhoto
      })
    }
    return {
      title: '找附近的手艺人，上附近职人',
      path: '/pages/map/index',
      imageUrl: DEFAULT_COVER
    }
  }
})
