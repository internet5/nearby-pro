const api = require('../../utils/api')

Page({
  data: {
    content: '',
    submitting: false
  },

  onInput(e) {
    this.setData({ content: e.detail.value })
  },

  onSubmit() {
    const content = (this.data.content || '').trim()
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
