import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import type {
  BadgeSizeId,
  ColumnMapping,
  LayoutItem,
  LayoutSettings,
  PaperSizeId,
  PlateMode,
  StudentRow,
} from '../types'
import { CARD_DECOR_CHOICES, CARD_DECOR_COLORS, DEFAULT_CARD_DECOR, FONT_CHOICES, FONT_WEIGHT_LABELS, SEQUENCE_HEADER, clampFontWeight, fontChoice, uid } from '../types'
import {
  alignItems,
  measureAlignUnits,
  applyBadgeSize,
  applyCardPaperSize,
  applyOrientation,
  BADGE_IDS,
  BADGE_PRESETS,
  groupItems,
  PAPER_PRESETS,
  paperDimensions,
  resolveClickSelection,
  ungroupItems,
  type AlignAction,
} from '../lib/paper'
import { BrandMark } from './BrandMark'
import { PlateCard } from './PlateCard'
import { PrintPreview } from './PrintPreview'
import { PagesPreview } from './PagesPreview'
import { StandPreview } from './StandPreview'
import type { PrintImposition } from '../lib/printLayout'

interface Props {
  settings: LayoutSettings
  mappings: ColumnMapping[]
  sample: StudentRow | null
  rows: StudentRow[]
  fileName: string
  title?: string
  allowedModes?: PlateMode[]
  onChange: (settings: LayoutSettings) => void
  onBack: () => void
  onHome?: () => void
}

const ALL_MODES: { id: PlateMode; title: string }[] = [
  { id: 'desk', title: '桌牌' },
  { id: 'badge-single', title: '名牌單面' },
  { id: 'badge-double', title: '名牌雙面' },
]

const PAPER_IDS = Object.keys(PAPER_PRESETS) as PaperSizeId[]

function HoverMenu({
  label,
  value,
  disabled,
  children,
}: {
  label: string
  value: string
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <div className={`toolbar-drop ${disabled ? 'is-disabled' : ''}`}>
      <button type="button" className="toolbar-drop-btn" disabled={disabled}>
        {value}
      </button>
      <div className="toolbar-drop-menu" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export function LayoutEditor({
  settings,
  mappings,
  sample,
  rows,
  onChange,
  onBack,
  onHome,
  title = '桌牌製作神器',
  allowedModes,
}: Props) {
  const modes = ALL_MODES.filter((m) => !allowedModes || allowedModes.includes(m.id))
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [freshId, setFreshId] = useState<string | null>(null)
  const [showPages, setShowPages] = useState(false)
  const [printLayout, setPrintLayout] = useState<PrintImposition>('1x1')
  const [sheetSize, setSheetSize] = useState<PaperSizeId>('A4')
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const pastRef = useRef<LayoutSettings[]>([])
  const futureRef = useRef<LayoutSettings[]>([])
  const settingsRef = useRef(settings)
  const pendingBaseRef = useRef<LayoutSettings | null>(null)
  const historyTimerRef = useRef<number | null>(null)
  const modeStoreRef = useRef<Partial<Record<PlateMode, LayoutSettings>>>({})
  settingsRef.current = settings
  const activeFields = mappings.filter((m) => m.enabled && m.role !== 'ignore')

  useLayoutEffect(() => {
    const ids = settings.pendingCenterIds
    if (!ids?.length) return
    let cancelled = false
    const apply = () => {
      if (cancelled) return
      const face = document.querySelector(
        '.plate-card.is-editable .plate-face.is-interactive',
      ) as HTMLElement | null
      if (!face || face.getBoundingClientRect().width <= 0) {
        requestAnimationFrame(apply)
        return
      }
      const current = settingsRef.current
      const grouped = groupItems(current.items, ids, 'group-default-pair')
      const units = measureAlignUnits(face, grouped, ids)
      const items = ungroupItems(alignItems(grouped, ids, 'canvas-both', units), ids)
      onChange({ ...current, items, pendingCenterIds: undefined })
    }
    const start = () => {
      if (typeof document !== 'undefined' && document.fonts?.ready) {
        void document.fonts.ready.then(() => requestAnimationFrame(apply))
      } else {
        requestAnimationFrame(apply)
      }
    }
    start()
    return () => {
      cancelled = true
    }
  }, [settings.pendingCenterIds, onChange])

  useLayoutEffect(() => {
    const face = document.querySelector('.editor-shell .plate-face.is-interactive')
    face?.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, [])

  const flushHistory = useCallback(() => {
    if (historyTimerRef.current != null) {
      window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
    const base = pendingBaseRef.current
    if (!base) return
    pendingBaseRef.current = null
    pastRef.current = [...pastRef.current, base].slice(-80)
    futureRef.current = []
    setCanUndo(true)
    setCanRedo(false)
  }, [])

  const commit = useCallback(
    (next: LayoutSettings) => {
      if (!pendingBaseRef.current) {
        pendingBaseRef.current = JSON.parse(JSON.stringify(settingsRef.current)) as LayoutSettings
      }
      onChange(next)
      if (historyTimerRef.current != null) window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = window.setTimeout(flushHistory, 400)
    },
    [flushHistory, onChange],
  )

  const undo = useCallback(() => {
    if (historyTimerRef.current != null) {
      window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
    const target = pendingBaseRef.current ?? pastRef.current.pop()
    pendingBaseRef.current = null
    if (!target) {
      setCanUndo(pastRef.current.length > 0)
      return
    }
    futureRef.current = [...futureRef.current, JSON.parse(JSON.stringify(settingsRef.current)) as LayoutSettings]
    onChange(target)
    setCanUndo(pastRef.current.length > 0)
    setCanRedo(true)
  }, [onChange])

  const redo = useCallback(() => {
    if (historyTimerRef.current != null) {
      window.clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
    pendingBaseRef.current = null
    const target = futureRef.current.pop()
    if (!target) {
      setCanRedo(false)
      return
    }
    pastRef.current = [...pastRef.current, JSON.parse(JSON.stringify(settingsRef.current)) as LayoutSettings]
    onChange(target)
    setCanUndo(true)
    setCanRedo(futureRef.current.length > 0)
  }, [onChange])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)
      if (typing) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  const handleSelect = useCallback(
    (id: string | null, opts?: { additive?: boolean }) => {
      if (id === null) {
        setSelectedIds([])
        setFreshId(null)
        return
      }
      setSelectedIds((prev) =>
        resolveClickSelection(settings.items, prev, id, Boolean(opts?.additive)),
      )
    },
    [settings.items],
  )

  const selected =
    selectedIds.length === 1
      ? (settings.items.find((it) => it.id === selectedIds[0]) ?? null)
      : null

  const multiCount = selectedIds.length
  const canGroup = multiCount >= 2
  const canUngroup = settings.items.some((it) => selectedIds.includes(it.id) && it.groupId)

  function setMode(mode: PlateMode) {
    if (mode === settings.mode) return
    if (allowedModes && !allowedModes.includes(mode)) return
    modeStoreRef.current[settings.mode] = JSON.parse(JSON.stringify(settings)) as LayoutSettings
    const saved = modeStoreRef.current[mode]
    if (saved) {
      commit(saved)
      return
    }
    const paperSize: PaperSizeId = settings.paperGuide === 'none' ? 'A4' : settings.paperGuide
    commit(
      applyCardPaperSize(
        {
          ...settings,
          mode,
          showFoldLine: mode === 'desk' || mode === 'badge-double',
        },
        paperSize,
      ),
    )
  }

  function patch(partial: Partial<LayoutSettings>) {
    commit({ ...settings, ...partial })
  }

  function patchDecor(partial: Partial<NonNullable<LayoutSettings['cardDecor']>>) {
    const current = settings.cardDecor ?? DEFAULT_CARD_DECOR
    patch({ cardDecor: { ...current, ...partial } })
  }

  function updateItem(id: string, partial: Partial<LayoutItem>) {
    commit({
      ...settings,
      items: settings.items.map((it) => (it.id === id ? { ...it, ...partial } : it)),
    })
  }

  function addStatic() {
    const id = uid('static')
    commit({
      ...settings,
      items: [
        ...settings.items,
        {
          id,
          kind: 'static',
          text: '自訂文字',
          x: 50,
          y: 50,
          fontSizeMm: 5,
          fontWeight: 500,
          fontFamily: 'Noto Sans TC',
          align: 'center',
          color: '#1a3a32',
        },
      ],
    })
    setSelectedIds([id])
    setFreshId(id)
  }

  function addField() {
    const first = activeFields[0]
    if (!first) return
    const id = uid('field')
    commit({
      ...settings,
      items: [
        ...settings.items,
        {
          id,
          kind: 'field',
          fieldHeader: first.header,
          text: first.header,
          x: 50,
          y: 50,
          fontSizeMm: 6,
          fontWeight: 700,
          fontFamily: 'Noto Sans TC',
          align: 'center',
          color: '#0f241f',
        },
      ],
    })
    setSelectedIds([id])
    setFreshId(id)
  }

  function removeSelected() {
    if (selectedIds.length === 0) return
    const idSet = new Set(selectedIds)
    commit({ ...settings, items: settings.items.filter((it) => !idSet.has(it.id)) })
    setSelectedIds([])
  }

  function applyAlign(action: AlignAction) {
    if (selectedIds.length === 0) return
    if (!action.startsWith('canvas') && action !== 'center-h' && action !== 'center-v' && selectedIds.length < 2) {
      return
    }
    const face = document.querySelector(
      '.plate-card.is-editable .plate-face.is-interactive',
    ) as HTMLElement | null
    const units = face ? measureAlignUnits(face, settings.items, selectedIds) : undefined
    commit({
      ...settings,
      items: alignItems(settings.items, selectedIds, action, units),
    })
  }

  function doGroup() {
    if (!canGroup) return
    commit({
      ...settings,
      items: groupItems(settings.items, selectedIds, uid('group')),
    })
  }

  function doUngroup() {
    if (!canUngroup) return
    commit({
      ...settings,
      items: ungroupItems(settings.items, selectedIds),
    })
  }

  const editor = useMemo(
    () => ({
      selectedIds,
      freshId,
      onSelect: handleSelect,
      onChangeSettings: commit,
      onItemsMoved: (ids: string[]) => {
        setFreshId((cur) => (cur && ids.includes(cur) ? null : cur))
      },
      onUpdateItem: (id: string, partial: Partial<LayoutItem>) => {
        const current = settingsRef.current
        commit({
          ...current,
          items: current.items.map((it) => (it.id === id ? { ...it, ...partial } : it)),
        })
      },
      onDeleteItem: (id: string) => {
        const current = settingsRef.current
        commit({ ...current, items: current.items.filter((it) => it.id !== id) })
        setSelectedIds((prev) => prev.filter((x) => x !== id))
      },
      canGroup,
      canUngroup,
      onGroup: doGroup,
      onUngroup: doUngroup,
      onAlign: applyAlign,
      onClearSelection: () => {
        setSelectedIds([])
        setFreshId(null)
      },
    }),
    [selectedIds, freshId, handleSelect, commit, canGroup, canUngroup],
  )

  const isBadge = settings.mode === 'badge-single'
  const badgeSize: BadgeSizeId = settings.badgeSize ?? 'conf'
  const paperSize: PaperSizeId =
    settings.paperGuide === 'none' ? 'A4' : settings.paperGuide
  const guide = isBadge
    ? { widthMm: settings.widthMm, heightMm: settings.faceHeightMm }
    : paperDimensions(paperSize, settings.orientation)
  const stageRef = useRef<HTMLDivElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const panDrag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const [portrait, setPortrait] = useState(false)
  const [panning, setPanning] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fit, setFit] = useState({ scale: 1, w: 0, h: 0 })
  const fitMode = portrait && (settings.mode === 'desk' || isBadge)
  const fitRef = useRef(fit)
  fitRef.current = fit

  useEffect(() => {
    const mq = window.matchMedia('(orientation: portrait)')
    const sync = () => setPortrait(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [guide.widthMm, guide.heightMm, fitMode])

  useLayoutEffect(() => {
    if (!fitMode) return
    const stage = stageRef.current
    const paper = paperRef.current
    if (!stage || !paper) return
    function measure() {
      if (!stage || !paper) return
      const styles = getComputedStyle(stage)
      const padX = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0)
      const padY = (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
      const availW = Math.max(40, stage.clientWidth - padX - 8)
      const availH = Math.max(40, stage.clientHeight - padY - 8)
      const natW = paper.offsetWidth
      const natH = paper.offsetHeight
      if (natW <= 0 || natH <= 0) return
      const scale = Math.min(availW / natW, availH / natH, 1)
      const w = Math.round(natW * scale)
      const h = Math.round(natH * scale)
      setFit((prev) =>
        Math.abs(prev.scale - scale) < 0.004 && prev.w === w && prev.h === h
          ? prev
          : { scale, w, h },
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [fitMode, guide.widthMm, guide.heightMm, settings.widthMm, settings.faceHeightMm, settings.orientation])

  function clampPan(x: number, y: number) {
    const stage = stageRef.current
    const box = fitRef.current
    if (!stage || box.w <= 0) return { x, y }
    const maxX = Math.max(24, (stage.clientWidth - box.w) / 2)
    const maxY = Math.max(24, (stage.clientHeight - box.h) / 2)
    return {
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    }
  }

  function onStagePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!fitMode || e.button !== 0) return
    const el = e.target as HTMLElement
    if (
      el.closest(
        '.plate-item, .item-mini-bar, .item-edit, .stand-preview, button, a, input, textarea, select, .mini-picker',
      )
    ) {
      return
    }
    panDrag.current = { x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y }
    setPanning(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onStagePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = panDrag.current
    if (!drag) return
    setPan(clampPan(drag.ox + (e.clientX - drag.x), drag.oy + (e.clientY - drag.y)))
  }

  function onStagePointerUp() {
    if (!panDrag.current) return
    panDrag.current = null
    setPanning(false)
  }

  return (
    <div className="editor-shell">
      <header className="editor-toolbar no-print">
        <div className="toolbar-row">
        <div className="toolbar-brand">
          <BrandMark size="sm" onHome={onHome} />
          <div className="toolbar-meta">
            <strong>{title}</strong>
          </div>
        </div>

        {modes.length > 1 && (
        <div className="toolbar-group">
          <span className="toolbar-label">類型</span>
          <div className="seg">
            {modes.map((m) => (
              <button
                key={m.id}
                type="button"
                className={settings.mode === m.id ? 'is-active' : ''}
                onClick={() => setMode(m.id)}
              >
                {m.title}
              </button>
            ))}
          </div>
        </div>
        )}

        <div className="toolbar-group">
          <span className="toolbar-label">{isBadge ? '名牌' : '紙張'}</span>
          <HoverMenu label={isBadge ? '名牌尺寸' : '紙張尺寸'} value={isBadge ? BADGE_PRESETS[badgeSize].inch : paperSize}>
            {isBadge
              ? BADGE_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={badgeSize === id ? 'is-active' : ''}
                    onClick={() => commit(applyBadgeSize(settings, id))}
                  >
                    {BADGE_PRESETS[id].label}
                  </button>
                ))
              : PAPER_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={paperSize === id ? 'is-active' : ''}
                    onClick={() => commit(applyCardPaperSize(settings, id))}
                  >
                    {id}
                  </button>
                ))}
          </HoverMenu>
        </div>

        {isBadge ? null : (
        <div className="toolbar-group">
          <span className="toolbar-label">方向</span>
          <div className="seg">
            <button
              type="button"
              className={settings.orientation === 'portrait' ? 'is-active' : ''}
              onClick={() => commit(applyOrientation(settings, 'portrait'))}
            >
              直向
            </button>
            <button
              type="button"
              className={settings.orientation === 'landscape' ? 'is-active' : ''}
              onClick={() => commit(applyOrientation(settings, 'landscape'))}
            >
              橫向
            </button>
          </div>
        </div>
        )}
        </div>

        <div className="toolbar-row">
        <div className="toolbar-group">
          <span className="toolbar-label">樣式</span>
          <div className="toolbar-drop decor-drop">
            <button type="button" className="toolbar-drop-btn">
              {CARD_DECOR_CHOICES.find((c) => c.id === (settings.cardDecor?.kind ?? 'none'))?.label ??
                '樣式'}
            </button>
            <div className="toolbar-drop-menu">
              <div className="decor-style-panel">
                <div className="decor-kinds">
                {CARD_DECOR_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={(settings.cardDecor?.kind ?? 'none') === c.id ? 'is-active' : ''}
                    onClick={() => patchDecor({ kind: c.id })}
                  >
                    {c.label}
                  </button>
                ))}
                </div>
                {(settings.cardDecor?.kind ?? 'none') !== 'none' && (
                  <div className="decor-colors">
                    {CARD_DECOR_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        className={`decor-swatch ${(settings.cardDecor?.color ?? '') === hex ? 'is-active' : ''}`}
                        style={{ background: hex }}
                        onClick={() => patchDecor({ color: hex })}
                        aria-label={hex}
                      />
                    ))}
                    <label className="decor-pick" title="自訂顏色">
                      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                        <path
                          fill="currentColor"
                          d="M13.4 1.1a1.5 1.5 0 0 1 2.1 2.1l-1.2 1.2-2.1-2.1 1.2-1.2ZM11.5 3.8 3.2 12.1l-.9 2.6 2.6-.9 8.3-8.3-1.7-1.7Z"
                        />
                      </svg>
                      <input
                        type="color"
                        value={
                          /^#[0-9a-fA-F]{6}$/.test(settings.cardDecor?.color ?? '')
                            ? settings.cardDecor!.color
                            : '#0f6e56'
                        }
                        onChange={(e) => patchDecor({ color: e.target.value })}
                        aria-label="自訂底色"
                      />
                    </label>
                    {((settings.cardDecor?.kind ?? 'none') === 'inset-line' ||
                      (settings.cardDecor?.kind ?? 'none') === 'double-frame') && (
                      <div className="seg">
                        <button
                          type="button"
                          className={(settings.cardDecor?.lineStyle ?? 'dashed') === 'dashed' ? 'is-active' : ''}
                          onClick={() => patchDecor({ lineStyle: 'dashed' })}
                        >
                          虛線
                        </button>
                        <button
                          type="button"
                          className={settings.cardDecor?.lineStyle === 'solid' ? 'is-active' : ''}
                          onClick={() => patchDecor({ lineStyle: 'solid' })}
                        >
                          實線
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label">對齊</span>
          <HoverMenu label="全區對齊" value="全區" disabled={multiCount === 0}>
            <button type="button" disabled={multiCount === 0} onClick={() => applyAlign('canvas-h')}>
              水平
            </button>
            <button type="button" disabled={multiCount === 0} onClick={() => applyAlign('canvas-v')}>
              垂直
            </button>
            <button type="button" disabled={multiCount === 0} onClick={() => applyAlign('canvas-both')}>
              中心
            </button>
          </HoverMenu>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label">步驟</span>
          <button type="button" className="btn ghost" disabled={!canUndo} onClick={undo} title="Ctrl+Z">
            上一步
          </button>
          <button type="button" className="btn ghost" disabled={!canRedo} onClick={redo} title="Ctrl+Y">
            下一步
          </button>
        </div>

        {(settings.mode === 'desk' || settings.mode === 'badge-double') && (
        <div className="toolbar-group">
              <div className="toolbar-drop fold-drop">
                <button
                  type="button"
                  className={`fold-toggle ${settings.showFoldLine ? 'is-on' : ''}`}
                  onClick={() => patch({ showFoldLine: !settings.showFoldLine })}
                >
                  {settings.showFoldLine ? '摺線顯示' : '摺線隱藏'}
                </button>
                <div className="toolbar-drop-menu fold-style-menu">
                  <div className="fold-style-panel">
                    <div className="seg">
                      <button
                        type="button"
                        className={settings.foldStyle === 'dashed' ? 'is-active' : ''}
                        onClick={() => patch({ foldStyle: 'dashed' })}
                      >
                        虛線
                      </button>
                      <button
                        type="button"
                        className={settings.foldStyle === 'solid' ? 'is-active' : ''}
                        onClick={() => patch({ foldStyle: 'solid' })}
                      >
                        實線
                      </button>
                    </div>
                    <div className="seg">
                      <button
                        type="button"
                        className={settings.foldWeight === 'thin' ? 'is-active' : ''}
                        onClick={() => patch({ foldWeight: 'thin' })}
                      >
                        細
                      </button>
                      <button
                        type="button"
                        className={settings.foldWeight === 'regular' ? 'is-active' : ''}
                        onClick={() => patch({ foldWeight: 'regular' })}
                      >
                        中
                      </button>
                      <button
                        type="button"
                        className={settings.foldWeight === 'bold' ? 'is-active' : ''}
                        onClick={() => patch({ foldWeight: 'bold' })}
                      >
                        粗
                      </button>
                    </div>
                    <div className="seg">
                      <button
                        type="button"
                        className={settings.foldTone === 'light' ? 'is-active' : ''}
                        onClick={() => patch({ foldTone: 'light' })}
                      >
                        淡
                      </button>
                      <button
                        type="button"
                        className={settings.foldTone === 'medium' ? 'is-active' : ''}
                        onClick={() => patch({ foldTone: 'medium' })}
                      >
                        中
                      </button>
                      <button
                        type="button"
                        className={settings.foldTone === 'dark' ? 'is-active' : ''}
                        onClick={() => patch({ foldTone: 'dark' })}
                      >
                        濃
                      </button>
                    </div>
                  </div>
                </div>
              </div>
        </div>
        )}

        <div className="toolbar-group">
          <HoverMenu label="新增標籤" value="新增標籤">
            <button type="button" onClick={addStatic}>
              全員
            </button>
            <button type="button" disabled={!activeFields.length} onClick={addField}>
              欄位
            </button>
          </HoverMenu>
        </div>
        </div>
      </header>

      <div className={`editor-canvas no-print ${selected || multiCount > 1 ? 'has-footer' : ''}`}>
        <div
          className={`editor-stage${fitMode ? ' is-fit' : ''}${panning ? ' is-panning' : ''}`}
          ref={stageRef}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
        >
          {isBadge ? null : <StandPreview settings={settings} student={sample} />}
          <div
            className="paper-pan"
            style={
              fitMode
                ? {
                    width: fit.w || undefined,
                    height: fit.h || undefined,
                    transform: `translate(${pan.x}px, ${pan.y}px)`,
                  }
                : undefined
            }
          >
            <div
              ref={paperRef}
              className="paper-stage-inner has-guide"
              style={{
                width: `${guide.widthMm}mm`,
                height: `${guide.heightMm}mm`,
                transform: fitMode ? `scale(${fit.scale})` : undefined,
                transformOrigin: fitMode ? 'top left' : undefined,
              }}
              onPointerDown={(e) => {
                const el = e.target as HTMLElement
                if (el.closest('.plate-item, .item-mini-bar')) return
                setFreshId(null)
                setSelectedIds([])
              }}
            >
                <div className="paper-guide" aria-hidden>
                  <span className="paper-guide-label">
                    {isBadge ? BADGE_PRESETS[badgeSize].label : paperSize}{' '}
                    {settings.orientation === 'portrait' ? '直向' : '橫向'} · {guide.widthMm}×
                    {guide.heightMm} mm
                  </span>
                </div>
              <div className={`paper-card-slot${settings.mode === 'desk' ? ' is-fill' : ''}`}>
                <PlateCard settings={settings} student={sample} showGuides editor={editor} />
              </div>
            </div>
          </div>
          </div>
        <div className={`canvas-corner-actions no-print ${selected || multiCount > 1 ? 'has-footer' : ''}`}>
          <button type="button" className="btn" onClick={onBack}>
            返回
            <br />
            選擇
          </button>
          <button type="button" className="btn primary" onClick={() => setShowPages(true)}>
            列印
            <br />
            預覽
          </button>
        </div>
      </div>

      {(selected || multiCount > 1) && (
      <div className="editor-subbar is-footer no-print">
          {multiCount > 1 ? (
            <>
              <div className="subbar-select-copy">
                <strong>已選 {multiCount} 個物件</strong>
                <span className="muted">Shift／Ctrl 點選可加選；群組後會一起移動</span>
              </div>
            </>
          ) : selected ? (
            <>
              <strong>
                {selected.kind === 'static'
                  ? '全員標籤'
                  : selected.kind === 'image'
                    ? '圖片'
                    : '學生欄位'}
                {selected.groupId ? ' · 群組中' : ''}
              </strong>

              {selected.kind === 'static' ? (
                <label className="toolbar-field wide">
                  文字
                  <input
                    type="text"
                    value={selected.text}
                    onChange={(e) => updateItem(selected.id, { text: e.target.value })}
                  />
                </label>
              ) : selected.kind === 'image' ? (
                <span className="muted">拖曳位置；字級欄可調圖片高度</span>
              ) : (
                <label className="toolbar-field wide">
                  欄位
                  <select
                    value={selected.fieldHeader ?? ''}
                    onChange={(e) => {
                      const header = e.target.value
                      const map = mappings.find((m) => m.header === header)
                      updateItem(selected.id, {
                        fieldHeader: header,
                        text: map?.header ?? header,
                      })
                    }}
                  >
                    {activeFields.map((m) => (
                      <option key={m.header} value={m.header}>
                        {m.header === SEQUENCE_HEADER ? m.label : m.header}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="toolbar-field">
                X
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selected.x}
                  onChange={(e) => updateItem(selected.id, { x: Number(e.target.value) })}
                />
              </label>
              <label className="toolbar-field">
                Y
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={selected.y}
                  onChange={(e) => updateItem(selected.id, { y: Number(e.target.value) })}
                />
              </label>
              <label className="toolbar-field">
                {selected.kind === 'image' ? '高度' : '字級'}
                <input
                  type="number"
                  min={2}
                  max={40}
                  step={0.5}
                  value={selected.fontSizeMm}
                  onChange={(e) => updateItem(selected.id, { fontSizeMm: Number(e.target.value) })}
                />
              </label>
              {selected.kind !== 'image' && (
              <>
              <label className="toolbar-field">
                粗細
                <select
                  value={clampFontWeight(selected.fontFamily, selected.fontWeight)}
                  onChange={(e) =>
                    updateItem(selected.id, {
                      fontWeight: Number(e.target.value),
                    })
                  }
                >
                  {fontChoice(selected.fontFamily).weights.map((w) => (
                    <option key={w} value={w}>
                      {FONT_WEIGHT_LABELS[w]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolbar-field">
                字型
                <select
                  value={selected.fontFamily || 'Noto Sans TC'}
                  onChange={(e) => {
                    const fontFamily = e.target.value
                    updateItem(selected.id, {
                      fontFamily,
                      fontWeight: clampFontWeight(fontFamily, selected.fontWeight),
                    })
                  }}
                >
                  {FONT_CHOICES.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="toolbar-field">
                顏色
                <input
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(selected.color) ? selected.color : '#1a3a32'}
                  onChange={(e) => updateItem(selected.id, { color: e.target.value })}
                />
              </label>
              </>
              )}

              <button type="button" className="btn text" onClick={removeSelected}>
                刪除標籤
              </button>
            </>
          ) : null}
        </div>
      )}

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
    </div>
  )
}
