import type { LayoutItem } from '../types'

export interface BoothLayoutPreset {
  id: string
  label: string
  hint: string
}

export interface BoothSlot {
  x: number
  y: number
  align: LayoutItem['align']
  fontSizeMm: number
}

export function defaultBoothLayoutId(count: number): string {
  const n = Math.min(4, Math.max(0, count))
  if (n <= 1) return 'one-center'
  if (n === 2) return 'two-equal-tight'
  if (n === 3) return 'three-stack-equal'
  return 'four-eq'
}

export function boothLayoutPresets(count: number): BoothLayoutPreset[] {
  count = Math.min(4, Math.max(0, count))
  if (count <= 1) {
    return [
      { id: 'one-center', label: '正中', hint: '單一物件置中' },
      { id: 'one-large', label: '放大', hint: '較大字級' },
      { id: 'one-small', label: '縮小', hint: '較小字級' },
    ]
  }
  if (count === 2) {
    return [
      { id: 'two-equal-tight', label: '等大緊密', hint: '橫排、間距較近' },
      { id: 'two-equal-wide', label: '等大留白', hint: '橫排、間距較開' },
      { id: 'two-left-big', label: '左大右小', hint: '橫排、左邊較大' },
      { id: 'two-right-big', label: '左小右大', hint: '橫排、右邊較大' },
      { id: 'corner-tl', label: '小標左上', hint: '小物件左上角，主物件垂直置中放大' },
      { id: 'corner-tr', label: '小標右上', hint: '小物件右上角，主物件垂直置中放大' },
      { id: 'corner-bl', label: '小標左下', hint: '小物件左下角，主物件垂直置中放大' },
      { id: 'corner-br', label: '小標右下', hint: '小物件右下角，主物件垂直置中放大' },
    ]
  }
  if (count === 3) {
    return [
      { id: 'three-stack-equal', label: '直排等大', hint: '三列、相同大小' },
      { id: 'three-stack-wide', label: '直排留白', hint: '三列、間距較開' },
      { id: 'three-top-big', label: '上大下小', hint: '直排、第一個較大' },
      { id: 'three-mid-big', label: '中大上下小', hint: '直排、中間較大、上下較小' },
      { id: 'three-h-tl', label: '橫排＋左上', hint: '兩物件橫排，第三個在左上角' },
      { id: 'three-h-tr', label: '橫排＋右上', hint: '兩物件橫排，第三個在右上角' },
      { id: 'three-h-bl', label: '橫排＋左下', hint: '兩物件橫排，第三個在左下角' },
      { id: 'three-h-br', label: '橫排＋右下', hint: '兩物件橫排，第三個在右下角' },
      { id: 'three-h-top', label: '橫排＋上方', hint: '兩物件橫排，第三個在上方' },
      { id: 'three-h-bottom', label: '橫排＋下方', hint: '兩物件橫排，第三個在下方' },
    ]
  }
  if (count === 4) {
    return FOUR_BASES.map((base) => ({
      id: `four-${base.id}`,
      label: base.label,
      hint: `${base.hint}，第四個放角落`,
    }))
  }
  return [
    { id: 'grid-equal', label: '雙欄等大', hint: '兩兩橫排、相同大小' },
    { id: 'grid-tight', label: '雙欄緊密', hint: '兩兩橫排、間距較近' },
    { id: 'grid-wide', label: '雙欄留白', hint: '兩兩橫排、間距較開' },
    { id: 'grid-top-big', label: '上排較大', hint: '第一列較大、其餘較小' },
  ]
}

const CORNER_OPTS = [
  { id: 'tl', label: '左上', x: 12, y: 14, align: 'left' as const },
  { id: 'tr', label: '右上', x: 88, y: 14, align: 'right' as const },
  { id: 'bl', label: '左下', x: 12, y: 86, align: 'left' as const },
  { id: 'br', label: '右下', x: 88, y: 86, align: 'right' as const },
] as const

const FOUR_BASES = [
  { id: 'eq', label: '直排等大', hint: '三列等大' },
  { id: 'wide', label: '直排留白', hint: '三列留白' },
  { id: 'topbig', label: '上大下小', hint: '上大下小' },
  { id: 'midbig', label: '中大上下小', hint: '中大上下小' },
  { id: 'htop', label: '橫排＋上方', hint: '橫排加上方' },
  { id: 'hbot', label: '橫排＋下方', hint: '橫排加下方' },
] as const

function extraCorner(id: (typeof CORNER_OPTS)[number]['id']): BoothSlot {
  const c = CORNER_OPTS.find((o) => o.id === id)!
  return { x: c.x, y: c.y, align: c.align, fontSizeMm: 11 }
}

function threeBaseSlots(base: (typeof FOUR_BASES)[number]['id']): BoothSlot[] {
  if (base === 'eq') {
    return [0, 1, 2].map((i) => ({
      x: 50,
      y: along(i, 3, 32, 70),
      align: 'center' as const,
      fontSizeMm: 18,
    }))
  }
  if (base === 'wide') {
    return [0, 1, 2].map((i) => ({
      x: 50,
      y: along(i, 3, 28, 76),
      align: 'center' as const,
      fontSizeMm: 18,
    }))
  }
  if (base === 'topbig') {
    return [
      { x: 50, y: 34, align: 'center', fontSizeMm: 28 },
      { x: 50, y: 58, align: 'center', fontSizeMm: 14 },
      { x: 50, y: 74, align: 'center', fontSizeMm: 14 },
    ]
  }
  if (base === 'midbig') {
    return [
      { x: 50, y: 26, align: 'center', fontSizeMm: 13 },
      { x: 50, y: 50, align: 'center', fontSizeMm: 28 },
      { x: 50, y: 74, align: 'center', fontSizeMm: 13 },
    ]
  }
  if (base === 'htop') return threeHExtra(60, { x: 50, y: 24, align: 'center', fontSizeMm: 14 })
  return threeHExtra(40, { x: 50, y: 76, align: 'center', fontSizeMm: 14 })
}

function along(index: number, total: number, start: number, end: number) {
  if (total <= 1) return Math.round(((start + end) / 2) * 10) / 10
  return Math.round((start + ((end - start) * index) / (total - 1)) * 10) / 10
}

export function boothSlots(presetId: string, count: number): BoothSlot[] {
  const four = /^four-(eq|wide|topbig|midbig|htop|hbot)-(tl|tr|bl|br)$/.exec(presetId)
  if (four) {
    return [
      ...threeBaseSlots(four[1] as (typeof FOUR_BASES)[number]['id']),
      extraCorner(four[2] as (typeof CORNER_OPTS)[number]['id']),
    ]
  }
  const n = Math.max(1, count)
  switch (presetId) {
    case 'one-large':
      return [{ x: 50, y: 50, align: 'center', fontSizeMm: 36 }]
    case 'one-small':
      return [{ x: 50, y: 50, align: 'center', fontSizeMm: 18 }]
    case 'one-center':
      return [{ x: 50, y: 50, align: 'center', fontSizeMm: 28 }]
    case 'two-equal-wide':
      return [
        { x: 28, y: 50, align: 'center', fontSizeMm: 26 },
        { x: 72, y: 50, align: 'center', fontSizeMm: 26 },
      ]
    case 'two-left-big':
      return [
        { x: 32, y: 50, align: 'center', fontSizeMm: 32 },
        { x: 72, y: 50, align: 'center', fontSizeMm: 16 },
      ]
    case 'two-right-big':
      return [
        { x: 28, y: 50, align: 'center', fontSizeMm: 16 },
        { x: 68, y: 50, align: 'center', fontSizeMm: 32 },
      ]
    case 'two-equal-tight':
      return [
        { x: 35, y: 50, align: 'center', fontSizeMm: 26 },
        { x: 65, y: 50, align: 'center', fontSizeMm: 26 },
      ]
    case 'corner-tl':
      return cornerPair(12, 14, 'left')
    case 'corner-tr':
      return cornerPair(88, 14, 'right')
    case 'corner-bl':
      return cornerPair(12, 86, 'left')
    case 'corner-br':
      return cornerPair(88, 86, 'right')
    case 'three-h-tl':
      return threeHExtra(50, { x: 12, y: 14, align: 'left', fontSizeMm: 11 })
    case 'three-h-tr':
      return threeHExtra(50, { x: 88, y: 14, align: 'right', fontSizeMm: 11 })
    case 'three-h-bl':
      return threeHExtra(50, { x: 12, y: 86, align: 'left', fontSizeMm: 11 })
    case 'three-h-br':
      return threeHExtra(50, { x: 88, y: 86, align: 'right', fontSizeMm: 11 })
    case 'three-h-top':
      return threeHExtra(60, { x: 50, y: 24, align: 'center', fontSizeMm: 14 })
    case 'three-h-bottom':
      return threeHExtra(40, { x: 50, y: 76, align: 'center', fontSizeMm: 14 })
    case 'three-stack-wide':
      return [0, 1, 2].map((i) => ({
        x: 50,
        y: along(i, 3, 28, 76),
        align: 'center' as const,
        fontSizeMm: 18,
      }))
    case 'three-top-big':
      return [
        { x: 50, y: 34, align: 'center', fontSizeMm: 28 },
        { x: 50, y: 58, align: 'center', fontSizeMm: 14 },
        { x: 50, y: 74, align: 'center', fontSizeMm: 14 },
      ]
    case 'three-mid-big':
      return [
        { x: 50, y: 26, align: 'center', fontSizeMm: 13 },
        { x: 50, y: 50, align: 'center', fontSizeMm: 28 },
        { x: 50, y: 74, align: 'center', fontSizeMm: 13 },
      ]
    case 'three-stack-equal':
      return [0, 1, 2].map((i) => ({
        x: 50,
        y: along(i, 3, 32, 70),
        align: 'center' as const,
        fontSizeMm: 18,
      }))
    case 'grid-tight':
      return gridSlots(n, 30, 70, 36, 64, 20)
    case 'grid-wide':
      return gridSlots(n, 28, 74, 24, 76, 20)
    case 'grid-top-big':
      return gridSlots(n, 32, 70, 28, 72, 14).map((s, i) =>
        i < 2 ? { ...s, fontSizeMm: 26 } : s,
      )
    case 'grid-equal':
    default:
      if (n <= 1) return [{ x: 50, y: 50, align: 'center', fontSizeMm: 28 }]
      if (n === 2) {
        return [
          { x: 35, y: 50, align: 'center', fontSizeMm: 26 },
          { x: 65, y: 50, align: 'center', fontSizeMm: 26 },
        ]
      }
      if (n === 3) {
        return [0, 1, 2].map((i) => ({
          x: 50,
          y: along(i, 3, 32, 70),
          align: 'center' as const,
          fontSizeMm: 18,
        }))
      }
      return gridSlots(n, 32, 70, 28, 72, 20)
  }
}

function cornerPair(x: number, y: number, align: LayoutItem['align']): BoothSlot[] {
  return [
    { x, y, align, fontSizeMm: 11 },
    { x: 50, y: 50, align: 'center', fontSizeMm: 30 },
  ]
}

function twoHPair(y: number): BoothSlot[] {
  return [
    { x: 35, y, align: 'center', fontSizeMm: 24 },
    { x: 65, y, align: 'center', fontSizeMm: 24 },
  ]
}

function threeHExtra(pairY: number, extra: BoothSlot): BoothSlot[] {
  return [...twoHPair(pairY), extra]
}

export function boothLayoutPinsCorners(id: string) {
  return id.startsWith('corner-')
}

export const BOOTH_CORNER_CHOICES = [
  { id: 'tl' as const, label: '左上' },
  { id: 'bl' as const, label: '左下' },
  { id: 'tr' as const, label: '右上' },
  { id: 'br' as const, label: '右下' },
]

export function boothSlotCount(layoutId: string): number {
  const id = layoutId.replace(/-(tl|tr|bl|br)$/, '')
  if (id.startsWith('four-') || id.startsWith('grid-')) return 4
  if (id.startsWith('three-')) return 3
  if (id.startsWith('two-') || id.startsWith('corner-')) return 2
  if (id.startsWith('one-')) return 1
  return 4
}

export function boothSlotAt(layoutId: string, index: number): BoothSlot | undefined {
  return boothSlots(layoutId, boothSlotCount(layoutId))[index]
}

export function resolveBoothLayoutId(layoutId: string, corner: 'tl' | 'tr' | 'bl' | 'br') {
  if (layoutId.startsWith('four-') && !/-(tl|tr|bl|br)$/.test(layoutId)) {
    return `${layoutId}-${corner}`
  }
  return layoutId
}

export function boothLayoutHasCornerExtra(id: string) {
  return (
    /^three-h-(tl|tr|bl|br)$/.test(id) ||
    /^four-(eq|wide|topbig|midbig|htop|hbot)(-tl|-tr|-bl|-br)?$/.test(id)
  )
}

function gridSlots(
  count: number,
  y0: number,
  y1: number,
  x0: number,
  x1: number,
  fontSizeMm: number,
): BoothSlot[] {
  const cols = 2
  const rows = Math.max(1, Math.ceil(count / cols))
  return Array.from({ length: count }, (_, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    return {
      x: col === 0 ? x0 : x1,
      y: along(row, rows, y0, y1),
      align: 'center' as const,
      fontSizeMm,
    }
  })
}

const BPMF_ID = 'Bpmf Huninn'

function isBpmf(family?: string) {
  return Boolean(family && (family === BPMF_ID || family.includes('Bpmf')))
}

export function applyBoothLayout(
  source: LayoutItem[],
  presetId: string,
  orderIds: string[],
  globalAlign: LayoutItem['align'] = 'center',
  cardWidthMm = 210,
  sample: { values: Record<string, string> } | null = null,
  faceHeightMm = 99,
  sizeScale = 1,
): LayoutItem[] {
  if (!source.length) return source
  const byId = new Map(source.map((it) => [it.id, it]))
  const ordered: LayoutItem[] = []
  for (const id of orderIds) {
    const it = byId.get(id)
    if (it) ordered.push(it)
  }
  const slots = boothSlots(presetId, boothSlotCount(presetId))
  const placed = ordered.map((it, i) => {
    const slot = slots[i] ?? slots[slots.length - 1]
    const fontSizeMm = scaledSlotFont(
      it.kind === 'image' ? Math.min(slot.fontSizeMm, 18) : slot.fontSizeMm,
      sizeScale,
    )
    return {
      ...it,
      x: slot.x,
      y: slot.y,
      align: slot.align,
      fontSizeMm,
    }
  })
  const pinned = boothLayoutPinsCorners(presetId)
  if (pinned) return placed
  if (boothLayoutHasCornerExtra(presetId) && placed.length >= 2) {
    const extra = placed[placed.length - 1]
    const pair = placed.slice(0, -1)
    const packed = packRows(pair, 'center', cardWidthMm, sample, layoutRowGap(presetId, pair, cardWidthMm))
    const centered = alignBoothGroup(packed, 'center', cardWidthMm, sample, faceHeightMm)
    return [...centered, extra]
  }
  const packed = packRows(placed, globalAlign, cardWidthMm, sample, layoutRowGap(presetId, placed, cardWidthMm))
  return alignBoothGroup(packed, globalAlign, cardWidthMm, sample, faceHeightMm)
}

function scaledSlotFont(slotMm: number, sizeScale: number) {
  const scale = Number.isFinite(sizeScale) && sizeScale > 0 ? sizeScale : 1
  return Math.max(1, Math.round(slotMm * scale * 10) / 10)
}

/** Wide layouts keep the same packing, with a little extra space between neighbors. */
function layoutRowGap(presetId: string, items: LayoutItem[], cardWidthMm: number) {
  const bpmf = items.some((it) => it.kind !== 'image' && isBpmf(it.fontFamily))
  const tight = bpmf ? 4 : 2.2
  if (!presetId.includes('wide')) return tight
  const font = Math.max(...items.map((it) => it.fontSizeMm), 1)
  const extra = (0.42 * font / Math.max(cardWidthMm, 1)) * 100
  return Math.round((tight + extra) * 10) / 10
}

function textWidthPct(text: string, fontMm: number, cardWidthMm: number, family?: string) {
  const bpmf = isBpmf(family)
  let em = 0
  for (const ch of [...text]) {
    if (ch === ' ') em += bpmf ? 0.5 : 0.3
    else if (/[0-9]/.test(ch)) em += bpmf ? 1.08 : 0.62
    else if (/[A-Za-z]/.test(ch)) em += bpmf ? 1.08 : 0.62
    else em += bpmf ? 1.78 : 1
  }
  return (Math.max(em, 0.5) * fontMm / Math.max(cardWidthMm, 1)) * 100
}

function itemSpanX(
  item: LayoutItem,
  cardWidthMm: number,
  sample: { values: Record<string, string> } | null,
): { minX: number; maxX: number } {
  const w =
    item.kind === 'image'
      ? Math.max(8, (item.fontSizeMm / Math.max(cardWidthMm, 1)) * 100)
      : textWidthPct(itemBoothLabel(item, sample), item.fontSizeMm, cardWidthMm, item.fontFamily)
  if (item.align === 'left') return { minX: item.x, maxX: item.x + w }
  if (item.align === 'right') return { minX: item.x - w, maxX: item.x }
  return { minX: item.x - w / 2, maxX: item.x + w / 2 }
}

function itemSpanY(item: LayoutItem, faceHeightMm: number): { minY: number; maxY: number } {
  const h = Math.max(4, (item.fontSizeMm / Math.max(faceHeightMm, 1)) * 100)
  return { minY: item.y - h / 2, maxY: item.y + h / 2 }
}

function packRows(
  items: LayoutItem[],
  globalAlign: LayoutItem['align'],
  cardWidthMm: number,
  sample: { values: Record<string, string> } | null,
  gap?: number,
): LayoutItem[] {
  if (items.length < 2) return items
  const next = items.map((it) => ({ ...it }))
  const byRow = new Map<number, number[]>()
  next.forEach((it, i) => {
    const key = Math.round(it.y / 8) * 8
    const list = byRow.get(key) ?? []
    list.push(i)
    byRow.set(key, list)
  })
  const bpmf = next.some((it) => it.kind !== 'image' && isBpmf(it.fontFamily))
  const rowGap = gap ?? (bpmf ? 4 : 2.2)
  const edge = 8
  for (const idxs of byRow.values()) {
    idxs.sort((a, b) => next[a].x - next[b].x)
    const widths = idxs.map((i) => {
      const s = itemSpanX(next[i], cardWidthMm, sample)
      return s.maxX - s.minX
    })
    let cursor = 0
    idxs.forEach((i, n) => {
      const w = widths[n]
      const align = next[i].align
      if (align === 'left') next[i] = { ...next[i], x: Math.round(cursor * 10) / 10 }
      else if (align === 'right') next[i] = { ...next[i], x: Math.round((cursor + w) * 10) / 10 }
      else next[i] = { ...next[i], x: Math.round((cursor + w / 2) * 10) / 10 }
      cursor += w + rowGap
    })
    const spans = idxs.map((i) => itemSpanX(next[i], cardWidthMm, sample))
    const minX = Math.min(...spans.map((s) => s.minX))
    const maxX = Math.max(...spans.map((s) => s.maxX))
    const cx = (minX + maxX) / 2
    let dx = 0
    if (globalAlign === 'left') dx = edge - minX
    else if (globalAlign === 'right') dx = 100 - edge - maxX
    else dx = 50 - cx
    if (Math.abs(dx) < 0.05) continue
    for (const i of idxs) {
      next[i] = { ...next[i], x: Math.round((next[i].x + dx) * 10) / 10 }
    }
  }
  return next
}

/** Shift the cluster as one piece using the visual width of the labels, not just anchors. */
export function alignBoothGroup(
  items: LayoutItem[],
  globalAlign: LayoutItem['align'],
  cardWidthMm = 210,
  sample: { values: Record<string, string> } | null = null,
  faceHeightMm = 99,
): LayoutItem[] {
  if (items.length === 0) return items
  const spans = items.map((it) => itemSpanX(it, cardWidthMm, sample))
  const minX = Math.min(...spans.map((s) => s.minX))
  const maxX = Math.max(...spans.map((s) => s.maxX))
  const cx = (minX + maxX) / 2
  const ys = items.map((it) => itemSpanY(it, faceHeightMm))
  const minY = Math.min(...ys.map((s) => s.minY))
  const maxY = Math.max(...ys.map((s) => s.maxY))
  const cy = (minY + maxY) / 2
  const edge = 8
  let dx = 0
  let dy = 0
  if (globalAlign === 'left') dx = edge - minX
  else if (globalAlign === 'right') dx = 100 - edge - maxX
  else {
    dx = 50 - cx
    dy = 50 - cy
  }
  if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return items
  return items.map((it) => ({
    ...it,
    x: Math.round((it.x + dx) * 10) / 10,
    y: Math.round((it.y + dy) * 10) / 10,
  }))
}

export type BadgeZoneId = 'top' | 'mid' | 'bot'

export interface BadgeZoneStyle {
  on: boolean
  align: LayoutItem['align']
  bold: boolean
  /** 100 is the zone's default text size */
  sizePct: number
}

export function isBadgeNameItem(item: LayoutItem): boolean {
  if (item.id.startsWith('field-name')) return true
  return /姓名|名字/.test(`${item.fieldHeader ?? ''} ${item.text}`)
}

/** Items before the name sit above it; later fields sit below. Images stay on top. */
export function defaultBadgeZoneOf(items: LayoutItem[]): Record<string, BadgeZoneId> {
  const nameIndex = items.findIndex((item) => isBadgeNameItem(item))
  const map: Record<string, BadgeZoneId> = {}
  items.forEach((item, index) => {
    if (item.kind === 'image') map[item.id] = 'top'
    else if (isBadgeNameItem(item)) map[item.id] = 'mid'
    else if (nameIndex >= 0 && index < nameIndex) map[item.id] = 'top'
    else map[item.id] = 'bot'
  })
  return map
}

export function applyBadgeZones(
  items: LayoutItem[],
  zoneOf: Record<string, BadgeZoneId>,
  zones: Record<BadgeZoneId, BadgeZoneStyle>,
  faceHeightMm: number,
  sizePct: number,
  fontScale: number,
  lift = 50,
  keepIds?: ReadonlySet<string>,
): LayoutItem[] {
  const scale = (sizePct / 100) * fontScale
  const small = Math.max(3.2, Math.round(7 * scale * 10) / 10)
  const name = Math.max(5, Math.round(18 * scale * 10) / 10)
  const zoneFor = (item: LayoutItem) => zoneOf[item.id] ?? null
  const ordered = (['top', 'mid', 'bot'] as const).flatMap((zone) =>
    zones[zone].on ? items.filter((item) => zoneFor(item) === zone && !keepIds?.has(item.id)) : [],
  )
  const roomTop = faceHeightMm * 0.2
  const roomBottom = faceHeightMm * 0.8
  const room = Math.max(6, roomBottom - roomTop)
  let heights = ordered.map((item) => {
    const zone = zoneFor(item)
    const zoneScale = zone ? (zones[zone].sizePct ?? 100) / 100 : 1
    const base = zone === 'mid' ? name : small
    if (item.kind === 'image') return Math.max(6, Math.round(base * 1.7 * zoneScale * 10) / 10)
    return Math.max(2.4, Math.round(base * zoneScale * 10) / 10)
  })
  let content = heights.reduce((sum, height) => sum + height, 0)
  if (content > room * 0.92 && content > 0) {
    const fit = (room * 0.92) / content
    heights = heights.map((height) => Math.max(2, Math.round(height * fit * 10) / 10))
    content = heights.reduce((sum, height) => sum + height, 0)
  }
  const gaps = Math.max(0, ordered.length - 1)
  const preferredGap = Math.max(1.2, Math.round(2.6 * scale * 10) / 10)
  const gapMm = gaps > 0 ? Math.min(preferredGap, Math.max(0.3, (room - content) / gaps)) : 0
  const total = content + gapMm * gaps
  const lineBleed = (height: number) => (height * (1.15 - 1)) / 2
  const first = heights[0] ?? 0
  const last = heights[heights.length - 1] ?? 0
  const visualSpan = total + lineBleed(first) + lineBleed(last)
  const free = room - visualSpan
  const shift = Math.min(100, Math.max(0, lift))
  const visualTop = free >= 0 ? roomTop + (free * shift) / 100 : faceHeightMm / 2 - visualSpan / 2
  let cursor = visualTop + lineBleed(first)
  const placed = new Map<string, Pick<LayoutItem, 'x' | 'y' | 'fontSizeMm' | 'align' | 'fontWeight'>>()
  ordered.forEach((item, index) => {
    const zone = zoneFor(item)
    if (!zone) return
    const height = heights[index]
    const align = zones[zone].align
    const x = align === 'left' ? 8 : align === 'right' ? 92 : 50
    const y = ((cursor + height / 2) / faceHeightMm) * 100
    cursor += height + gapMm
    placed.set(item.id, {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      fontSizeMm: height,
      align,
      fontWeight: zones[zone].bold ? 700 : 400,
    })
  })
  return items.map((item) => {
    if (keepIds?.has(item.id)) return { ...item, hidden: false }
    const place = placed.get(item.id)
    if (!place) return { ...item, hidden: true }
    return { ...item, hidden: false, ...place }
  })
}

export function itemBoothLabel(item: LayoutItem, sample: { values: Record<string, string> } | null): string {
  if (item.kind === 'image') return '圖片'
  if (item.kind === 'static') return item.text.trim() || '文字'
  const live = item.fieldHeader ? sample?.values[item.fieldHeader]?.trim() : ''
  return live || item.text || '欄位'
}
