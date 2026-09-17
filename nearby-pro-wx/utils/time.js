// 聊天时间显示工具

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

// 聊天时间格式化：今天 HH:mm；昨天「昨天 HH:mm」；一周内「周X HH:mm」；更早「M月D日 HH:mm」
function formatChatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
  if (d.toDateString() === now.toDateString()) return hm
  const yesterday = new Date(now.getTime() - 86400000)
  if (d.toDateString() === yesterday.toDateString()) return '昨天 ' + hm
  if (now.getTime() - ts < 6 * 86400000) {
    return '周' + '日一二三四五六'[d.getDay()] + ' ' + hm
  }
  return d.getMonth() + 1 + '月' + d.getDate() + '日 ' + hm
}

module.exports = { formatChatTime }
