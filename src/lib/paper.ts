import type { LayoutItem, LayoutSettings, PageOrientation, PaperSizeId, PlateMode } from '../types'

/** ISO / JIS portrait short×long in mm */
export const PAPER_PRESETS: Record<PaperSizeId, { label: string; shortMm: number; longMm: number }> = {
  A3: { label: 'A3', shortMm: 297, longMm: 420 },
  A4: { label: 'A4', shortMm: 210, longMm: 297 },
  B5: { label: 'B5', shortMm: 176, longMm: 250 },
}

export function paperDimensions(
  size: PaperSizeId,
  orientation: PageOrientation,
): { widthMm: number; heightMm: number } {
  const p = PAPER_PRESETS[size]
  if (orientation === 'portrait') {
    return { widthMm: p.shortMm, heightMm: p.longMm }
  }
  return { widthMm: p.longMm, heightMm: p.shortMm }
}

/** Apply a common paper size to the editable card */
export function applyCardPaperSize(
  settings: LayoutSettings,
  size: PaperSizeId,
  orientation: PageOrientation = settings.orientation,
): LayoutSettings {
  const dims = paperDimensions(size, orientation)
  let widthMm = dims.widthMm
  let faceHeightMm = dims.heightMm
  if (settings.mode === 'desk') {
    faceHeightMm = Math.round((dims.heightMm / 3) * 10) / 10
  } else if (settings.mode === 'badge-double') {
    widthMm = Math.round((dims.widthMm / 2) * 10) / 10
    faceHeightMm = dims.heightMm
  }
  return {
    ...settings,
    orientation,
    paperGuide: size,
    widthMm,
    faceHeightMm,
  }
}

export function applyOrientation(
  settings: LayoutSettings,
  orientation: PageOrientation,
): LayoutSettings {
  const size: PaperSizeId = settings.paperGuide === 'none' ? 'A4' : settings.paperGuide
  const next = applyCardPaperSize(settings, size, orientation)
  if (settings.paperGuide === 'none') next.paperGuide = 'none'
  return next
}

export type AlignAction =
  | 'left'
  | 'center-h'
  | 'right'
  | 'top'
  | 'center-v'
  | 'bottom'
  | 'canvas-h'
  | 'canvas-v'
  | 'canvas-both'

function clampPct(n: number) {
  return Math.min(98, Math.max(2, Math.round(n * 10) / 10))
}

interface AlignUnit {
  ids: string[]
  minX: number
  maxX: number
  minY: number
  maxY: number
  cx: number
  cy: number
}

/** Treat each group as one unit; ungrouped items are their own unit. */
function buildAlignUnits(items: LayoutItem[], ids: string[]): AlignUnit[] {
  return itemBuckets(items, ids).map((members) => unitFromMembers(members))
}

function unitFromMembers(members: LayoutItem[], box?: { minX: number; maxX: number; minY: number; maxY: number }): AlignUnit {
  const minX = box?.minX ?? Math.min(...members.map((m) => m.x))
  const maxX = box?.maxX ?? Math.max(...members.map((m) => m.x))
  const minY = box?.minY ?? Math.min(...members.map((m) => m.y))
  const maxY = box?.maxY ?? Math.max(...members.map((m) => m.y))
  return {
    ids: members.map((m) => m.id),
    minX,
    maxX,
    minY,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  }
}

function itemBuckets(items: LayoutItem[], ids: string[]): LayoutItem[][] {
  const selected = items.filter((it) => ids.includes(it.id))
  const buckets = new Map<string, LayoutItem[]>()
  for (const it of selected) {
    const key = it.groupId ? `g:${it.groupId}` : `i:${it.id}`
    const list = buckets.get(key) ?? []
    list.push(it)
    buckets.set(key, list)
  }
  return [...buckets.values()]
}

/** Visual bbox in % of the plate face (accounts for text width and align transform). */
export function measureAlignUnits(
  face: HTMLElement,
  items: LayoutItem[],
  ids: string[],
): AlignUnit[] {
  const faceRect = face.getBoundingClientRect()
  if (faceRect.width <= 0 || faceRect.height <= 0) return buildAlignUnits(items, ids)

  return itemBuckets(items, ids).map((members) => {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let measured = 0
    for (const m of members) {
      const el = face.querySelector(`[data-item-id="${CSS.escape(m.id)}"]`) as HTMLElement | null
      if (!el) continue
      const r = el.getBoundingClientRect()
      minX = Math.min(minX, ((r.left - faceRect.left) / faceRect.width) * 100)
      maxX = Math.max(maxX, ((r.right - faceRect.left) / faceRect.width) * 100)
      minY = Math.min(minY, ((r.top - faceRect.top) / faceRect.height) * 100)
      maxY = Math.max(maxY, ((r.bottom - faceRect.top) / faceRect.height) * 100)
      measured += 1
    }
    if (measured === 0) return unitFromMembers(members)
    return unitFromMembers(members, { minX, maxX, minY, maxY })
  })
}

function translateByIds(
  items: LayoutItem[],
  idSet: Set<string>,
  dx: number,
  dy: number,
): LayoutItem[] {
  if (dx === 0 && dy === 0) return items
  return items.map((it) => {
    if (!idSet.has(it.id)) return it
    return {
      ...it,
      x: clampPct(it.x + dx),
      y: clampPct(it.y + dy),
    }
  })
}

/**
 * Align by unit (group = one object). Relative actions align unit centers/edges;
 * canvas actions move the whole selection as one rigid body by its bbox center.
 */
export function alignItems(
  items: LayoutItem[],
  ids: string[],
  action: AlignAction,
  units = buildAlignUnits(items, ids),
): LayoutItem[] {
  if (units.length === 0) return items

  const allSelectedIds = new Set(units.flatMap((u) => u.ids))
  const selMinX = Math.min(...units.map((u) => u.minX))
  const selMaxX = Math.max(...units.map((u) => u.maxX))
  const selMinY = Math.min(...units.map((u) => u.minY))
  const selMaxY = Math.max(...units.map((u) => u.maxY))
  const selCx = (selMinX + selMaxX) / 2
  const selCy = (selMinY + selMaxY) / 2

  // Canvas: keep relative layout, move whole selection by its visual center
  if (action === 'canvas-h' || (action === 'center-h' && units.length === 1)) {
    return translateByIds(items, allSelectedIds, 50 - selCx, 0)
  }
  if (action === 'canvas-v' || (action === 'center-v' && units.length === 1)) {
    return translateByIds(items, allSelectedIds, 0, 50 - selCy)
  }
  if (action === 'canvas-both') {
    return translateByIds(items, allSelectedIds, 50 - selCx, 50 - selCy)
  }

  // Relative align among units (each group moves as a whole)
  if (units.length < 2) return items

  const targetCx = units.reduce((s, u) => s + u.cx, 0) / units.length
  const targetCy = units.reduce((s, u) => s + u.cy, 0) / units.length
  const targetLeft = Math.min(...units.map((u) => u.minX))
  const targetRight = Math.max(...units.map((u) => u.maxX))
  const targetTop = Math.min(...units.map((u) => u.minY))
  const targetBottom = Math.max(...units.map((u) => u.maxY))

  let next = items
  for (const unit of units) {
    const idSet = new Set(unit.ids)
    let dx = 0
    let dy = 0
    switch (action) {
      case 'left':
        dx = targetLeft - unit.minX
        break
      case 'right':
        dx = targetRight - unit.maxX
        break
      case 'center-h':
        dx = targetCx - unit.cx
        break
      case 'top':
        dy = targetTop - unit.minY
        break
      case 'bottom':
        dy = targetBottom - unit.maxY
        break
      case 'center-v':
        dy = targetCy - unit.cy
        break
      default:
        break
    }
    next = translateByIds(next, idSet, dx, dy)
  }
  return next
}


export function collectGroupIds(items: LayoutItem[], seedIds: string[]): string[] {
  const result = new Set<string>()
  for (const id of seedIds) {
    const item = items.find((it) => it.id === id)
    if (!item) continue
    if (item.groupId) {
      for (const other of items) {
        if (other.groupId === item.groupId) result.add(other.id)
      }
    } else {
      result.add(id)
    }
  }
  return [...result]
}

/** Resolve next selection after clicking an item (supports Shift multi-select + groups). */
export function resolveClickSelection(
  items: LayoutItem[],
  currentIds: string[],
  clickedId: string,
  additive: boolean,
): string[] {
  const clickedGroup = collectGroupIds(items, [clickedId])

  if (!additive) {
    // If already part of current selection, keep full selection (for multi-drag)
    if (currentIds.includes(clickedId)) {
      return collectGroupIds(items, currentIds)
    }
    return clickedGroup
  }

  const set = new Set(currentIds)
  const allIn = clickedGroup.every((id) => set.has(id))
  if (allIn) {
    for (const id of clickedGroup) set.delete(id)
  } else {
    for (const id of clickedGroup) set.add(id)
  }
  return [...set]
}

export function groupItems(items: LayoutItem[], ids: string[], groupId: string): LayoutItem[] {
  if (ids.length < 2) return items
  const idSet = new Set(ids)
  return items.map((it) => (idSet.has(it.id) ? { ...it, groupId } : it))
}

export function ungroupItems(items: LayoutItem[], ids: string[]): LayoutItem[] {
  const idSet = new Set(ids)
  const groupIds = new Set(
    items.filter((it) => idSet.has(it.id) && it.groupId).map((it) => it.groupId as string),
  )
  return items.map((it) => {
    if (it.groupId && (idSet.has(it.id) || groupIds.has(it.groupId))) {
      return { ...it, groupId: null }
    }
    return it
  })
}

export function totalCardHeightMm(mode: PlateMode, faceHeightMm: number) {
  if (mode === 'desk') return Math.round(faceHeightMm * 3)
  return Math.round(faceHeightMm)
}

export function totalCardWidthMm(mode: PlateMode, widthMm: number) {
  if (mode === 'badge-double') return Math.round(widthMm * 2)
  return Math.round(widthMm)
}

/** Triangle tent: flaps 1/6 + faces 1/3 + 1/3 + flap 1/6 */
export const DESK_FOLD_PCTS = [100 / 6, 50, 500 / 6] as const
