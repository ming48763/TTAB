const DEFAULT_LINE = '給自己多一點休息的時間吧！'
const DEFAULT_WEIGHT = 0.8

const OTHER_LINES = [
  '好用工具天天用',
  '離職不殉職',
  '您辛苦了！希望能為您省下一點時間！',
  '先照顧好自己，才能照亮教室。',
  '拒絕「白天當保母，晚上當客服，假日當義工。」',
  '如果可以，誰想要防禦性教學？',
]

export function pickHomeLine() {
  if (Math.random() < DEFAULT_WEIGHT) return DEFAULT_LINE
  return OTHER_LINES[Math.floor(Math.random() * OTHER_LINES.length)]
}
