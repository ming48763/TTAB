import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { collectGroupIds, DESK_FOLD_PCTS, resolveClickSelection, totalCardHeightMm, totalCardWidthMm, type AlignAction } from '../lib/paper'
import type { LayoutItem, LayoutSettings, StudentRow } from '../types'
import { FONT_CHOICES, FONT_WEIGHT_LABELS, clampFontWeight, fontChoice } from '../types'
import MiniColorPicker from './MiniColorPicker'

function PlateDecor({ settings }: { settings: LayoutSettings }) {
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
              zIndex: fresh ? 90 : selected ? 80 : index + 1,
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
              <img
                src={item.imageSrc}
                alt=""
                draggable={false}
                style={{ height: `${item.fontSizeMm}mm`, width: 'auto', display: 'block' }}
              />
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
            {interactive && !fresh && selectedIds.length >= 2 && selectedIds[selectedIds.length - 1] === item.id && (
              <div
                className="item-mini-bar"
                style={{ fontSize: 14, lineHeight: 1.2, fontWeight: 500 }}
                onPointerDown={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
              >
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
              </div>
            )}
            {selected && selectedIds.length === 1 && interactive && !fresh && (
              <>
                <div
                  className="item-mini-bar"
                  style={{ fontSize: 14, lineHeight: 1.2, fontWeight: 500 }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="item-mini-btn is-danger"
                    title="刪除"
                    onClick={() => onDeleteItem?.(item.id)}
                  >
                    刪除
                  </button>
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
                </div>
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
              </>
            )}
          </div>
        )
      })}
    </div>
  )
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
