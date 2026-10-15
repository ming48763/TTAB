export interface RoomSpec {
  id: string
  capacity: number
  count: number
}

export interface RoomSlot {
  id: string
  personId: string | null
}

export interface RoomUnit {
  id: string
  title: string
  capacity: number
  slots: RoomSlot[]
}

const DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

export function zhCount(value: number) {
  if (value < 10) return DIGIT[value] ?? String(value)
  if (value === 10) return '十'
  if (value < 20) return `十${DIGIT[value - 10]}`
  if (value < 100) {
    const tens = Math.floor(value / 10)
    const ones = value % 10
    return `${DIGIT[tens]}十${ones ? DIGIT[ones] : ''}`
  }
  return String(value)
}

export function roomTypeName(capacity: number) {
  return `${zhCount(capacity)}人房`
}

/** Up to six people use two columns; seven or more use four. */
export function roomSlotColumns(capacity: number) {
  return capacity > 6 ? 4 : 2
}

export function buildRooms(specs: RoomSpec[], nextId: (prefix: string) => string): RoomUnit[] {
  const serial = new Map<string, number>()
  const rooms: RoomUnit[] = []
  for (const spec of specs) {
    if (spec.capacity < 1 || spec.count < 1) continue
    const type = roomTypeName(spec.capacity)
    for (let i = 0; i < spec.count; i++) {
      const n = (serial.get(type) ?? 0) + 1
      serial.set(type, n)
      rooms.push({
        id: nextId('room'),
        title: `${type}-${n}`,
        capacity: spec.capacity,
        slots: Array.from({ length: spec.capacity }, () => ({ id: nextId('slot'), personId: null })),
      })
    }
  }
  return rooms
}
