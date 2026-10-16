import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  applyBadgeSize,
  applyCardPaperSize,
  applyOrientation,
  BADGE_IDS,
  BADGE_PRESETS,
  measureAlignUnits,
  paperDimensions,
  PAPER_PRESETS,
} from '../lib/paper'
import { BADGE_FIXED_STYLES, fixedBadgeLook } from '../lib/badgeLook'
import { applyBadgeZones, applyBoothLayout, boothLayoutHasCornerExtra, boothLayoutPinsCorners, boothLayoutPresets, boothSlotAt, boothSlotCount, BOOTH_CORNER_CHOICES, defaultBadgeZoneOf, defaultBoothLayoutId, itemBoothLabel, resolveBoothLayoutId } from '../lib/boothLayouts'
import type { BadgeZoneId, BadgeZoneStyle } from '../lib/boothLayouts'
import type { PrintImposition } from '../lib/printLayout'
import type { BadgeLook, BadgeSizeId, LayoutSettings, LayoutItem, PageOrientation, PaperSizeId, StudentRow } from '../types'
import {
  CARD_DECOR_CHOICES,
  CARD_DECOR_COLORS,
  DEFAULT_BADGE_LOOK,
  DEFAULT_CARD_DECOR,
  FONT_CHOICES,
  clampFontWeight,
  uid,
} from '../types'
import { PagesPreview } from './PagesPreview'
import { PlateCard } from './PlateCard'
import { PrintPreview } from './PrintPreview'
import { StandPreview } from './StandPreview'

type DropLoc = { zone: 'slot'; index: number } | { zone: 'idle'; index: number } | { zone: 'idle-bin' }

const MM_PX = 96 / 25.4

function initialBadgePick(items: LayoutItem[]): Record<BadgeZoneId, string | null> {
  const zoneOf = defaultBadgeZoneOf(items)
  const pick: Record<BadgeZoneId, string | null> = { top: null, mid: null, bot: null }
  for (const item of items) {
    const zone = zoneOf[item.id]
    if (pick[zone] == null) pick[zone] = item.id
  }
  return pick
}

function picksToZoneOf(pick: Record<BadgeZoneId, string | null>): Record<string, BadgeZoneId> {
  const map: Record<string, BadgeZoneId> = {}
  ;(['top', 'mid', 'bot'] as const).forEach((zone) => {
    const id = pick[zone]
    if (id) map[id] = zone
  })
  return map
}

/** Fit a paper sheet inside the preview stage. Uses the stage box, not the sheet's laid-out size. */
function fitPreviewScale(stageW: number, stageH: number, widthMm: number, heightMm: number) {
  const w = widthMm * MM_PX
  const h = heightMm * MM_PX
  if (stageW < 48 || stageH < 48 || w <= 0 || h <= 0) return null
  return Math.max(0.12, Math.min((stageW - 28) / w, (stageH - 28) / h, 1))
}

function padSlots(ids: (string | null)[], n: number): (string | null)[] {
  const next = ids.slice(0, n)
  while (next.length < n) next.push(null)
  return next
}

function placedIds(slots: (string | null)[]) {
  return slots.filter((id): id is string => Boolean(id))
}

type WizardStep = 'paper' | 'type' | 'layout' | 'style' | 'text' | 'extra' | 'frame'
type ExtraKey = 'extra-0' | 'extra-1'
type ExtraSlot = { id: string | null; scale: number; baseMm: number }

const EMPTY_EXTRA: ExtraSlot = { id: null, scale: 100, baseMm: 12 }

/** 改為 true 後，欄位匯入超過三個元素會開啟步驟 5。 */
const BADGE_EXTRA_STEP = false

const GROUP_CENTER_LAYOUTS = new Set([
  'two-equal-tight',
  'two-equal-wide',
  'two-left-big',
  'two-right-big',
])

function measureTextCenters(face: HTMLElement, items: LayoutItem[]) {
  const fr = face.getBoundingClientRect()
  const map = new Map<string, { cx: number; cy: number }>()
  if (fr.width <= 0 || fr.height <= 0) return map
  for (const it of items) {
    if (it.kind === 'image') continue
    const el = face.querySelector(`[data-item-id="${CSS.escape(it.id)}"]`) as HTMLElement | null
    if (!el) continue
    const r = el.getBoundingClientRect()
    map.set(it.id, {
      cx: ((r.left + r.right) / 2 - fr.left) / fr.width * 100,
      cy: ((r.top + r.bottom) / 2 - fr.top) / fr.height * 100,
    })
  }
  return map
}

const PAPER_IDS = Object.keys(PAPER_PRESETS) as PaperSizeId[]

const TEXT_COLORS = [
  '#0f241f',
  '#10241f',
  '#1a3a32',
  '#2f2a26',
  '#4a635c',
  '#0f6e56',
  '#3d5a80',
  '#9b2c2c',
  '#b85c38',
  '#ffffff',
  ...CARD_DECOR_COLORS,
]

interface Props {
  settings: LayoutSettings
  sample: StudentRow | null
  rows: StudentRow[]
  title: string
  onChange: (settings: LayoutSettings) => void
  onBack: () => void
}

export function BoothWizard({ settings, sample, rows, title, onChange, onBack }: Props) {
  const [phase, setPhase] = useState<WizardStep>('paper')
  const sourceItems = useRef(settings.items)
  const allStartIds = sourceItems.current.map((it) => it.id)
  const startLayout = defaultBoothLayoutId(allStartIds.length)
  const startSlots = boothSlotCount(startLayout)
  const [layoutId, setLayoutId] = useState(startLayout)
  const [cornerExtra, setCornerExtra] = useState<(typeof BOOTH_CORNER_CHOICES)[number]['id']>('tl')
  const [slotIds, setSlotIds] = useState<(string | null)[]>(() => padSlots(allStartIds, startSlots))
  const [idleIds, setIdleIds] = useState(() => allStartIds.slice(startSlots))
  const [globalAlign, setGlobalAlign] = useState<LayoutItem['align']>('center')
  const [dragFrom, setDragFrom] = useState<DropLoc | null>(null)
  const [dragOver, setDragOver] = useState<DropLoc | null>(null)
  const [showPages, setShowPages] = useState(false)
  const [printLayout, setPrintLayout] = useState<PrintImposition>('1x1')
  const [sheetSize, setSheetSize] = useState<PaperSizeId>('A4')
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const chooseRef = useRef<HTMLElement>(null)
  const pendingCenters = useRef<Map<string, { cx: number; cy: number }> | null>(null)
  const [scale, setScale] = useState(0.28)

  const isBadge = settings.mode === 'badge-single'
  const importedCount = useRef(settings.items.length)
  const showBadgeExtra = BADGE_EXTRA_STEP && isBadge && importedCount.current > 3
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  useLayoutEffect(() => {
    const choose = chooseRef.current
    if (!choose) return
    if (!window.matchMedia('(max-width: 899px)').matches) return
    choose.scrollTop = 0
  }, [phase])
  const paperSize: PaperSizeId = settings.paperGuide === 'none' ? 'A4' : settings.paperGuide
  const badgeSize: BadgeSizeId = settings.badgeSize ?? 'conf'
  const guide = isBadge
    ? { widthMm: settings.widthMm, heightMm: settings.faceHeightMm }
    : paperDimensions(paperSize, settings.orientation)
  const layoutFontScale = isBadge ? Math.min(settings.widthMm, settings.faceHeightMm) / 90 : 1
  const layouts = useMemo(
    () => boothLayoutPresets(sourceItems.current.length),
    [],
  )
  const decor = settings.cardDecor ?? DEFAULT_CARD_DECOR

  const stageNow = stageRef.current
  const fittedNow = stageNow
    ? fitPreviewScale(stageNow.clientWidth, stageNow.clientHeight, guide.widthMm, guide.heightMm)
    : null
  const viewScale = fittedNow ?? scale

  useLayoutEffect(() => {
    function fit() {
      const stage = stageRef.current
      if (!stage) return
      const next = fitPreviewScale(stage.clientWidth, stage.clientHeight, guide.widthMm, guide.heightMm)
      if (next == null) return
      setScale((prev) => (Math.abs(next - prev) > 0.004 ? next : prev))
    }
    fit()
    const ro = new ResizeObserver(fit)
    if (stageRef.current) ro.observe(stageRef.current)
    window.addEventListener('resize', fit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', fit)
    }
  }, [guide.widthMm, guide.heightMm, settings.mode, settings.widthMm, settings.faceHeightMm])

  function pickSize(id: PaperSizeId) {
    onChange(applyCardPaperSize(settings, id, settings.orientation))
  }

  function pickBadgeSize(id: BadgeSizeId) {
    onChange(applyBadgeSize(settings, id))
  }

  function pickOrientation(dir: PageOrientation) {
    onChange(applyOrientation(settings, dir))
  }

  function resolvedLayout(id: string = layoutId) {
    return resolveBoothLayoutId(id, cornerExtra)
  }

  function commitLayout(
    nextId: string,
    nextSlots: (string | null)[],
    nextAlign: LayoutItem['align'] = globalAlign,
    nextCorner: (typeof BOOTH_CORNER_CHOICES)[number]['id'] = cornerExtra,
  ) {
    pendingCenters.current = null
    onChange({
      ...settings,
      items: applyBoothLayout(
        sourceItems.current,
        resolveBoothLayoutId(nextId, nextCorner),
        placedIds(nextSlots),
        nextAlign,
        settings.widthMm,
        sample,
        settings.faceHeightMm,
        (sizePct / 100) * layoutFontScale,
      ),
      pendingCenterIds: undefined,
    })
  }

  function fitSlots(
    nextId: string,
    slots: (string | null)[],
    idle: string[],
    nextCorner: (typeof BOOTH_CORNER_CHOICES)[number]['id'] = cornerExtra,
  ) {
    const n = boothSlotCount(resolveBoothLayoutId(nextId, nextCorner))
    const filled = [...placedIds(slots), ...idle]
    const nextSlots = padSlots(filled, n)
    const nextIdle = filled.slice(n)
    setSlotIds(nextSlots)
    setIdleIds(nextIdle)
    commitLayout(nextId, nextSlots, globalAlign, nextCorner)
  }

  function pickLayout(id: string) {
    layoutTouched.current = true
    setLayoutId(id)
    fitSlots(id, slotIds, idleIds)
  }

  function pickCorner(id: (typeof BOOTH_CORNER_CHOICES)[number]['id']) {
    layoutTouched.current = true
    setCornerExtra(id)
    commitLayout(layoutId, slotIds, globalAlign, id)
  }

  function pickAlign(next: LayoutItem['align']) {
    layoutTouched.current = true
    setGlobalAlign(next)
    commitLayout(layoutId, slotIds, next)
  }

  function applyPlacement(nextSlots: (string | null)[], nextIdle: string[]) {
    layoutTouched.current = true
    setSlotIds(nextSlots)
    setIdleIds(nextIdle)
    commitLayout(layoutId, nextSlots, globalAlign)
  }

  function sameLoc(a: DropLoc | null, b: DropLoc) {
    if (!a) return false
    if (a.zone !== b.zone) return false
    if (a.zone === 'idle-bin' || b.zone === 'idle-bin') return a.zone === 'idle-bin' && b.zone === 'idle-bin'
    return a.index === b.index
  }

  function parseDropLoc(raw: string): DropLoc | null {
    try {
      const data = JSON.parse(raw) as DropLoc
      if (data?.zone === 'slot' || data?.zone === 'idle' || data?.zone === 'idle-bin') return data
    } catch {
      /* ignore */
    }
    return null
  }

  function moveDrag(from: DropLoc, to: DropLoc) {
    if (sameLoc(from, to)) return
    const slots = [...slotIds]
    const idle = [...idleIds]
    if (from.zone === 'slot' && to.zone === 'slot') {
      const a = slots[from.index]
      slots[from.index] = slots[to.index]
      slots[to.index] = a
    } else if (from.zone === 'idle' && to.zone === 'slot') {
      const incoming = idle[from.index]
      if (!incoming) return
      const displaced = slots[to.index]
      slots[to.index] = incoming
      if (displaced) idle[from.index] = displaced
      else idle.splice(from.index, 1)
    } else if (from.zone === 'slot' && (to.zone === 'idle' || to.zone === 'idle-bin')) {
      const moving = slots[from.index]
      if (!moving) return
      if (to.zone === 'idle-bin') {
        idle.push(moving)
        slots[from.index] = null
      } else {
        const displaced = idle[to.index]
        idle[to.index] = moving
        slots[from.index] = displaced ?? null
      }
    } else if (from.zone === 'idle' && to.zone === 'idle') {
      const [moved] = idle.splice(from.index, 1)
      idle.splice(to.index, 0, moved)
    }
    applyPlacement(slots, idle)
  }

  function patchTextStyle(partial: { fontFamily?: string; color?: string }) {
    function paint(list: LayoutItem[]) {
      return list.map((it) => {
        if (it.kind === 'image') return it
        const fontFamily = partial.fontFamily ?? it.fontFamily
        return {
          ...it,
          ...partial,
          fontFamily,
          fontWeight: partial.fontFamily ? clampFontWeight(partial.fontFamily, it.fontWeight) : it.fontWeight,
        }
      })
    }
    const nextFont = partial.fontFamily
    const toBpmf = nextFont === 'Bpmf Huninn' && textFont !== 'Bpmf Huninn'
    const fromBpmf = Boolean(nextFont && nextFont !== 'Bpmf Huninn' && textFont === 'Bpmf Huninn')
    if (fromBpmf && previewBeforeBpmf.current) {
      const saved = previewBeforeBpmf.current
      previewBeforeBpmf.current = null
      sourceItems.current = paint(saved.source)
      setLayoutId(saved.layoutId)
      setSlotIds(saved.slotIds)
      setIdleIds(saved.idleIds)
      setGlobalAlign(saved.align)
      onChange({
        ...settings,
        items: paint(saved.items),
        pendingCenterIds: undefined,
      })
      return
    }
    if (toBpmf) {
      previewBeforeBpmf.current = {
        items: settings.items.map((it) => ({ ...it })),
        source: sourceItems.current.map((it) => ({ ...it })),
        layoutId,
        slotIds: [...slotIds],
        idleIds: [...idleIds],
        align: globalAlign,
      }
      sourceItems.current = paint(sourceItems.current)
      const tight = boothLayoutPresets(sourceItems.current.length).find((opt) => opt.label === '等大緊密')
      if (tight) {
        setLayoutId(tight.id)
        fitSlots(tight.id, slotIds, idleIds)
        return
      }
    } else if (previewBeforeBpmf.current && !nextFont) {
      const saved = previewBeforeBpmf.current
      previewBeforeBpmf.current = {
        ...saved,
        items: paint(saved.items),
        source: paint(saved.source),
      }
    }
    sourceItems.current = paint(sourceItems.current)
    onChange({
      ...settings,
      items: paint(settings.items),
      pendingCenterIds: undefined,
    })
  }

  function pickFrame(kind: (typeof CARD_DECOR_CHOICES)[number]['id']) {
    onChange({
      ...settings,
      cardDecor: { ...decor, kind },
    })
  }

  const stepTotal = isBadge && showBadgeExtra ? 5 : 4
  const stepIndex =
    phase === 'paper'
      ? 1
      : phase === 'type'
        ? 2
        : phase === 'layout' || phase === 'style'
          ? 3
          : phase === 'extra'
            ? 5
            : 4
  const look = settings.badgeLook ?? DEFAULT_BADGE_LOOK
  const isLastStep = isBadge ? (showBadgeExtra ? phase === 'extra' : phase === 'text') : phase === 'frame'
  const textItem = settings.items.find((it) => it.kind !== 'image') ?? sourceItems.current.find((it) => it.kind !== 'image')
  const textFont = textItem?.fontFamily ?? FONT_CHOICES[0].id
  const textColor = textItem?.color ?? '#0f241f'
  const [sizePct, setSizePct] = useState(100)
  const [badgeZones, setBadgeZones] = useState<Record<BadgeZoneId, BadgeZoneStyle>>(() => {
    const pick = initialBadgePick(settings.items)
    const zone = (id: BadgeZoneId, bold: boolean): BadgeZoneStyle => ({
      on: pick[id] != null,
      align: 'center',
      bold,
      sizePct: 100,
    })
    return {
      top: zone('top', false),
      mid: zone('mid', true),
      bot: zone('bot', false),
    }
  })
  const [badgePick, setBadgePick] = useState<Record<BadgeZoneId, string | null>>(() => initialBadgePick(settings.items))
  const [badgeDraft, setBadgeDraft] = useState<{ zone: BadgeZoneId | ExtraKey; text: string } | null>(null)
  const [extraSlots, setExtraSlots] = useState<[ExtraSlot, ExtraSlot]>([{ ...EMPTY_EXTRA }, { ...EMPTY_EXTRA }])
  const [chipPct, setChipPct] = useState<Record<string, { w: number; h: number }>>({})
  const [sizeDragEnd, setSizeDragEnd] = useState(0)
  const sizeBase = useRef<{ id: string; x: number; y: number; fontSizeMm: number }[] | null>(null)
  const sizeCenters = useRef<Map<string, { cx: number; cy: number }> | null>(null)
  const sizeCentered = useRef(0)
  const sizeGesture = useRef(false)
  const sizeHoldNudge = useRef(0)
  const layoutTouched = useRef(false)
  const aligningRef = useRef(false)
  const previewBeforeBpmf = useRef<{
    items: LayoutItem[]
    source: LayoutItem[]
    layoutId: string
    slotIds: (string | null)[]
    idleIds: string[]
    align: LayoutItem['align']
  } | null>(null)
  const hoverSlot = dragOver?.zone === 'slot' ? dragOver.index : null
  const hoverItemId = hoverSlot != null ? slotIds[hoverSlot] : null
  const hoverGhost =
    hoverSlot != null && !hoverItemId ? (boothSlotAt(resolvedLayout(), hoverSlot) ?? null) : null
  const previewHighlightIds = hoverItemId ? [hoverItemId] : []

  useLayoutEffect(() => {
    if (isBadge) return
    commitLayout(layoutId, slotIds)
    // 進入拍貼機時只保留位置框內的物件在紙上
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (!isBadge) return
    const keepIds = new Set(extraSlots.map((slot) => slot.id).filter((id): id is string => Boolean(id)))
    const placed = applyBadgeZones(
      settings.items,
      picksToZoneOf(badgePick),
      badgeZones,
      settings.faceHeightMm,
      sizePct,
      layoutFontScale,
      (settings.badgeLook ?? DEFAULT_BADGE_LOOK).lift ?? 50,
      keepIds,
    )
    const same = placed.every((item, index) => {
      const prev = settings.items[index]
      return (
        prev &&
        prev.id === item.id &&
        Boolean(prev.hidden) === Boolean(item.hidden) &&
        prev.x === item.x &&
        prev.y === item.y &&
        prev.fontSizeMm === item.fontSizeMm &&
        prev.align === item.align &&
        prev.fontWeight === item.fontWeight
      )
    })
    if (same) return
    sourceItems.current = placed.map((item) => ({ ...item }))
    onChange({ ...settings, items: placed })
  }, [isBadge, settings, badgePick, badgeZones, sizePct, layoutFontScale, extraSlots, onChange])

  useLayoutEffect(() => {
    if (!isBadge || phase !== 'extra') return
    const ratio = settings.faceHeightMm > 0 ? settings.widthMm / settings.faceHeightMm : 1
    document.querySelectorAll('.badge-extra-map-wrap').forEach((wrap) => {
      const map = wrap.querySelector('.badge-extra-map') as HTMLElement | null
      if (!map) return
      const box = wrap.getBoundingClientRect()
      let width = box.width
      let height = width / ratio
      if (height > box.height) {
        height = box.height
        width = height * ratio
      }
      map.style.width = `${Math.max(0, width)}px`
      map.style.height = `${Math.max(0, height)}px`
    })
  }, [isBadge, phase, settings.widthMm, settings.faceHeightMm])

  useLayoutEffect(() => {
    if (!isBadge || phase !== 'extra') return
    const face = sheetRef.current?.querySelector('.plate-face[data-face="front"]') as HTMLElement | null
    if (!face) return
    const faceBox = face.getBoundingClientRect()
    if (faceBox.width < 1 || faceBox.height < 1) return
    const next: Record<string, { w: number; h: number }> = {}
    for (const slot of extraSlots) {
      if (!slot.id) continue
      const el = face.querySelector(`[data-item-id="${CSS.escape(slot.id)}"]`) as HTMLElement | null
      if (!el) continue
      const box = el.getBoundingClientRect()
      next[slot.id] = {
        w: Math.round(Math.min(100, (box.width / faceBox.width) * 100) * 10) / 10,
        h: Math.round(Math.min(100, (box.height / faceBox.height) * 100) * 10) / 10,
      }
    }
    setChipPct((cur) => {
      const ids = Object.keys(next)
      if (ids.length !== Object.keys(cur).length) return next
      for (const id of ids) {
        const prev = cur[id]
        if (!prev || Math.abs(prev.w - next[id].w) > 0.4 || Math.abs(prev.h - next[id].h) > 0.4) return next
      }
      return cur
    })
  }, [isBadge, phase, extraSlots, settings.items])

  useLayoutEffect(() => {
    let cancelled = false
    function nudge() {
      if (cancelled || aligningRef.current || showPages || sizeHoldNudge.current !== 0 || isBadge) return
      if (boothLayoutPinsCorners(resolvedLayout())) return
      if (phase === 'type' && !GROUP_CENTER_LAYOUTS.has(resolvedLayout())) return
      const root = sheetRef.current
      const face = root?.querySelector('.plate-face[data-face="front"]') as HTMLElement | null
      if (!face) return
      const pairOnly = boothLayoutHasCornerExtra(resolvedLayout())
      const placed = placedIds(slotIds)
      const ids = pairOnly ? placed.slice(0, -1) : placed
      if (!ids.length) return
      const units = measureAlignUnits(face, settings.items, ids)
      if (!units.length) return
      const minX = Math.min(...units.map((u) => u.minX))
      const maxX = Math.max(...units.map((u) => u.maxX))
      const minY = Math.min(...units.map((u) => u.minY))
      const maxY = Math.max(...units.map((u) => u.maxY))
      if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return
      const cx = (minX + maxX) / 2
      const cy = (minY + maxY) / 2
      const align =
        pairOnly || phase === 'type' || phase === 'paper'
          ? 'center'
          : phase === 'layout' || phase === 'frame'
            ? globalAlign
            : 'center'
      const edge = 8
      const dx =
        align === 'left' ? edge - minX : align === 'right' ? 100 - edge - maxX : 50 - cx
      const dy = align === 'center' ? 50 - cy : 0
      if (Math.abs(dx) < 0.45 && Math.abs(dy) < 0.45) return
      const idSet = new Set(ids)
      aligningRef.current = true
      onChange({
        ...settings,
        items: settings.items.map((it) =>
          idSet.has(it.id)
            ? {
                ...it,
                x: Math.round((it.x + dx) * 10) / 10,
                y: Math.round((it.y + dy) * 10) / 10,
              }
            : it,
        ),
      })
      window.setTimeout(() => {
        aligningRef.current = false
      }, 60)
    }
    const t1 = window.setTimeout(nudge, 30)
    const t2 = window.setTimeout(nudge, 200)
    void document.fonts.ready.then(nudge)
    document.fonts.addEventListener('loadingdone', nudge)
    return () => {
      cancelled = true
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      document.fonts.removeEventListener('loadingdone', nudge)
    }
  }, [
    phase,
    globalAlign,
    layoutId,
    cornerExtra,
    slotIds,
    idleIds,
    textFont,
    textColor,
    scale,
    showPages,
    settings,
    onChange,
  ])

  useLayoutEffect(() => {
    const pending = pendingCenters.current
    if (!pending || pending.size === 0) return
    const face = sheetRef.current?.querySelector('.plate-face[data-face="front"]') as HTMLElement | null
    if (!face) return
    const now = measureTextCenters(face, settings.items)
    pendingCenters.current = null
    let changed = false
    const next = settings.items.map((it) => {
      const want = pending.get(it.id)
      const got = now.get(it.id)
      if (!want || !got || it.kind === 'image') return it
      const dx = want.cx - got.cx
      const dy = want.cy - got.cy
      if (Math.abs(dx) < 0.08 && Math.abs(dy) < 0.08) return it
      changed = true
      return {
        ...it,
        x: Math.round((it.x + dx) * 10) / 10,
        y: Math.round((it.y + dy) * 10) / 10,
      }
    })
    if (!changed) return
    const placed = new Map(next.map((it) => [it.id, it]))
    sourceItems.current = sourceItems.current.map((it) => {
      const n = placed.get(it.id)
      if (!n || it.kind === 'image') return it
      return { ...it, x: n.x, y: n.y }
    })
    onChange({
      ...settings,
      items: next,
      pendingCenterIds: undefined,
    })
  }, [settings, onChange])

  useLayoutEffect(() => {
    if (phase !== 'type' || sizeDragEnd === 0 || sizeCentered.current === sizeDragEnd) return
    sizeCentered.current = sizeDragEnd
    if (isBadge || !GROUP_CENTER_LAYOUTS.has(layoutId)) return

    if (!layoutTouched.current && layoutId === 'two-equal-tight') {
      const placed = applyBoothLayout(
        sourceItems.current,
        'two-equal-tight',
        placedIds(slotIds),
        'center',
        settings.widthMm,
        sample,
        settings.faceHeightMm,
        (sizePct / 100) * layoutFontScale,
      )
      const scale = Math.max(sizePct, 1) / 100
      sizeBase.current = placed.map((it) => ({
        id: it.id,
        x: it.x,
        y: it.y,
        fontSizeMm: Math.round((it.fontSizeMm / scale) * 10) / 10,
      }))
      sizeCenters.current = new Map(
        placed.filter((it) => it.kind !== 'image').map((it) => [it.id, { cx: it.x, cy: it.y }]),
      )
      pendingCenters.current = null
      const placedById = new Map(placed.map((it) => [it.id, it]))
      sourceItems.current = sourceItems.current.map((it) => {
        const next = placedById.get(it.id)
        if (!next) return it
        return { ...it, x: next.x, y: next.y, align: next.align, fontSizeMm: next.fontSizeMm }
      })
      onChange({
        ...settings,
        items: placed,
        pendingCenterIds: undefined,
      })
      return
    }

    const face = sheetRef.current?.querySelector('.plate-face[data-face="front"]') as HTMLElement | null
    if (!face) return
    const ids = settings.items.filter((it) => it.kind !== 'image').map((it) => it.id)
    if (!ids.length) return
    const units = measureAlignUnits(face, settings.items, ids)
    if (!units.length) return
    const minX = Math.min(...units.map((u) => u.minX))
    const maxX = Math.max(...units.map((u) => u.maxX))
    const minY = Math.min(...units.map((u) => u.minY))
    const maxY = Math.max(...units.map((u) => u.maxY))
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) return
    const dx = Math.round((50 - (minX + maxX) / 2) * 10) / 10
    const dy = Math.round((50 - (minY + maxY) / 2) * 10) / 10
    if (Math.abs(dx) < 0.15 && Math.abs(dy) < 0.15) return
    const idSet = new Set(ids)
    pendingCenters.current = null
    const shift = (x: number, y: number) => ({
      x: Math.round((x + dx) * 10) / 10,
      y: Math.round((y + dy) * 10) / 10,
    })
    if (sizeBase.current) {
      sizeBase.current = sizeBase.current.map((item) =>
        idSet.has(item.id) ? { ...item, ...shift(item.x, item.y) } : item,
      )
    }
    if (sizeCenters.current) {
      const nextCenters = new Map(sizeCenters.current)
      for (const id of ids) {
        const center = nextCenters.get(id)
        if (center) nextCenters.set(id, { cx: center.cx + dx, cy: center.cy + dy })
      }
      sizeCenters.current = nextCenters
    }
    sourceItems.current = sourceItems.current.map((it) =>
      idSet.has(it.id) ? { ...it, ...shift(it.x, it.y) } : it,
    )
    onChange({
      ...settings,
      items: settings.items.map((it) => (idSet.has(it.id) ? { ...it, ...shift(it.x, it.y) } : it)),
      pendingCenterIds: undefined,
    })
  }, [phase, sizeDragEnd, settings, onChange, layoutId, sizePct, slotIds, sample])

  function applySizePct(pct: number) {
    if (isBadge) {
      setSizePct(pct)
      return
    }
    const base = sizeBase.current
    if (!base?.length) return
    const scale = pct / 100
    const byId = new Map(base.map((item) => [item.id, item]))
    function paint(list: LayoutItem[]) {
      return list.map((it) => {
        const saved = byId.get(it.id)
        if (!saved) return it
        const fontSizeMm = Math.max(1, Math.round(saved.fontSizeMm * scale * 10) / 10)
        return { ...it, fontSizeMm, x: saved.x, y: saved.y }
      })
    }
    sourceItems.current = paint(sourceItems.current)
    if (sizeCenters.current) pendingCenters.current = sizeCenters.current
    setSizePct(pct)
    onChange({
      ...settings,
      items: paint(settings.items),
      pendingCenterIds: undefined,
    })
  }

  function beginSizeDrag() {
    if (sizeGesture.current) return
    sizeGesture.current = true
    sizeHoldNudge.current += 1
    const scale = Math.max(sizePct, 1) / 100
    sizeBase.current = settings.items.map((it) => ({
      id: it.id,
      x: it.x,
      y: it.y,
      fontSizeMm: Math.round((it.fontSizeMm / scale) * 10) / 10,
    }))
    const face = sheetRef.current?.querySelector('.plate-face[data-face="front"]') as HTMLElement | null
    sizeCenters.current = face ? measureTextCenters(face, settings.items) : null
  }

  function endSizeDrag() {
    if (!sizeGesture.current) return
    sizeGesture.current = false
    const hold = sizeHoldNudge.current
    setSizeDragEnd((n) => n + 1)
    window.setTimeout(() => {
      if (sizeHoldNudge.current === hold) sizeHoldNudge.current = 0
    }, 260)
  }

  function goNext() {
    if (phase === 'paper') {
      setPhase('type')
      return
    }
    if (phase === 'type') {
      if (!isBadge) {
        if (!layoutTouched.current) {
          const id = defaultBoothLayoutId(sourceItems.current.length)
          setLayoutId(id)
          fitSlots(id, slotIds, idleIds)
        } else {
          commitLayout(layoutId, slotIds)
        }
        setPhase('layout')
        return
      }
      setPhase('style')
      return
    }
    if (phase === 'layout') setPhase('frame')
    else if (phase === 'style') setPhase('text')
    else if (phase === 'text' && showBadgeExtra) setPhase('extra')
  }

  function goPrev() {
    if (phase === 'type') setPhase('paper')
    else if (phase === 'layout') setPhase('type')
    else if (phase === 'style') setPhase('type')
    else if (phase === 'text') setPhase('style')
    else if (phase === 'extra') setPhase('text')
    else if (phase === 'frame') setPhase('layout')
  }

  function patchBadgeLook(partial: Partial<BadgeLook>) {
    const current = settings.badgeLook ?? DEFAULT_BADGE_LOOK
    onChange({ ...settings, badgeLook: { ...current, ...partial } })
  }

  function releaseExtra(itemId: string) {
    if (!itemId) return
    setExtraSlots((cur) => {
      if (!cur.some((slot) => slot.id === itemId)) return cur
      return cur.map((slot) => (slot.id === itemId ? { ...EMPTY_EXTRA } : slot)) as [ExtraSlot, ExtraSlot]
    })
  }

  function occupyExtra(index: 0 | 1, itemId: string, baseMm: number) {
    setExtraSlots((cur) => {
      const next: [ExtraSlot, ExtraSlot] = [{ ...cur[0] }, { ...cur[1] }]
      const other = (1 - index) as 0 | 1
      if (next[other].id === itemId) next[other] = { ...EMPTY_EXTRA }
      next[index] = { id: itemId, scale: 100, baseMm }
      return next
    })
    setBadgePick((cur) => {
      const next = { ...cur }
      ;(['top', 'mid', 'bot'] as const).forEach((zone) => {
        if (next[zone] === itemId) next[zone] = null
      })
      return next
    })
  }

  function pickBadgeContent(zone: BadgeZoneId, itemId: string) {
    setBadgePick((cur) => {
      const next = { ...cur, [zone]: itemId || null }
      ;(['top', 'mid', 'bot'] as const).forEach((other) => {
        if (other !== zone && itemId && next[other] === itemId) next[other] = null
      })
      return next
    })
    if (itemId) releaseExtra(itemId)
  }

  function clearExtra(index: 0 | 1) {
    setExtraSlots((cur) => {
      const next: [ExtraSlot, ExtraSlot] = [{ ...cur[0] }, { ...cur[1] }]
      next[index] = { ...EMPTY_EXTRA }
      return next
    })
  }

  function assignExtra(index: 0 | 1, itemId: string) {
    const item = settings.items.find((it) => it.id === itemId)
    if (!item) return
    occupyExtra(index, itemId, item.fontSizeMm || 12)
    onChange({
      ...settings,
      items: settings.items.map((it) =>
        it.id === itemId ? { ...it, hidden: false, align: 'center', x: 50, y: 50 } : it,
      ),
    })
  }

  function setExtraScale(index: 0 | 1, scale: number) {
    const slot = extraSlots[index]
    if (!slot.id) return
    setExtraSlots((cur) => {
      const next: [ExtraSlot, ExtraSlot] = [{ ...cur[0] }, { ...cur[1] }]
      next[index] = { ...cur[index], scale }
      return next
    })
    const fontSizeMm = Math.max(2, Math.round(((slot.baseMm * scale) / 100) * 10) / 10)
    onChange({
      ...settings,
      items: settings.items.map((it) => (it.id === slot.id ? { ...it, fontSizeMm } : it)),
    })
  }

  function dragExtraChip(event: ReactPointerEvent<HTMLDivElement>, itemId: string) {
    event.preventDefault()
    const map = event.currentTarget.parentElement
    if (!map) return
    const pointerId = event.pointerId
    const chip = chipPct[itemId] ?? { w: 16, h: 12 }
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      const rect = map.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const halfW = chip.w / 2
      const halfH = chip.h / 2
      const x = Math.round(Math.min(100 - halfW, Math.max(halfW, ((ev.clientX - rect.left) / rect.width) * 100)) * 10) / 10
      const y = Math.round(Math.min(100 - halfH, Math.max(halfH, ((ev.clientY - rect.top) / rect.height) * 100)) * 10) / 10
      const current = settingsRef.current
      const prev = current.items.find((it) => it.id === itemId)
      if (!prev || (prev.x === x && prev.y === y && prev.align === 'center' && !prev.hidden)) return
      onChange({
        ...current,
        items: current.items.map((it) =>
          it.id === itemId ? { ...it, x, y, align: 'center', hidden: false } : it,
        ),
      })
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function addBadgeContent(zone: BadgeZoneId | ExtraKey, text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    const sampleItem = settings.items.find((item) => item.kind !== 'image')
    const extra = zone === 'extra-0' || zone === 'extra-1'
    const zoneStyle = extra ? null : badgeZones[zone]
    const item: LayoutItem = {
      id: uid('static'),
      kind: 'static',
      text: trimmed,
      x: 50,
      y: 50,
      fontSizeMm: sampleItem?.fontSizeMm ?? 8,
      fontWeight: zoneStyle?.bold ? 700 : 400,
      align: zoneStyle?.align ?? 'center',
      color: sampleItem?.color ?? '#0f241f',
      fontFamily: sampleItem?.fontFamily,
    }
    if (zone === 'extra-0' || zone === 'extra-1') {
      occupyExtra(zone === 'extra-0' ? 0 : 1, item.id, item.fontSizeMm)
    } else {
      setBadgePick((cur) => {
        const next = { ...cur, [zone]: item.id }
        ;(['top', 'mid', 'bot'] as const).forEach((other) => {
          if (other !== zone && next[other] === item.id) next[other] = null
        })
        return next
      })
    }
    onChange({ ...settings, items: [...settings.items, item] })
    setBadgeDraft(null)
  }

  return (
    <div className="booth-shell">
      <div className="booth-main">
        <section className="booth-choose" ref={chooseRef}>
          <p className="booth-step-label">
            步驟 {stepIndex}／{stepTotal}
            {phase === 'paper'
              ? isBadge
                ? ' · 尺寸'
                : ' · 尺寸與方向'
              : phase === 'type'
                ? ' · 文字'
                : phase === 'layout'
                  ? ' · 布局'
                  : phase === 'style'
                    ? ' · 選擇樣式'
                    : phase === 'text'
                      ? ' · 文字調整'
                      : phase === 'extra'
                        ? ' · 額外元素'
                        : ' · 外框'}
          </p>
          <div className="booth-choose-body">

          {phase === 'paper' && (
            <>
              <h2>{isBadge ? '名牌尺寸' : '紙張尺寸'}</h2>
              <div className="booth-cards">
                {isBadge
                  ? BADGE_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`booth-card ${badgeSize === id ? 'is-active' : ''}`}
                        onClick={() => pickBadgeSize(id)}
                      >
                        <strong>{BADGE_PRESETS[id].label}</strong>
                        <span>
                          {BADGE_PRESETS[id].inch}
                          <br />
                          {BADGE_PRESETS[id].widthMm}×{BADGE_PRESETS[id].heightMm} mm
                        </span>
                      </button>
                    ))
                  : PAPER_IDS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`booth-card ${paperSize === id ? 'is-active' : ''}`}
                        onClick={() => pickSize(id)}
                      >
                        <strong>{id}</strong>
                        <span>
                          {PAPER_PRESETS[id].shortMm}×{PAPER_PRESETS[id].longMm} mm
                        </span>
                      </button>
                    ))}
              </div>
              {isBadge ? null : (
                <>
                  <h2>方向</h2>
                  <div className="booth-cards">
                    <button
                      type="button"
                      className={`booth-card ${settings.orientation === 'portrait' ? 'is-active' : ''}`}
                      onClick={() => pickOrientation('portrait')}
                    >
                      <strong>直向</strong>
                    </button>
                    <button
                      type="button"
                      className={`booth-card ${settings.orientation === 'landscape' ? 'is-active' : ''}`}
                      onClick={() => pickOrientation('landscape')}
                    >
                      <strong>橫向</strong>
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {phase === 'type' && (
            <>
              <h2>字型</h2>
              <div className="booth-cards">
                {FONT_CHOICES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`booth-card ${textFont === f.id ? 'is-active' : ''}`}
                    onClick={() => patchTextStyle({ fontFamily: f.id })}
                  >
                    <strong style={{ fontFamily: f.stack }}>{f.label}</strong>
                  </button>
                ))}
              </div>
              <h2>文字顏色</h2>
              <div className="booth-colors">
                {[...new Set(TEXT_COLORS)].map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    className={`decor-swatch ${textColor.toLowerCase() === hex.toLowerCase() ? 'is-active' : ''}`}
                    style={{ background: hex }}
                    aria-label={hex}
                    onClick={() => patchTextStyle({ color: hex })}
                  />
                ))}
                <label className="decor-pick" title="自訂顏色">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(textColor) ? textColor : '#0f241f'}
                    onChange={(e) => patchTextStyle({ color: e.target.value })}
                  />
                </label>
              </div>
              {isBadge ? null : (
                <>
                  <h2>字體大小</h2>
                  <label className="booth-size">
                    <input
                      type="range"
                      min={80}
                      max={120}
                      step={5}
                      value={sizePct}
                      aria-label="字體大小"
                      onPointerDown={beginSizeDrag}
                      onKeyDown={(e) => {
                        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
                        beginSizeDrag()
                      }}
                      onChange={(e) => applySizePct(Number(e.target.value))}
                      onPointerUp={endSizeDrag}
                      onKeyUp={(e) => {
                        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) return
                        endSizeDrag()
                      }}
                    />
                    <span>{sizePct}%</span>
                  </label>
                </>
              )}
            </>
          )}

          {phase === 'style' && isBadge && (
            <>
              <h2>選擇樣式</h2>
              <div className="booth-cards">
                {BADGE_FIXED_STYLES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={`booth-card ${fixedBadgeLook(look).style === choice.id ? 'is-active' : ''}`}
                    onClick={() => patchBadgeLook({ style: choice.id, place: 'mid' })}
                  >
                    <strong>{choice.label}</strong>
                  </button>
                ))}
              </div>
              {look.style !== 'none' && (
                <>
                  <h2>樣式顏色</h2>
                  <div className="booth-colors">
                    {CARD_DECOR_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className={`decor-swatch ${look.color.toLowerCase() === hex.toLowerCase() ? 'is-active' : ''}`}
                        style={{ background: hex }}
                        aria-label={hex}
                        onClick={() => patchBadgeLook({ color: hex })}
                      />
                    ))}
                    <label className="decor-pick" title="自訂顏色">
                      <input
                        type="color"
                        value={/^#[0-9a-fA-F]{6}$/.test(look.color) ? look.color : '#0f6e56'}
                        onChange={(e) => patchBadgeLook({ color: e.target.value })}
                      />
                    </label>
                  </div>
                </>
              )}
              <h2>垂直位置</h2>
              <label className="booth-size">
                <span>靠上</span>
                <span className="booth-range">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={look.lift ?? 50}
                    aria-label="垂直位置"
                    onChange={(e) => {
                      let lift = Number(e.target.value)
                      if (Math.abs(lift - 50) <= 2) lift = 50
                      patchBadgeLook({ lift, place: 'mid' })
                    }}
                  />
                  <span className="booth-range-mid" aria-hidden="true" />
                </span>
                <span>靠下</span>
              </label>
            </>
          )}

          {phase === 'text' && isBadge && (
            <>
              <h2>文字調整</h2>
              <div className="badge-zones">
                {(
                  [
                    ['top', '上方小字資訊'],
                    ['mid', '姓名'],
                    ['bot', '下方小字資訊'],
                  ] as const
                ).map(([zone, label]) => {
                  const style = badgeZones[zone]
                  return (
                    <section key={zone} className={`badge-zone ${style.on ? '' : 'is-off'}`}>
                      <div className="badge-zone-head">
                        <strong>{label}</strong>
                        <button
                          type="button"
                          className={`badge-zone-toggle ${style.on ? 'is-on' : ''}`}
                          onClick={() =>
                            setBadgeZones((cur) => ({ ...cur, [zone]: { ...cur[zone], on: !cur[zone].on } }))
                          }
                        >
                          {style.on ? '已開啟' : '已關閉'}
                        </button>
                      </div>
                      <div className="seg booth-align-seg">
                        {(
                          [
                            ['left', '靠左'],
                            ['center', '置中'],
                            ['right', '靠右'],
                          ] as const
                        ).map(([align, alignLabel]) => (
                          <button
                            key={align}
                            type="button"
                            className={style.align === align ? 'is-active' : ''}
                            onClick={() =>
                              setBadgeZones((cur) => ({ ...cur, [zone]: { ...cur[zone], align } }))
                            }
                          >
                            {alignLabel}
                          </button>
                        ))}
                      </div>
                      <div className="badge-zone-style">
                        <button
                          type="button"
                          className={`badge-zone-bold ${style.bold ? 'is-on' : ''}`}
                          onClick={() =>
                            setBadgeZones((cur) => ({ ...cur, [zone]: { ...cur[zone], bold: !cur[zone].bold } }))
                          }
                        >
                          {style.bold ? '粗體開啟' : '粗體關閉'}
                        </button>
                        <label className="badge-zone-size">
                          <input
                            type="range"
                            min={40}
                            max={200}
                            step={10}
                            value={style.sizePct}
                            aria-label={`${label}文字大小`}
                            onChange={(e) =>
                              setBadgeZones((cur) => ({
                                ...cur,
                                [zone]: { ...cur[zone], sizePct: Number(e.target.value) },
                              }))
                            }
                          />
                          <span>{style.sizePct}%</span>
                        </label>
                      </div>
                      <div className="badge-zone-fields">
                        <select
                          className="badge-zone-select"
                          aria-label={`${label}內容`}
                          value={badgePick[zone] ?? ''}
                          onChange={(e) => {
                            if (e.target.value === '__add__') setBadgeDraft({ zone, text: '' })
                            else pickBadgeContent(zone, e.target.value)
                          }}
                        >
                          <option value="">無</option>
                          {settings.items.map((item) => (
                            <option key={item.id} value={item.id}>
                              {itemBoothLabel(item, sample)}
                            </option>
                          ))}
                          <option value="__add__">加入新內容</option>
                        </select>
                      </div>
                    </section>
                  )
                })}
              </div>
            </>
          )}

          {phase === 'extra' && isBadge && (
            <div className="badge-extras">
              {([0, 1] as const).map((index) => {
                const slot = extraSlots[index]
                const label = index === 0 ? '額外 1' : '額外 2'
                const item = slot.id ? settings.items.find((it) => it.id === slot.id) : undefined
                const box = slot.id ? chipPct[slot.id] : undefined
                return (
                  <section key={label} className="badge-extra" aria-label={label}>
                    <strong>{label}</strong>
                    <select
                      className="badge-zone-select"
                      aria-label={`${label}內容`}
                      value={slot.id ?? ''}
                      onChange={(e) => {
                        const value = e.target.value
                        if (value === '__add__') setBadgeDraft({ zone: index === 0 ? 'extra-0' : 'extra-1', text: '' })
                        else if (!value) clearExtra(index)
                        else assignExtra(index, value)
                      }}
                    >
                      <option value="">無</option>
                      {settings.items.map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {itemBoothLabel(choice, sample)}
                        </option>
                      ))}
                      <option value="__add__">加入新內容</option>
                    </select>
                    <label className="badge-zone-size">
                      <input
                        type="range"
                        min={40}
                        max={200}
                        step={10}
                        value={slot.scale}
                        disabled={!slot.id}
                        aria-label={`${label}大小`}
                        onChange={(e) => setExtraScale(index, Number(e.target.value))}
                      />
                      <span>{slot.scale}%</span>
                    </label>
                    <div className="badge-extra-map-wrap">
                      <div className="badge-extra-map">
                        {item && box ? (
                          <div
                            className="badge-extra-chip"
                            style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
                            onPointerDown={(e) => dragExtraChip(e, item.id)}
                          >
                            {item.kind === 'image' && item.imageSrc ? <img src={item.imageSrc} alt="" /> : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          )}

          {phase === 'layout' && !isBadge && (
            <>
              <h2>選擇布局</h2>
              {layouts.length === 0 ? (
                <p className="muted">目前沒有可排的物件。</p>
              ) : (
                <div className="booth-cards is-layout">
                  {layouts.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`booth-card ${layoutId === opt.id ? 'is-active' : ''}`}
                      onClick={() => pickLayout(opt.id)}
                    >
                      <strong>{opt.label}</strong>
                    </button>
                  ))}
                </div>
              )}
              {sourceItems.current.length >= 4 && layoutId.startsWith('four-') && (
                <>
                  <h2>角落物件</h2>
                  <div className="seg booth-align-seg">
                    {BOOTH_CORNER_CHOICES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={cornerExtra === c.id ? 'is-active' : ''}
                        onClick={() => pickCorner(c.id)}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {placedIds(slotIds).length > 0 &&
                !boothLayoutPinsCorners(layoutId) &&
                !boothLayoutHasCornerExtra(resolvedLayout()) && (
                <>
                  <h2>對齊</h2>
                  <div className="seg booth-align-seg">
                    <button
                      type="button"
                      className={globalAlign === 'left' ? 'is-active' : ''}
                      onClick={() => pickAlign('left')}
                    >
                      靠左
                    </button>
                    <button
                      type="button"
                      className={globalAlign === 'center' ? 'is-active' : ''}
                      onClick={() => pickAlign('center')}
                    >
                      置中
                    </button>
                    <button
                      type="button"
                      className={globalAlign === 'right' ? 'is-active' : ''}
                      onClick={() => pickAlign('right')}
                    >
                      靠右
                    </button>
                  </div>
                </>
              )}
              {sourceItems.current.length > 1 && (
                <>
                  <h2>拖曳以調換位置</h2>
                  <div className="booth-slots">
                    {slotIds.map((id, index) => {
                      const loc: DropLoc = { zone: 'slot', index }
                      const item = id ? sourceItems.current.find((it) => it.id === id) : undefined
                      return (
                        <div
                          key={`slot-${index}`}
                          className={`booth-drop ${sameLoc(dragOver, loc) ? 'is-over' : ''} ${sameLoc(dragFrom, loc) ? 'is-source' : ''}`}
                          onDragOver={(e) => {
                            e.preventDefault()
                            setDragOver(loc)
                          }}
                          onDragLeave={() => {
                            setDragOver((cur) => (cur && sameLoc(cur, loc) ? null : cur))
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            const from = dragFrom ?? parseDropLoc(e.dataTransfer.getData('text/plain'))
                            if (from) moveDrag(from, loc)
                            setDragFrom(null)
                            setDragOver(null)
                          }}
                        >
                          <span className="booth-drop-label">位置 {index + 1}</span>
                          {item ? (
                            <div
                              className="booth-drag-card"
                              draggable
                              onDragStart={(e) => {
                                setDragFrom(loc)
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', JSON.stringify(loc))
                              }}
                              onDragEnd={() => {
                                setDragFrom(null)
                                setDragOver(null)
                              }}
                            >
                              {itemBoothLabel(item, sample)}
                            </div>
                          ) : (
                            <div className="booth-drag-card is-empty">空位</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {idleIds.length > 0 && (
                    <>
                  <h2>閒置區</h2>
                  <p className="booth-step-label">拖到這裡的物件不會印在紙上，之後可以再拖回位置框。</p>
                  <div
                    className={`booth-idle ${dragOver?.zone === 'idle-bin' || dragOver?.zone === 'idle' ? 'is-over' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (dragOver?.zone !== 'idle') setDragOver({ zone: 'idle-bin' })
                    }}
                    onDragLeave={() => {
                      setDragOver((cur) => (cur?.zone === 'idle-bin' ? null : cur))
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const from = dragFrom ?? parseDropLoc(e.dataTransfer.getData('text/plain'))
                      if (from) moveDrag(from, { zone: 'idle-bin' })
                      setDragFrom(null)
                      setDragOver(null)
                    }}
                  >
                    {idleIds.map((id, index) => {
                        const loc: DropLoc = { zone: 'idle', index }
                        const item = sourceItems.current.find((it) => it.id === id)
                        return (
                          <div
                            key={`idle-${id}`}
                            className={`booth-drop is-idle ${sameLoc(dragOver, loc) ? 'is-over' : ''} ${sameLoc(dragFrom, loc) ? 'is-source' : ''}`}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDragOver(loc)
                            }}
                            onDrop={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              const from = dragFrom ?? parseDropLoc(e.dataTransfer.getData('text/plain'))
                              if (from) moveDrag(from, loc)
                              setDragFrom(null)
                              setDragOver(null)
                            }}
                          >
                            <span className="booth-drop-label">閒置</span>
                            <div
                              className="booth-drag-card"
                              draggable
                              onDragStart={(e) => {
                                setDragFrom(loc)
                                e.dataTransfer.effectAllowed = 'move'
                                e.dataTransfer.setData('text/plain', JSON.stringify(loc))
                              }}
                              onDragEnd={() => {
                                setDragFrom(null)
                                setDragOver(null)
                              }}
                            >
                              {item ? itemBoothLabel(item, sample) : '—'}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {phase === 'frame' && !isBadge && (
            <>
              <h2>選擇外框</h2>
              <div className="booth-cards is-frame">
                {CARD_DECOR_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`booth-card ${decor.kind === c.id ? 'is-active' : ''}`}
                    onClick={() => pickFrame(c.id)}
                  >
                    <strong>{c.label}</strong>
                  </button>
                ))}
              </div>
              {decor.kind !== 'none' && (
                <>
                <h2>外框顏色</h2>
                <div className="booth-colors">
                  {CARD_DECOR_COLORS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      className={`decor-swatch ${decor.color === hex ? 'is-active' : ''}`}
                      style={{ background: hex }}
                      aria-label={hex}
                      onClick={() => onChange({ ...settings, cardDecor: { ...decor, color: hex } })}
                    />
                  ))}
                </div>
                </>
              )}
            </>
          )}
          </div>

          <div className="booth-actions">
            <button type="button" className="btn" onClick={phase === 'paper' ? onBack : goPrev}>
              {phase === 'paper' ? '返回選擇' : '上一步'}
            </button>
            {!isLastStep ? (
              <button type="button" className="btn primary" onClick={goNext}>
                下一步
              </button>
            ) : (
              <button type="button" className="btn primary" onClick={() => setShowPages(true)}>
                預覽列印
              </button>
            )}
          </div>
        </section>

        <aside className="booth-preview">
          <p className="booth-step-label">{isBadge ? '平面預覽' : '列印預覽'}</p>
          <div className="booth-preview-stage" ref={stageRef}>
            {isBadge ? null : (
              <StandPreview
                settings={settings}
                student={sample}
                movable={false}
                highlightIds={previewHighlightIds}
                hotGhost={hoverGhost}
              />
            )}
            <div
              className="pages-preview-frame"
              style={{
                width: `calc(${guide.widthMm}mm * ${viewScale})`,
                height: `calc(${guide.heightMm}mm * ${viewScale})`,
              }}
            >
              <div
                ref={sheetRef}
                className="pages-preview-sheet"
                style={{
                  width: `${guide.widthMm}mm`,
                  height: `${guide.heightMm}mm`,
                  transform: `scale(${viewScale})`,
                }}
              >
                <div className="paper-stage-inner has-guide" style={{ width: '100%', height: '100%' }}>
                  <div className="paper-guide" aria-hidden>
                    <span className="paper-guide-label">
                      {isBadge
                        ? `${BADGE_PRESETS[badgeSize].label} ${settings.orientation === 'portrait' ? '直向' : '橫向'} · ${guide.widthMm}×${guide.heightMm} mm`
                        : `${paperSize} ${settings.orientation === 'portrait' ? '直向' : '橫向'} · ${guide.widthMm}×${guide.heightMm} mm`}
                    </span>
                  </div>
                  <div className="paper-card-slot">
                    <PlateCard
                      settings={settings}
                      student={sample}
                      showGuides
                      highlightIds={previewHighlightIds}
                      hotGhost={hoverGhost}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <PrintPreview settings={settings} rows={rows} imposition={printLayout} sheetSize={sheetSize} />
      {showPages && (
        <PagesPreview
          settings={settings}
          rows={rows}
          title={title}
          imposition={printLayout}
          onImpositionChange={setPrintLayout}
          sheetSize={sheetSize}
          onSheetSizeChange={setSheetSize}
          onClose={() => setShowPages(false)}
          onPrint={() => window.print()}
        />
      )}
      {badgeDraft ? (
        <div className="seat-notice" role="dialog" aria-modal="true" aria-labelledby="badge-add-title">
          <form
            className="seat-notice-card"
            onSubmit={(e) => {
              e.preventDefault()
              addBadgeContent(badgeDraft.zone, badgeDraft.text)
            }}
          >
            <h3 id="badge-add-title">加入新內容</h3>
            <input
              className="badge-add-input"
              aria-label="新內容"
              value={badgeDraft.text}
              autoFocus
              placeholder="輸入新內容"
              onChange={(e) => setBadgeDraft({ zone: badgeDraft.zone, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setBadgeDraft(null)
              }}
            />
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setBadgeDraft(null)}>
                取消
              </button>
              <button type="submit" className="btn primary">
                加入
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
