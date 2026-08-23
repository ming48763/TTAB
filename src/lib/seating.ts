import type { ColumnMapping, StudentRow } from '../types'
import { uid } from '../types'

export type SeatInkStyle = 'color' | 'bw' | 'navy' | 'forest' | 'mint' | 'rose' | 'sun'

export const SEAT_INK_STYLES: { id: SeatInkStyle; label: string; swatch: string }[] = [
  { id: 'color', label: '預設', swatch: '#1a3a32' },
  { id: 'bw', label: '黑白', swatch: '#111111' },
  { id: 'navy', label: '海軍', swatch: '#1e3a5f' },
  { id: 'forest', label: '森林', swatch: '#5c6b3d' },
  { id: 'mint', label: '薄荷', swatch: '#6d8f86' },
  { id: 'rose', label: '玫瑰', swatch: '#9b4d5e' },
  { id: 'sun', label: '暖陽', swatch: '#d0893c' },
]

export type RoomShape = 'square' | 'portrait' | 'landscape'

export type WallSide = 'front' | 'back' | 'left' | 'right'

export interface ClassroomDoor {
  id: string
  wall: WallSide
  /** first of three consecutive perimeter cells at pick time */
  start: number
  /** distance from wall start (left / blackboard) as a 0–1 ratio */
  startRatio: number
  /** door length along the wall as a 0–1 ratio */
  spanRatio: number
  name: string
}

export interface SeatSpot {
  id: string
  row: number
  col: number
  slot: number
}

export const SEAT_MODES: { id: SeatGroupMode; label: string; hint: string; size: number }[] = [
  { id: 'chess', label: '棋盤', hint: '每個單位 1 人', size: 1 },
  { id: 'pair', label: '鄰居', hint: '每個單位 2 人', size: 2 },
  { id: 'team3', label: '三人小隊', hint: '每個單位 3 人', size: 3 },
  { id: 'team4', label: '四人小隊', hint: '每個單位 4 人', size: 4 },
  { id: 'team5', label: '五人小隊', hint: '每個單位 5 人', size: 5 },
]

export const ROOM_SHAPES: { id: RoomShape; label: string; hint: string }[] = [
  { id: 'square', label: '正方形', hint: '長寬相同' },
  { id: 'portrait', label: '直長方形', hint: 'A4 直式\n210 × 297' },
  { id: 'landscape', label: '橫長方形', hint: 'A4 橫式\n297 × 210' },
]

export const WALL_LABELS: Record<WallSide, string> = {
  front: '前方（黑板）',
  back: '後方',
  left: '左側',
  right: '右側',
}

export function groupSize(mode: SeatGroupMode) {
  return SEAT_MODES.find((m) => m.id === mode)?.size ?? 1
}

/** 單位內座位網格：每個座位是正方形，單位外形隨排布改變 */
export function unitSeatGrid(mode: SeatGroupMode): { cols: number; rows: number } {
  if (mode === 'chess') return { cols: 1, rows: 1 }
  if (mode === 'pair') return { cols: 2, rows: 1 }
  if (mode === 'team5') return { cols: 2, rows: 3 }
  return { cols: 2, rows: 2 }
}

export const UNIT_PAD_PX = 6
export const UNIT_GAP_PX = 6

export function buildSeats(rows: number, cols: number, mode: SeatGroupMode): SeatSpot[] {
  const size = groupSize(mode)
  const seats: SeatSpot[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (let s = 0; s < size; s++) {
        seats.push({ id: `u-${r}-${c}-${s}`, row: r, col: c, slot: s })
      }
    }
  }
  return seats
}

export function seatCapacity(rows: number, cols: number, mode: SeatGroupMode) {
  return rows * cols * groupSize(mode)
}

export function formatDisplayName(raw: string) {
  const chars = [...raw.replace(/\s+/g, '')]
  if (chars.length === 2) return `${chars[0]}\u3000${chars[1]}`
  return chars.length ? chars.join('') : raw.trim()
}

export function nameScale(raw: string) {
  const n = [...raw.replace(/\s+/g, '')].length
  if (n <= 3) return 1
  return 3 / n
}

function isNameField(mapping: ColumnMapping) {
  return mapping.role === 'name' || /姓名|名字/.test(`${mapping.header}${mapping.label}`)
}

export function studentLabel(row: StudentRow, mappings: ColumnMapping[]) {
  const nameMap = mappings.find((m) => m.role === 'name' && m.enabled !== false)
  if (nameMap) {
    const v = row.values[nameMap.header]?.trim()
    if (v) return formatDisplayName(v)
  }
  const first = mappings.find((m) => m.enabled && m.role !== 'ignore')
  if (first) {
    const v = row.values[first.header]?.trim()
    if (v) return isNameField(first) ? formatDisplayName(v) : v
  }
  const any = Object.values(row.values).find((v) => v.trim())
  return any?.trim() || `學生 ${row.rowIndex + 1}`
}

export function studentCardLines(
  row: StudentRow,
  mappings: ColumnMapping[],
  shownHeaders: string[],
) {
  const order = mappings.filter((m) => shownHeaders.includes(m.header))
  const lines = order
    .map((m) => {
      const raw = row.values[m.header]?.trim() ?? ''
      if (!raw) return null
      const name = isNameField(m)
      return {
        text: name ? formatDisplayName(raw) : raw,
        isName: name,
        scale: name ? nameScale(raw) : 1,
      }
    })
    .filter((line): line is { text: string; isName: boolean; scale: number } => line !== null)
  if (lines.length) return lines
  const fallback = studentLabel(row, mappings)
  return [{ text: fallback, isName: true, scale: nameScale(fallback) }]
}

export function studentCardText(
  row: StudentRow,
  mappings: ColumnMapping[],
  shownHeaders: string[],
) {
  return studentCardLines(row, mappings, shownHeaders)
    .map((line) => line.text)
    .join('\n')
}

export function studentKey(row: StudentRow) {
  return String(row.rowIndex)
}

export function nextDoorName(doors: ClassroomDoor[]) {
  return `門${doors.length + 1}`
}

export type WallRing = { cols: number; rows: number }

export function wallCellCount(wall: WallSide, rows: number, cols: number, ring?: WallRing) {
  if (ring) {
    if (wall === 'front' || wall === 'back') return ring.cols
    return Math.max(3, ring.rows - 2)
  }
  if (wall === 'front' || wall === 'back') return Math.max(3, rows)
  return Math.max(3, cols)
}

export function wallFullCount(wall: WallSide, ring: WallRing) {
  return wall === 'front' || wall === 'back' ? ring.cols : ring.rows
}

/** 方格起點到牆角的距離 ÷ 牆長 */
export function doorRatiosFromCells(wall: WallSide, start: number, ring: WallRing) {
  const n = Math.max(1, wallFullCount(wall, ring))
  const fromCorner = wall === 'front' || wall === 'back' ? start : start + 1
  return {
    startRatio: fromCorner / n,
    spanRatio: 3 / n,
  }
}

export function doorAlongWall(door: ClassroomDoor, ring?: WallRing) {
  if (Number.isFinite(door.startRatio) && Number.isFinite(door.spanRatio)) {
    return { start: door.startRatio, span: door.spanRatio }
  }
  if (!ring) return { start: 0, span: 0.15 }
  const ratios = doorRatiosFromCells(door.wall, door.start, ring)
  return { start: ratios.startRatio, span: ratios.spanRatio }
}

export function doorToRingCells(door: ClassroomDoor, ring: WallRing) {
  const n = Math.max(1, wallFullCount(door.wall, ring))
  const { start, span } = doorAlongWall(door, ring)
  const origin = Math.round(start * n)
  const length = Math.max(3, Math.round(span * n))
  const clamped = Math.min(origin, Math.max(0, n - length))
  if (door.wall === 'front' || door.wall === 'back') {
    return { start: clamped, span: length, origin: clamped }
  }
  return { start: Math.max(0, clamped - 1), span: length, origin: clamped }
}

export function doorCovers(door: ClassroomDoor, index: number) {
  return index >= door.start && index < door.start + 3
}

export function makeDoor(
  wall: WallSide,
  start: number,
  doors: ClassroomDoor[],
  ring: WallRing,
): ClassroomDoor {
  const ratios = doorRatiosFromCells(wall, start, ring)
  return {
    id: uid('door'),
    wall,
    start,
    startRatio: ratios.startRatio,
    spanRatio: ratios.spanRatio,
    name: nextDoorName(doors),
  }
}

export function pruneDoors(doors: ClassroomDoor[], rows: number, cols: number) {
  return doors.filter((d) => d.start >= 0 && d.start + 3 <= wallCellCount(d.wall, rows, cols))
}

export function clampGrid(n: number) {
  return Math.min(12, Math.max(1, Math.round(n) || 1))
}

export const MAX_GRID = 12

export function commitGridInput(raw: string) {
  if (raw.trim() === '') return 1
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  return clampGrid(n)
}
