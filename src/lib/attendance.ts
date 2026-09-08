export type AttendanceCardKind = 'seat' | 'reason' | 'period' | 'tool'
export type PeriodLevel = 'elementary' | 'above'

export interface AttendanceCard {
  id: string
  kind: AttendanceCardKind
  label: string
}

export const REASON_LABELS = ['病假', '事假', '公假', '喪假', '生理', '心理', '遲到', '早退', '曠課'] as const

export const PERIOD_LABELS = [
  '早修',
  '第1節',
  '第2節',
  '第3節',
  '第4節',
  '午休',
  '第5節',
  '第6節',
  '第7節',
  '第8節',
  '到',
  '上半',
  '下半',
  '全天',
] as const

export function seatCards(count = 30): AttendanceCard[] {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return {
      id: `seat-${n}`,
      kind: 'seat',
      label: String(n).padStart(2, '0'),
    }
  })
}

export function reasonCards(): AttendanceCard[] {
  return REASON_LABELS.map((label) => ({
    id: `reason-${label}`,
    kind: 'reason',
    label,
  }))
}

export function toolCards(): AttendanceCard[] {
  return [
    { id: 'tool-multi', kind: 'tool', label: '多選' },
    { id: 'tool-range', kind: 'tool', label: '範圍' },
  ]
}

export function periodCards(level: PeriodLevel = 'above'): AttendanceCard[] {
  const labels = level === 'elementary' ? PERIOD_LABELS.filter((l) => l !== '第8節') : PERIOD_LABELS
  return labels.map((label) => ({
    id: `period-${label}`,
    kind: 'period',
    label,
  }))
}

export function periodIndex(label: string): number | null {
  const m = /^第(\d+)節$/.exec(label)
  return m ? Number(m[1]) : null
}

export function speakReason(label: string) {
  return label.endsWith('假') ? `請${label}` : label
}

function speakNumRuns(nums: number[]) {
  if (nums.length === 0) return ''
  const runs: [number, number][] = []
  let start = nums[0]
  let prev = nums[0]
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] === prev + 1) {
      prev = nums[i]
      continue
    }
    runs.push([start, prev])
    start = prev = nums[i]
  }
  runs.push([start, prev])
  if (runs.length === 1 && runs[0][0] !== runs[0][1]) return `${runs[0][0]}-${runs[0][1]}節`
  const inner = runs.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join('、')
  return `第${inner}節`
}

export function expandPeriods(labels: string[], level: PeriodLevel = 'above') {
  const nums = new Set<number>()
  const extras: string[] = []
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i]
    if (!label || label === '到') continue
    if (label === '全天') {
      for (let n = 1; n <= 7; n++) nums.add(n)
      continue
    }
    if (label === '上半') {
      for (let n = 1; n <= 4; n++) nums.add(n)
      continue
    }
    if (label === '下半') {
      const last = level === 'elementary' ? 7 : 8
      for (let n = 5; n <= last; n++) nums.add(n)
      continue
    }
    const n = periodIndex(label)
    if (n != null) {
      const end = labels[i + 1] === '到' ? periodIndex(labels[i + 2] ?? '') : null
      if (end != null) {
        const lo = Math.min(n, end)
        const hi = Math.max(n, end)
        for (let x = lo; x <= hi; x++) nums.add(x)
        i += 2
        continue
      }
      nums.add(n)
      continue
    }
    extras.push(label)
  }
  return { nums: [...nums].sort((a, b) => a - b), extras }
}

export function periodCount(labels: string[], level: PeriodLevel = 'above') {
  const { nums, extras } = expandPeriods(labels, level)
  return nums.length + extras.length
}

export function speakPeriods(labels: string[], level: PeriodLevel = 'above') {
  const { nums, extras } = expandPeriods(labels, level)
  const parts = [
    ...extras.filter((l) => l === '早修'),
    ...(nums.length > 0 ? [speakNumRuns(nums)] : []),
    ...extras.filter((l) => l !== '早修'),
  ]
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.join('至')
}

export function seatsBetween(a: AttendanceCard, b: AttendanceCard, all: AttendanceCard[]): AttendanceCard[] {
  const na = Number(a.label)
  const nb = Number(b.label)
  const lo = Math.min(na, nb)
  const hi = Math.max(na, nb)
  return all.filter((c) => {
    const n = Number(c.label)
    return n >= lo && n <= hi
  })
}

export function speakSeats(labels: string[]) {
  const nums = [...new Set(labels.map((label) => Number(label)))].sort((a, b) => a - b)
  return nums.join('、')
}

export function speakChain(blocks: AttendanceCard[], level: PeriodLevel = 'above') {
  const seats = blocks.filter((b) => b.kind === 'seat')
  const reason = blocks.find((b) => b.kind === 'reason')
  const periods = blocks.filter((b) => b.kind === 'period')
  if (seats.length === 0 || !reason || periods.every((p) => p.label === '到')) return null
  const period = speakPeriods(
    periods.map((p) => p.label),
    level,
  )
  if (!period) return null
  return `${reason.label} ${period}：${speakSeats(seats.map((s) => s.label))}`
}

type DatedLeave = {
  dateMode: 'fixed' | 'today' | 'standing'
  date: string
  weekday: number
  blocks: AttendanceCard[]
}

function leaveSlots(periods: string[], level: PeriodLevel) {
  const { nums, extras } = expandPeriods(periods, level)
  return { nums, extras }
}

function datesClash(a: DatedLeave, b: DatedLeave) {
  if (a.dateMode === 'standing' && b.dateMode === 'standing') return a.weekday === b.weekday
  if (a.dateMode === 'standing') return b.weekday === a.weekday
  if (b.dateMode === 'standing') return a.weekday === b.weekday
  return a.date === b.date
}

export function findSeatPeriodConflicts(packs: DatedLeave[], level: PeriodLevel = 'above') {
  const hits: { seats: number[]; reasons: string[]; period: string }[] = []
  for (let i = 0; i < packs.length; i++) {
    for (let j = i + 1; j < packs.length; j++) {
      const a = packs[i]
      const b = packs[j]
      const reasonA = a.blocks.find((x) => x.kind === 'reason')?.label ?? ''
      const reasonB = b.blocks.find((x) => x.kind === 'reason')?.label ?? ''
      if (!reasonA || !reasonB || reasonA === reasonB) continue
      if (!datesClash(a, b)) continue
      const slotA = leaveSlots(
        a.blocks.filter((x) => x.kind === 'period').map((x) => x.label),
        level,
      )
      const slotB = leaveSlots(
        b.blocks.filter((x) => x.kind === 'period').map((x) => x.label),
        level,
      )
      const nums = slotA.nums.filter((n) => slotB.nums.includes(n))
      const extras = slotA.extras.filter((e) => slotB.extras.includes(e))
      if (nums.length === 0 && extras.length === 0) continue
      const seatsA = a.blocks.filter((x) => x.kind === 'seat').map((x) => Number(x.label))
      const seatsB = b.blocks.filter((x) => x.kind === 'seat').map((x) => Number(x.label))
      const seats = [...new Set(seatsA.filter((n) => seatsB.includes(n)))].sort((x, y) => x - y)
      if (seats.length === 0) continue
      const period = speakPeriods(
        [...extras, ...nums.map((n) => `第${n}節`)],
        level,
      )
      hits.push({ seats, reasons: [reasonA, reasonB], period })
    }
  }
  return hits
}
