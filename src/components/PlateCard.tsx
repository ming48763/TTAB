import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { collectGroupIds, DESK_FOLD_PCTS, resolveClickSelection, totalCardHeightMm, totalCardWidthMm, type AlignAction } from '../lib/paper'
import type { LayoutItem, LayoutSettings, StudentRow } from '../types'
import { fixedBadgeLook } from '../lib/badgeLook'
import { DEFAULT_BADGE_LOOK, FONT_CHOICES, FONT_WEIGHT_LABELS, clampFontWeight, fontChoice } from '../types'
import { removeImageBackground } from '../lib/imageCutout'
import { BadgeLookMark } from './BadgeLookMark'
import { ImageFrameDialog } from './ImageFrameDialog'
import MiniColorPicker from './MiniColorPicker'

function ItemMiniBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ y: 'above' | 'below'; x: number }>({ y: 'above', x: 0 })

  useLayoutEffect(() => {
    const bar = ref.current
    if (!bar) return
    const update = () => {
      const stage = bar.closest('.editor-stage')
      const item = bar.parentElement
      if (!stage || !item) return
      const stageBox = stage.getBoundingClientRect()
      const itemBox = item.getBoundingClientRect()
      const barBox = bar.getBoundingClientRect()
      const gap = 10
      const aboveTop = itemBox.top - gap - barBox.height
      const belowBottom = itemBox.bottom + gap + barBox.height
      let y: 'above' | 'below' = 'above'
      if (aboveTop < stageBox.top && belowBottom <= stageBox.bottom) y = 'below'
      else if (aboveTop < stageBox.top && belowBottom > stageBox.bottom) {
        y = stageBox.bottom - itemBox.bottom > itemBox.top - stageBox.top ? 'below' : 'above'
      }
      const scale = itemBox.width / Math.max(item.offsetWidth, 1)
      const defaultLeft = itemBox.right - barBox.width
      let left = defaultLeft
      if (barBox.width <= stageBox.width) {
        if (left + barBox.width > stageBox.right) left = stageBox.right - barBox.width
        if (left < stageBox.left) left = stageBox.left
      }
      const x = (left - defaultLeft) / scale
      const shown = bar.getBoundingClientRect()
      const roomAbove = shown.top - stageBox.top
      const roomBelow = stageBox.bottom - shown.bottom
      bar.querySelectorAll<HTMLElement>(':scope > .toolbar-drop').forEach((drop) => {
        drop.classList.toggle('opens-down', roomAbove < 240 && roomBelow > roomAbove)
      })
      bar.querySelectorAll<HTMLElement>('.opens-right').forEach((drop) => {
        const box = drop.getBoundingClientRect()
        drop.classList.toggle('opens-left', box.right + 280 > stageBox.right && box.left - 280 >= stageBox.left)
      })
      setPlace((prev) => (prev.y === y && Math.abs(prev.x - x) < 0.5 ? prev : { y, x }))
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('pointermove', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('pointermove', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [])

  return (
    <div
      ref={ref}
      className={`item-mini-bar${place.y === 'below' ? ' is-below' : ''}`}
      style={{
        fontSize: 14,
        lineHeight: 1.2,
        fontWeight: 500,
        transform: place.y === 'below' ? `translate(${place.x}px, 10px)` : `translate(${place.x}px, calc(-100% - 10px))`,
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

function PlateDecor({ settings }: { settings: LayoutSettings }) {
  if (settings.mode === 'badge-single') {
    const look = fixedBadgeLook(settings.badgeLook ?? DEFAULT_BADGE_LOOK)
    if (look.style === 'none') return null
    return <BadgeLookMark look={look} className="plate-decor badge-look" />
  }
  const decor = settings.cardDecor ?? {
    kind: 'none' as const,
    color: '#0f6e56',
    lineStyle: 'dashed' as const,
  }
  if (decor.kind === 'none') return null
  return (
    <div
      className={`plate-decor kind-${decor.kind} line-${decor.lineStyle}`}
      style={{ ['--decor' as string]: decor.color }}
      aria-hidden
    />
  )
}

function resolveText(
  item: LayoutSettings['items'][number],
  student: StudentRow | null,
): string {
  if (item.kind === 'image') return ''
  if (item.kind === 'static') return item.text
  if (!student || !item.fieldHeader) return item.text || '—'
  return student.values[item.fieldHeader] || '—'
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

type DragMode =
  | {
      type: 'move'
      itemIds: string[]
      startX: number
      startY: number
      origins: Record<string, { x: number; y: number }>
    }
  | { type: 'font'; itemId: string; startY: number; origSize: number }

export interface PlateEditorHandlers {
  selectedIds: string[]
  freshId?: string | null
  onSelect: (id: string | null, opts?: { additive?: boolean }) => void
  onChangeSettings: (settings: LayoutSettings) => void
  onItemsMoved?: (ids: string[]) => void
  onUpdateItem?: (id: string, partial: Partial<LayoutItem>) => void
  onDeleteItem?: (id: string) => void
  canGroup?: boolean
  canUngroup?: boolean
  onGroup?: () => void
  onUngroup?: () => void
  onAlign?: (action: AlignAction) => void
  onClearSelection?: () => void
}

interface FaceProps {
  settings: LayoutSettings
  student: StudentRow | null
  flipped?: boolean
  className?: string
  interactive?: boolean
  selectedIds?: string[]
  freshId?: string | null
  faceRef?: RefObject<HTMLDivElement | null>
  onSelect?: (id: string | null, opts?: { additive?: boolean }) => void
  onPointerDownItem?: (e: ReactPointerEvent, itemId: string, mode: 'move' | 'font') => void
  onUpdateItem?: (id: string, partial: Partial<LayoutItem>) => void
  onDeleteItem?: (id: string) => void
  canGroup?: boolean
  canUngroup?: boolean
  onGroup?: () => void
  onUngroup?: () => void
  onAlign?: (action: AlignAction) => void
  onClearSelection?: () => void
  highlightIds?: string[]
  hotGhost?: { x: number; y: number } | null
}

export function PlateFace({
  settings,
  student,
  flipped = false,
  className = '',
  interactive = false,
  selectedIds = [],
  freshId = null,
  faceRef,
  onSelect,
  onPointerDownItem,
  onUpdateItem,
  onDeleteItem,
  canGroup = false,
  canUngroup = false,
  onGroup,
  onUngroup,
  onAlign,
  onClearSelection,
  highlightIds = [],
  hotGhost = null,
}: FaceProps) {
  const selectedSet = new Set(selectedIds)
  const highlightSet = new Set(highlightIds)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [frameItemId, setFrameItemId] = useState<string | null>(null)
  const [alignFlash, setAlignFlash] = useState<{ id: string; side: 'left' | 'center' | 'right'; tick: number } | null>(null)
  const alignFlashTimer = useRef<number | null>(null)

  function flashTextAlign(item: LayoutItem, align: 'left' | 'center' | 'right') {
    if (align !== item.align) {
      const face = faceRef?.current
      const el = face
        ? [...face.querySelectorAll<HTMLElement>('[data-item-id]')].find((node) => node.dataset.itemId === item.id)
        : undefined
      let x = item.x
      if (el && face) {
        const faceBox = face.getBoundingClientRect()
        const box = el.getBoundingClientRect()
        const width = faceBox.width || 1
        const left = ((box.left - faceBox.left) / width) * 100
        const right = ((box.right - faceBox.left) / width) * 100
        x = align === 'left' ? left : align === 'right' ? right : (left + right) / 2
      }
      onUpdateItem?.(item.id, { align, x })
    }
    if (alignFlashTimer.current) window.clearTimeout(alignFlashTimer.current)
    setAlignFlash({ id: item.id, side: align, tick: Date.now() })
    alignFlashTimer.current = window.setTimeout(() => setAlignFlash(null), 720)
  }
  const frameItem = frameItemId ? settings.items.find((it) => it.id === frameItemId && it.kind === 'image') : null
  const selectedItems = settings.items.filter((it) => selectedSet.has(it.id))
  const groupKeys = new Set(selectedItems.map((it) => it.groupId).filter(Boolean))
  const alignAsCanvas =
    selectedItems.length >= 2 &&
    selectedItems.every((it) => it.groupId) &&
    groupKeys.size === 1

  return (
    <div
      ref={faceRef}
      className={`plate-face ${interactive ? 'is-interactive' : ''} ${freshId ? 'is-placing-fresh' : ''} ${className}`}
      data-face={flipped ? 'back' : 'front'}
      style={{
        width: `${settings.widthMm}mm`,
        height: `${settings.faceHeightMm}mm`,
        transform: flipped ? 'rotate(180deg)' : undefined,
      }}
      onPointerDown={
        interactive
          ? (e) => {
              if (e.target === e.currentTarget) onSelect?.(null)
            }
          : undefined
      }
    >
      <PlateDecor settings={settings} />
      {hotGhost ? (
        <div
          className="booth-hot-ghost"
          aria-hidden
          style={{ left: `${hotGhost.x}%`, top: `${hotGhost.y}%` }}
        />
      ) : null}
      {settings.items.map((item, index) => {
        if (item.hidden) return null
        const text = resolveText(item, student)
        const selected = interactive && selectedSet.has(item.id)
        const grouped = Boolean(item.groupId)
        const fresh = item.id === freshId
        const boothHot = highlightSet.has(item.id)
        const family = item.fontFamily || 'Noto Sans TC'
        const familyCss = FONT_CHOICES.find((f) => f.id === family)?.stack ?? family
        return (
          <div
            key={item.id}
            className={`plate-item ${item.kind === 'image' ? 'is-image' : ''} ${interactive ? 'is-draggable' : ''} ${selected ? 'is-selected' : ''} ${grouped ? 'is-grouped' : ''} ${fresh ? 'is-fresh' : ''} ${boothHot ? 'is-booth-hot' : ''}`}
            data-item-id={item.id}
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              fontSize: `${item.fontSizeMm}mm`,
              fontWeight: clampFontWeight(family, item.fontWeight),
              fontFamily: familyCss,
              color: item.color,
              textAlign: item.align,
              zIndex: fresh ? 90 : selected ? 40 : index + 1,
              transform:
                item.align === 'center'
                  ? 'translate(-50%, -50%)'
                  : item.align === 'right'
                    ? 'translate(-100%, -50%)'
                    : 'translate(0, -50%)',
            }}
            onPointerDown={
              interactive
                ? (e) => {
                    if ((e.target as HTMLElement).closest('.item-mini-bar, .item-edit')) return
                    if (e.detail > 1) return
                    e.stopPropagation()
                    onPointerDownItem?.(e, item.id, 'move')
                  }
                : undefined
            }
            onDoubleClick={
              interactive && item.kind === 'static' && !fresh
                ? (e) => {
                    e.stopPropagation()
                    setEditingId(item.id)
                  }
                : undefined
            }
          >
            {item.kind === 'image' && item.imageSrc ? (
              <PlateImage item={item} />
            ) : editingId === item.id && item.kind === 'static' ? (
              <input
                className="item-edit"
                autoFocus
                value={item.text}
                onChange={(e) => onUpdateItem?.(item.id, { text: e.target.value })}
                onBlur={() => setEditingId(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    e.currentTarget.blur()
                  }
                }}
                onPointerDown={(e) => e.stopPropagation()}
              />
            ) : (
              text
            )}
            {alignFlash?.id === item.id && item.kind !== 'image' ? (
              <span key={alignFlash.tick} className={`align-flash is-${alignFlash.side}`} aria-hidden="true" />
            ) : null}
            {interactive && !fresh && selectedIds.length >= 2 && selectedIds[selectedIds.length - 1] === item.id && (
              <ItemMiniBar>
                <div className="toolbar-drop">
                  <button type="button" className="item-mini-btn">
                    對齊
                  </button>
                  <div className="toolbar-drop-menu mini-align-menu">
                    {alignAsCanvas ? (
                      <div className="mini-align-panel is-canvas">
                        <div className="mini-align-col">
                          <div className="mini-align-head">全區</div>
                          <button type="button" onClick={() => onAlign?.('canvas-h')}>
                            水平
                          </button>
                          <button type="button" onClick={() => onAlign?.('canvas-v')}>
                            垂直
                          </button>
                          <button type="button" onClick={() => onAlign?.('canvas-both')}>
                            中心
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mini-align-panel">
                        <div className="mini-align-col">
                          <div className="mini-align-head">水平</div>
                          <button type="button" onClick={() => onAlign?.('left')}>
                            向左
                          </button>
                          <button type="button" onClick={() => onAlign?.('center-h')}>
                            向中
                          </button>
                          <button type="button" onClick={() => onAlign?.('right')}>
                            向右
                          </button>
                        </div>
                        <div className="mini-align-col">
                          <div className="mini-align-head">垂直</div>
                          <button type="button" onClick={() => onAlign?.('top')}>
                            向上
                          </button>
                          <button type="button" onClick={() => onAlign?.('center-v')}>
                            向中
                          </button>
                          <button type="button" onClick={() => onAlign?.('bottom')}>
                            向下
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <button type="button" className="item-mini-btn" disabled={!canGroup} onClick={onGroup}>
                  群組
                </button>
                <button type="button" className="item-mini-btn" disabled={!canUngroup} onClick={onUngroup}>
                  解除
                </button>
                <button type="button" className="item-mini-btn is-danger" onClick={onClearSelection}>
                  取消選取
                </button>
              </ItemMiniBar>
            )}
            {selected && selectedIds.length === 1 && interactive && !fresh && (
              <>
                <ItemMiniBar>
                  <button
                    type="button"
                    className="item-mini-btn is-danger"
                    title="刪除"
                    onClick={() => onDeleteItem?.(item.id)}
                  >
                    刪除
                  </button>
                  {item.kind === 'image' && (
                    <>
                      <button
                        type="button"
                        className={`item-mini-btn ${item.imageCutout ? 'is-on' : ''}`}
                        onClick={() => void toggleImageCutout(item, onUpdateItem)}
                      >
                        去背
                      </button>
                      <button
                        type="button"
                        className="item-mini-btn"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation()
                          const id = item.id
                          window.setTimeout(() => setFrameItemId(id), 0)
                        }}
                      >
                        外框
                      </button>
                    </>
                  )}
                  {item.kind !== 'image' && (
                    <>
                      <div className="toolbar-drop">
                        <button type="button" className="item-mini-btn" title="顏色">
                          <span
                            className="item-mini-swatch"
                            style={{
                              background: /^#[0-9a-fA-F]{6}$/.test(item.color)
                                ? item.color
                                : '#1a3a32',
                            }}
                          />
                          顏色
                        </button>
                        <div className="toolbar-drop-menu">
                          {['#0f241f', '#1a3a32', '#4a635c', '#0f6e56', '#9b2c2c'].map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              className={item.color === hex ? 'is-active' : ''}
                              onClick={() => onUpdateItem?.(item.id, { color: hex })}
                            >
                              <span className="item-mini-swatch" style={{ background: hex }} />
                              {hex}
                            </button>
                          ))}
                          <div className="toolbar-drop opens-right item-custom-drop">
                            <button type="button">自訂</button>
                            <div className="toolbar-drop-menu item-custom-panel">
                              <MiniColorPicker
                                value={item.color}
                                onChange={(color) => onUpdateItem?.(item.id, { color })}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="toolbar-drop">
                        <button type="button" className="item-mini-btn" title="粗細">
                          {FONT_WEIGHT_LABELS[clampFontWeight(family, item.fontWeight)] ?? '粗細'}
                        </button>
                        <div className="toolbar-drop-menu">
                          {fontChoice(family).weights.map((w) => (
                            <button
                              key={w}
                              type="button"
                              className={clampFontWeight(family, item.fontWeight) === w ? 'is-active' : ''}
                              onClick={() => onUpdateItem?.(item.id, { fontWeight: w })}
                            >
                              {FONT_WEIGHT_LABELS[w]}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="toolbar-drop">
                        <button type="button" className="item-mini-btn" title="字型">
                          {FONT_CHOICES.find((f) => f.id === family)?.label ?? '字型'}
                        </button>
                        <div className="toolbar-drop-menu">
                          {FONT_CHOICES.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              className={family === f.id ? 'is-active' : ''}
                              onClick={() =>
                                onUpdateItem?.(item.id, {
                                  fontFamily: f.id,
                                  fontWeight: clampFontWeight(f.id, item.fontWeight),
                                })
                              }
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="toolbar-drop">
                        <button type="button" className="item-mini-btn" title="對齊">
                          {item.align === 'left' ? '靠左' : item.align === 'right' ? '靠右' : '置中'}
                        </button>
                        <div className="toolbar-drop-menu">
                          <button
                            type="button"
                            className={item.align === 'left' ? 'is-active' : ''}
                            onClick={() => flashTextAlign(item, 'left')}
                          >
                            靠左
                          </button>
                          <button
                            type="button"
                            className={item.align === 'center' ? 'is-active' : ''}
                            onClick={() => flashTextAlign(item, 'center')}
                          >
                            置中
                          </button>
                          <button
                            type="button"
                            className={item.align === 'right' ? 'is-active' : ''}
                            onClick={() => flashTextAlign(item, 'right')}
                          >
                            靠右
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="toolbar-drop">
                    <button type="button" className="item-mini-btn" title="全區">
                      全區
                    </button>
                    <div className="toolbar-drop-menu">
                      <button type="button" onClick={() => onAlign?.('canvas-h')}>
                        水平
                      </button>
                      <button type="button" onClick={() => onAlign?.('canvas-v')}>
                        垂直
                      </button>
                      <button type="button" onClick={() => onAlign?.('canvas-both')}>
                        中心
                      </button>
                    </div>
                  </div>
                </ItemMiniBar>
                <button
                  type="button"
                  className="font-handle"
                  aria-label="拖曳調整字級"
                  title="上下拖曳調整字級"
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    onPointerDownItem?.(e, item.id, 'font')
                  }}
                />
                {item.kind === 'image' && (
                  <button
                    type="button"
                    className="image-rotate-handle"
                    aria-label="旋轉"
                    title="旋轉"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onUpdateItem?.(item.id, { imageRotation: ((item.imageRotation ?? 0) + 90) % 360 })
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden>
                      <path d="M12 5.2a6.8 6.8 0 1 1-6.1 3.8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                      <path d="M12 2.2 15.4 6 12 8.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </div>
        )
      })}
      {frameItem?.imageSrc
        ? createPortal(
            <ImageFrameDialog
              item={frameItem}
              onCancel={() => setFrameItemId(null)}
              onConfirm={(patch) => {
                onUpdateItem?.(frameItem.id, patch)
                setFrameItemId(null)
              }}
            />,
            document.body,
          )
        : null}
    </div>
  )
}

function PlateImage({ item }: { item: LayoutItem }) {
  const src = item.imageCutout && item.imageCutoutSrc ? item.imageCutoutSrc : item.imageSrc
  const rotation = item.imageRotation ?? 0
  if (item.imageFrame) {
    return (
      <div className={`plate-image-frame is-${item.imageFrame}`} style={{ width: `${item.fontSizeMm}mm`, height: `${item.fontSizeMm}mm`, transform: `rotate(${rotation}deg)` }}>
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${item.imageFocusX ?? 50}% ${item.imageFocusY ?? 50}%`,
          }}
        />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      style={{ height: `${item.fontSizeMm}mm`, width: 'auto', display: 'block', transform: `rotate(${rotation}deg)` }}
    />
  )
}

async function toggleImageCutout(
  item: LayoutItem,
  onUpdateItem?: (id: string, partial: Partial<LayoutItem>) => void,
) {
  if (!onUpdateItem || !item.imageSrc) return
  if (item.imageCutout) {
    onUpdateItem(item.id, { imageCutout: false })
    return
  }
  if (item.imageCutoutSrc) {
    onUpdateItem(item.id, { imageCutout: true })
    return
  }
  const imageCutoutSrc = await removeImageBackground(item.imageSrc)
  onUpdateItem(item.id, { imageCutout: true, imageCutoutSrc })
}

function FoldGuides({
  settings,
  isDesk,
  vertical = false,
}: {
  settings: LayoutSettings
  isDesk: boolean
  vertical?: boolean
}) {
  if (!settings.showFoldLine) return null
  const cls = `fold-line fold-${settings.foldStyle} fold-${settings.foldWeight} fold-${settings.foldTone}`
  if (vertical) {
    return <div className={`${cls} is-vertical`} aria-hidden />
  }
  const tops = isDesk ? [...DESK_FOLD_PCTS] : [50]
  return (
    <>
      {tops.map((top) => (
        <div key={top} className={cls} style={{ top: `${top}%` }} aria-hidden />
      ))}
    </>
  )
}

interface CardProps {
  settings: LayoutSettings
  student: StudentRow | null
  showGuides?: boolean
  editor?: PlateEditorHandlers
  highlightIds?: string[]
  hotGhost?: { x: number; y: number } | null
}

export function PlateCard({ settings, student, showGuides = false, editor, highlightIds, hotGhost }: CardProps) {
  const isDesk = settings.mode === 'desk'
  const isDouble = settings.mode === 'badge-double'
  const totalHeightMm = totalCardHeightMm(settings.mode, settings.faceHeightMm)
  const totalWidthMm = totalCardWidthMm(settings.mode, settings.widthMm)
  const cardRef = useRef<HTMLDivElement>(null)
  const faceRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode | null>(null)
  const settingsRef = useRef(settings)
  const selectedRef = useRef<string[]>(editor?.selectedIds ?? [])
  const [dragging, setDragging] = useState(false)

  settingsRef.current = settings
  selectedRef.current = editor?.selectedIds ?? []

  const interactive = Boolean(editor)

  useEffect(() => {
    if (!editor) return

    function onMove(e: PointerEvent) {
      const drag = dragRef.current
      const current = settingsRef.current
      if (!drag || !editor) return

      if (drag.type === 'move') {
        const face = faceRef.current
        if (!face) return
        const rect = face.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const dx = ((e.clientX - drag.startX) / rect.width) * 100
        const dy = ((e.clientY - drag.startY) / rect.height) * 100
        const idSet = new Set(drag.itemIds)
        if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
          editor.onItemsMoved?.(drag.itemIds)
        }
        editor.onChangeSettings({
          ...current,
          items: current.items.map((it) => {
            if (!idSet.has(it.id)) return it
            const origin = drag.origins[it.id]
            if (!origin) return it
            return {
              ...it,
              x: round1(clamp(origin.x + dx, 2, 98)),
              y: round1(clamp(origin.y + dy, 2, 98)),
            }
          }),
        })
        return
      }

      if (drag.type === 'font') {
        const dy = e.clientY - drag.startY
        const next = round1(clamp(drag.origSize + dy * 0.08, 2, 40))
        editor.onChangeSettings({
          ...current,
          items: current.items.map((it) =>
            it.id === drag.itemId ? { ...it, fontSizeMm: next } : it,
          ),
        })
        return
      }
    }

    function onUp() {
      dragRef.current = null
      setDragging(false)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [editor])

  function startItemDrag(e: ReactPointerEvent, itemId: string, mode: 'move' | 'font') {
    if (!editor) return
    e.preventDefault()
    const item = settings.items.find((it) => it.id === itemId)
    if (!item) return

    const additive = e.shiftKey || e.metaKey || e.ctrlKey
    const nextSelected = resolveClickSelection(
      settings.items,
      selectedRef.current,
      itemId,
      additive,
    )
    editor.onSelect(itemId, { additive })

    setDragging(true)
    if (mode === 'move') {
      const origins: Record<string, { x: number; y: number }> = {}
      for (const id of nextSelected) {
        const it = settings.items.find((x) => x.id === id)
        if (it) origins[id] = { x: it.x, y: it.y }
      }
      dragRef.current = {
        type: 'move',
        itemIds: nextSelected.length ? nextSelected : collectGroupIds(settings.items, [itemId]),
        startX: e.clientX,
        startY: e.clientY,
        origins:
          Object.keys(origins).length > 0
            ? origins
            : { [itemId]: { x: item.x, y: item.y } },
      }
    } else {
      dragRef.current = {
        type: 'font',
        itemId,
        startY: e.clientY,
        origSize: item.fontSizeMm,
      }
    }
  }

  const primaryFace = (
    <PlateFace
      settings={settings}
      student={student}
      interactive={interactive}
      selectedIds={editor?.selectedIds ?? []}
      freshId={editor?.freshId ?? null}
      faceRef={faceRef}
      onSelect={editor?.onSelect}
      onPointerDownItem={startItemDrag}
      onUpdateItem={editor?.onUpdateItem}
      onDeleteItem={editor?.onDeleteItem}
      canGroup={editor?.canGroup}
      canUngroup={editor?.canUngroup}
      onGroup={editor?.onGroup}
      onUngroup={editor?.onUngroup}
      onAlign={editor?.onAlign}
      onClearSelection={editor?.onClearSelection}
      highlightIds={highlightIds}
      hotGhost={hotGhost}
    />
  )

  return (
    <div
      ref={cardRef}
      className={`plate-card mode-${settings.mode} ${interactive ? 'is-editable' : ''} ${dragging ? 'is-dragging' : ''} ${editor?.freshId ? 'is-placing-fresh' : ''}`}
      style={{ width: `${totalWidthMm}mm`, height: `${totalHeightMm}mm` }}
    >
      {isDesk ? (
        <>
          <div className="desk-flap" style={{ height: `${settings.faceHeightMm / 2}mm` }} />
          <PlateFace settings={settings} student={student} flipped highlightIds={highlightIds} hotGhost={hotGhost} />
          {primaryFace}
          <div className="desk-flap" style={{ height: `${settings.faceHeightMm / 2}mm` }} />
          {showGuides && <FoldGuides settings={settings} isDesk />}
        </>
      ) : isDouble ? (
        <>
          {primaryFace}
          <PlateFace settings={settings} student={student} className="badge-back" highlightIds={highlightIds} hotGhost={hotGhost} />
          {showGuides && <FoldGuides settings={settings} isDesk={false} vertical />}
        </>
      ) : (
        primaryFace
      )}
      {interactive && (
        <div className="size-badge" aria-hidden>
          {Math.round(totalWidthMm)} × {Math.round(totalHeightMm)} mm
        </div>
      )}
    </div>
  )
}
