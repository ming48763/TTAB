export type ToolId = 'plates' | 'badges' | 'seats' | 'attendance' | 'snap-sheet' | 'sweep' | 'bus' | 'rooms'

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
    hint: '印出來直接折，做桌牌就是這麼簡單！',
    enabled: true,
    toolId: 'plates',
  },
  {
    id: 'seats',
    title: '排座位大師',
    hint: '點一點，拉一拉，排座位也能很直觀。',
    enabled: true,
    toolId: 'seats',
  },
  {
    id: 'badges',
    title: '名牌製作神器',
    hint: '印出來直接剪，做名牌就是這麼簡單！',
    enabled: true,
    toolId: 'badges',
  },
  {
    id: 'sweep',
    title: '排掃地大師',
    hint: '點一點，拉一拉，排掃地也能很直觀。',
    enabled: true,
    toolId: 'sweep',
  },
  {
    id: 'snap-sheet',
    title: '拍拍成表',
    hint: '親愛的，我把照片變成電子檔了。',
    enabled: false,
    toolId: 'snap-sheet',
  },
  { id: 'cyber-book', title: '賽博聯絡簿', hint: '即將推出', enabled: false },
  {
    id: 'attendance',
    title: '出缺席快拉',
    hint: '拉積木，快速彙整點名表。',
    enabled: true,
    toolId: 'attendance',
  },
  {
    id: 'bus',
    title: '遊覽車大師',
    hint: '點一點，拉一拉，排車位也能很直觀。',
    enabled: true,
    toolId: 'bus',
  },
  {
    id: 'rooms',
    title: '排房間大師',
    hint: '點一點，拉一拉，排房間也能很直觀。',
    enabled: true,
    toolId: 'rooms',
  },
  { id: 'soon-9', title: '即將推出', hint: '更多工具籌備中', enabled: false },
]
