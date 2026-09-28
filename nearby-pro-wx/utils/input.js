// 输入长度限制工具
//
// 不要用原生 maxlength：微信把它交给原生输入框，输入法尚未上屏的拼音字母也被算进长度，
// 拼音一旦顶到上限就再也打不出字（技能名称限 8 字时，拼音打到第 9 个字母就卡死）。
// 改为 wxml 里写 maxlength="-1"，在 bindinput 里用这里的 limitInput 手动截断。

// 末尾连续的字母视为输入法正在拼、还没上屏的候选：中文上屏后 value 里是汉字，不会命中。
// 这段不计入长度、也不参与截断，否则会把候选词打断。
function pendingTail(raw) {
  return (raw.match(/[a-zA-Z]+$/) || [''])[0]
}

// 按已上屏字数截断；未超长时原样返回，避免 setData 打断输入法
function limitInput(value, max) {
  const raw = value || ''
  const pending = pendingTail(raw)
  const committed = raw.slice(0, raw.length - pending.length)
  if (committed.length <= max) {
    return raw
  }
  return committed.slice(0, max) + pending
}

// 已上屏字数，口径与 limitInput 一致，供计数器展示（打字过程中数字不会乱跳）
function countInput(value) {
  const raw = value || ''
  return raw.length - pendingTail(raw).length
}

module.exports = { limitInput, countInput }
