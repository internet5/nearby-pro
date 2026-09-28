const api = require('../../utils/api')
const { limitInput } = require('../../utils/input')

// 反馈内容字数上限：wxml 里对应 maxlength="-1"，截断在 onInput（原因见 utils/input.js）
const CONTENT_MAX = 300

Page({
  data: {
    content: '',
    submitting: false
  },

  onInput(e) {
    this.setData({ content: limitInput(e.detail.value, CONTENT_MAX) })
  },

  onSubmit() {
    const content = (this.data.content || '').trim().slice(0, CONTENT_MAX)
    if (!content) {
      wx.showToast({ title: '写点什么再提交吧', icon: 'none' })
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })
    api
      .addFeedback(content)
      .then(() => {
        wx.showToast({ title: '已收到，感谢反馈', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 400)
      })
      .catch(() => this.setData({ submitting: false }))
  }
})
