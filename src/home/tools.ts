export type ToolId = 'plates' | 'badges' | 'seats' | 'attendance' | 'snap-sheet' | 'sweep'

export interface ToolTileData {
  id: string
  title: string
  hint: string
  enabled: boolean
  toolId?: ToolId
}

/** 九宮格：已開放的工具排在左上 */
export const HOME_TOOLS: ToolTileData[] = [
  {
    id: 'plates',
    title: '桌牌製作神器',
    hint: '三角桌牌，上傳名冊後編輯列印',
    enabled: true,
    toolId: 'plates',
  },
  {
    id: 'seats',
    title: '排座位大師',
    hint: '匯入名冊，設定教室後拖曳排座',
    enabled: true,
    toolId: 'seats',
  },
  {
    id: 'badges',
    title: '名牌神器',
    hint: '功能未完善',
    enabled: false,
  },
  {
    id: 'sweep',
    title: '排掃地大師',
    hint: '匯入名冊，拖曳分配內掃與外掃',
    enabled: true,
    toolId: 'sweep',
  },
  {
    id: 'snap-sheet',
    title: '拍拍成表',
    hint: '拍照辨識成表，可改錯並匯出 Excel',
    enabled: true,
    toolId: 'snap-sheet',
  },
  { id: 'cyber-book', title: '賽博聯絡簿', hint: '即將推出', enabled: false },
  {
    id: 'attendance',
    title: '出缺席快拉',
    hint: '座號、假由、節次卡片快速紀錄',
    enabled: true,
    toolId: 'attendance',
  },
  { id: 'soon-8', title: '即將推出', hint: '更多工具籌備中', enabled: false },
  { id: 'soon-9', title: '即將推出', hint: '更多工具籌備中', enabled: false },
]
