import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  applyCardPaperSize,
  applyOrientation,
  measureAlignUnits,
  paperDimensions,
  PAPER_PRESETS,
} from '../lib/paper'
import { applyBoothLayout, boothLayoutHasCornerExtra, boothLayoutPinsCorners, boothLayoutPresets, boothSlotAt, boothSlotCount, BOOTH_CORNER_CHOICES, defaultBoothLayoutId, itemBoothLabel, resolveBoothLayoutId } from '../lib/boothLayouts'
import type { PrintImposition } from '../lib/printLayout'
import type { LayoutSettings, LayoutItem, PageOrientation, PaperSizeId, StudentRow } from '../types'
import {
  CARD_DECOR_CHOICES,
  CARD_DECOR_COLORS,
  DEFAULT_CARD_DECOR,
  FONT_CHOICES,
  clampFontWeight,
} from '../types'
import { PagesPreview } from './PagesPreview'
import { PlateCard } from './PlateCard'
import { PrintPreview } from './PrintPreview'
import { StandPreview } from './StandPreview'

type DropLoc = { zone: 'slot'; index: number } | { zone: 'idle'; index: number } | { zone: 'idle-bin' }

function padSlots(ids: (string | null)[], n: number): (string | null)[] {
  const next = ids.slice(0, n)
  while (next.length < n) next.push(null)
  return next
}

function placedIds(slots: (string | null)[]) {
  return slots.filter((id): id is string => Boolean(id))
}

type WizardStep = 'paper' | 'type' | 'layout' | 'frame' | 'size'

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
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const fontSizeLocked = useRef(false)
  const pendingCenters = useRef<Map<string, { cx: number; cy: number }> | null>(null)
  const [scale, setScale] = useState(0.28)

  const paperSize: PaperSizeId = settings.paperGuide === 'none' ? 'A4' : settings.paperGuide
  const guide = paperDimensions(paperSize, settings.orientation)
  const layouts = useMemo(
    () => boothLayoutPresets(sourceItems.current.length),
    [],
  )
  const decor = settings.cardDecor ?? DEFAULT_CARD_DECOR

  useLayoutEffect(() => {
    function fit() {
      const stage = stageRef.current
      const sheet = sheetRef.current
      if (!stage || !sheet) return
      const w = sheet.offsetWidth
      const h = sheet.offsetHeight
      if (w <= 0 || h <= 0) return
      const next = Math.min((stage.clientWidth - 28) / w, (stage.clientHeight - 28) / h, 1)
      const clamped = Math.max(0.12, next)
      setScale((prev) => (Math.abs(clamped - prev) > 0.004 ? clamped : prev))
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
        fontSizeLocked.current,
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
    setLayoutId(id)
    fitSlots(id, slotIds, idleIds)
  }

  function pickCorner(id: (typeof BOOTH_CORNER_CHOICES)[number]['id']) {
    setCornerExtra(id)
    commitLayout(layoutId, slotIds, globalAlign, id)
  }

  function pickAlign(next: LayoutItem['align']) {
    setGlobalAlign(next)
    commitLayout(layoutId, slotIds, next)
  }

  function applyPlacement(nextSlots: (string | null)[], nextIdle: string[]) {
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

  const stepIndex =
    phase === 'paper' ? 1 : phase === 'type' ? 2 : phase === 'layout' ? 3 : phase === 'frame' ? 4 : 5
  const textItem = settings.items.find((it) => it.kind !== 'image') ?? sourceItems.current.find((it) => it.kind !== 'image')
  const textFont = textItem?.fontFamily ?? FONT_CHOICES[0].id
  const textColor = textItem?.color ?? '#0f241f'
  const [sizePct, setSizePct] = useState(100)
  const sizeBase = useRef<{ id: string; x: number; y: number; fontSizeMm: number }[] | null>(null)
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
    commitLayout(layoutId, slotIds)
    // 進入拍貼機時只保留位置框內的物件在紙上
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    let cancelled = false
    function nudge() {
      if (cancelled || aligningRef.current || showPages || fontSizeLocked.current || phase === 'size') return
      if (boothLayoutPinsCorners(resolvedLayout())) return
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
          : phase === 'layout' || phase === 'frame' || phase === 'size'
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

  function applySizePct(pct: number) {
    const base = sizeBase.current
    if (!base?.length) return
    const scale = pct / 100
    const cx = base.reduce((sum, item) => sum + item.x, 0) / base.length
    const cy = base.reduce((sum, item) => sum + item.y, 0) / base.length
    const byId = new Map(base.map((item) => [item.id, item]))
    function paint(list: LayoutItem[], move: boolean) {
      return list.map((it) => {
        const saved = byId.get(it.id)
        if (!saved) return it
        const fontSizeMm = Math.max(1, Math.round(saved.fontSizeMm * scale * 10) / 10)
        if (!move) return { ...it, fontSizeMm }
        return {
          ...it,
          fontSizeMm,
          x: Math.round((cx + (saved.x - cx) * scale) * 10) / 10,
          y: Math.round((cy + (saved.y - cy) * scale) * 10) / 10,
        }
      })
    }
    fontSizeLocked.current = pct !== 100
    sourceItems.current = paint(sourceItems.current, false)
    setSizePct(pct)
    onChange({
      ...settings,
      items: paint(settings.items, true),
      pendingCenterIds: undefined,
    })
  }

  function goNext() {
    if (phase === 'paper') {
      setPhase('type')
      return
    }
    if (phase === 'type') {
      const id = defaultBoothLayoutId(sourceItems.current.length)
      setLayoutId(id)
      fitSlots(id, slotIds, idleIds)
      setPhase('layout')
      return
    }
    if (phase === 'layout') {
      setPhase('frame')
      return
    }
    if (phase === 'frame') {
      sizeBase.current = settings.items.map((it) => ({
        id: it.id,
        x: it.x,
        y: it.y,
        fontSizeMm: it.fontSizeMm,
      }))
      setSizePct(100)
      setPhase('size')
    }
  }

  function goPrev() {
    if (phase === 'type') setPhase('paper')
    else if (phase === 'layout') setPhase('type')
    else if (phase === 'frame') setPhase('layout')
    else if (phase === 'size') setPhase('frame')
  }

  return (
    <div className="booth-shell">
      <div className="booth-main">
        <section className="booth-choose">
          <p className="booth-step-label">
            步驟 {stepIndex}／5
            {phase === 'paper'
              ? ' · 尺寸與方向'
              : phase === 'type'
                ? ' · 文字'
                : phase === 'layout'
                  ? ' · 布局'
                  : phase === 'frame'
                    ? ' · 外框'
                    : ' · 字體大小'}
          </p>

          {phase === 'paper' && (
            <>
              <h2>紙張尺寸</h2>
              <div className="booth-cards">
                {PAPER_IDS.map((id) => (
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
            </>
          )}

          {phase === 'layout' && (
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

          {phase === 'frame' && (
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
              )}
            </>
          )}

          {phase === 'size' && (
            <>
              <h2>字體大小</h2>
              <label className="booth-size">
                <input
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={sizePct}
                  aria-label="字體大小"
                  onChange={(e) => applySizePct(Number(e.target.value))}
                />
                <span>{sizePct}%</span>
              </label>
            </>
          )}

          <div className="booth-actions">
            <button type="button" className="btn" onClick={phase === 'paper' ? onBack : goPrev}>
              {phase === 'paper' ? '返回選擇' : '上一步'}
            </button>
            {phase !== 'size' ? (
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
          <p className="booth-step-label">列印預覽</p>
          <div className="booth-preview-stage" ref={stageRef}>
            <StandPreview
              settings={settings}
              student={sample}
              movable={false}
              highlightIds={previewHighlightIds}
              hotGhost={hoverGhost}
            />
            <div
              className="pages-preview-frame"
              style={{
                width: `calc(${guide.widthMm}mm * ${scale})`,
                height: `calc(${guide.heightMm}mm * ${scale})`,
              }}
            >
              <div
                ref={sheetRef}
                className="pages-preview-sheet"
                style={{
                  width: `${guide.widthMm}mm`,
                  height: `${guide.heightMm}mm`,
                  transform: `scale(${scale})`,
                }}
              >
                <div className="paper-stage-inner has-guide" style={{ width: '100%', height: '100%' }}>
                  <div className="paper-guide" aria-hidden>
                    <span className="paper-guide-label">
                      {paperSize} {settings.orientation === 'portrait' ? '直向' : '橫向'} · {guide.widthMm}×
                      {guide.heightMm} mm
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

      <PrintPreview settings={settings} rows={rows} imposition={printLayout} />
      {showPages && (
        <PagesPreview
          settings={settings}
          rows={rows}
          title={title}
          imposition={printLayout}
          onImpositionChange={setPrintLayout}
          onClose={() => setShowPages(false)}
          onPrint={() => window.print()}
        />
      )}
    </div>
  )
}
