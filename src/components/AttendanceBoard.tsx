import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { AttendanceCard, AttendanceCardKind, PeriodLevel } from '../lib/attendance'
import { seatsBetween, speakChain, findSeatPeriodConflicts, toolCards, PERIOD_LABELS } from '../lib/attendance'

const KIND_TITLE: Record<Exclude<AttendanceCardKind, 'tool'>, string> = {
  seat: '座號',
  reason: '假由',
  period: '節次',
}

export interface ChainBlock extends AttendanceCard {
  runId: string
}

export interface PackedCard {
  id: string
  text: string
  blocks: AttendanceCard[]
  dateMode: 'fixed' | 'today' | 'standing'
  date: string
  weekday: number
}

interface Props {
  seats: AttendanceCard[]
  reasons: AttendanceCard[]
  periods: AttendanceCard[]
  periodLevel: PeriodLevel
  chains: ChainBlock[][]
  packs: PackedCard[]
  onInsert: (row: number, afterIndex: number, card: AttendanceCard, runId?: string) => void
  onAppendRow: (row: number, card: AttendanceCard, runId?: string) => void
  onNewRow: (card: AttendanceCard) => void
  onMoveChain: (fromRunId: string, toRow: number) => void
  onRemove: (runId: string) => void
  onRemoveChain: (fromRunId: string) => void
  onAddSeats: (runId: string, cards: AttendanceCard[]) => void
  onCommitCards: (cards: AttendanceCard[]) => void
  onSave: () => void
  onPackChain: (fromRunId: string) => void
  onUnpack: (id: string) => void
  onDeletePack: (id: string) => void
  onClearPacks: () => void
}

function packParts(text: string) {
  const i = text.indexOf(' ')
  if (i < 0) return { reason: text, rest: '' }
  return { reason: text.slice(0, i), rest: text.slice(i) }
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function readDrag(e: DragEvent) {
  const text = e.dataTransfer.getData('text/plain') || ''
  if (text.startsWith('brick:')) return { kind: 'brick' as const, id: text.slice(6) }
  if (text.startsWith('chain:')) return { kind: 'chain' as const, id: text.slice(6) }
  if (text.startsWith('pack:')) return { kind: 'pack' as const, id: text.slice(5) }
  if (text.startsWith('card:')) {
    return { kind: 'card' as const, card: parseJson<AttendanceCard>(text.slice(5)) }
  }
  return null
}

const LATE_LABELS = new Set(['遲到', '早退', '曠課'])
const SPAN_PERIODS = new Set<string>(PERIOD_LABELS.slice(-3))

function CardFace({
  card,
  onKind,
  picked,
  muted,
  confirm,
  label,
  draggable = true,
  onPick,
}: {
  card: AttendanceCard
  onKind: (kind: AttendanceCardKind | null) => void
  picked?: boolean
  muted?: boolean
  confirm?: boolean
  label?: string
  draggable?: boolean
  onPick?: (card: AttendanceCard) => void
}) {
  return (
    <button
      type="button"
      className={`att-card is-${card.kind}${picked ? ' is-picked' : ''}${card.label === '到' ? ' is-to' : ''}${muted ? ' is-muted' : ''}${confirm ? ' is-confirm' : ''}`}
      draggable={draggable && !muted}
      disabled={muted}
      onClick={() => {
        if (!muted) onPick?.(card)
      }}
      onDragStart={(e) => {
        if (!draggable || muted) {
          e.preventDefault()
          return
        }
        onKind(card.kind)
        e.dataTransfer.setData('text/plain', `card:${JSON.stringify(card)}`)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onDragEnd={() => onKind(null)}
    >
      <strong>{label ?? card.label}</strong>
    </button>
  )
}

function CardRack({
  kind,
  cards,
  onKind,
  extra,
  pickedIds,
  muted,
  shown,
  lockedLabels,
  onPick,
  footer,
}: {
  kind: Exclude<AttendanceCardKind, 'tool'>
  cards: AttendanceCard[]
  onKind: (kind: AttendanceCardKind | null) => void
  extra?: ReactNode
  pickedIds?: Set<string>
  muted?: boolean
  shown?: boolean
  lockedLabels?: Set<string>
  onPick?: (card: AttendanceCard) => void
  footer?: ReactNode
}) {
  const groups =
    kind === 'reason'
      ? [cards.filter((c) => !LATE_LABELS.has(c.label)), cards.filter((c) => LATE_LABELS.has(c.label))]
      : kind === 'period'
        ? [cards.filter((c) => !SPAN_PERIODS.has(c.label)), cards.filter((c) => SPAN_PERIODS.has(c.label))]
        : [cards]
  return (
    <section className={`att-rack is-${kind}${shown ? ' is-shown' : ''}`} aria-label={KIND_TITLE[kind]}>
      <header className="att-rack-head">
        <span className="att-swatch" aria-hidden />
        <h2>{KIND_TITLE[kind]}</h2>
        {extra}
      </header>
      <div className="att-card-groups">
        {groups.map((group, i) =>
          group.length === 0 ? null : (
            <div key={i} className={`att-card-grid is-${kind}`}>
              {group.map((card) => (
                <CardFace
                  key={card.id}
                  card={card}
                  onKind={onKind}
                  picked={pickedIds?.has(card.id)}
                  muted={muted || lockedLabels?.has(card.label)}
                  draggable={card.label !== '到' && !lockedLabels?.has(card.label)}
                  onPick={onPick}
                />
              ))}
            </div>
          ),
        )}
      </div>
      {footer}
    </section>
  )
}

export function AttendanceBoard({
  seats,
  reasons,
  periods,
  periodLevel,
  chains,
  packs,
  onInsert,
  onAppendRow,
  onNewRow,
  onMoveChain,
  onRemove,
  onRemoveChain,
  onAddSeats,
  onCommitCards,
  onSave,
  onPackChain,
  onUnpack,
  onDeletePack,
  onClearPacks,
}: Props) {
  const canPlay = chains.some((row) => speakChain(row, periodLevel))
  const dragKind = useRef<AttendanceCardKind | 'pack' | 'chain' | null>(null)
  const [dropZone, setDropZone] = useState<'pull' | 'palette' | 'pack' | null>(null)
  const [insert, setInsert] = useState<{ row: number; after: number } | null>(null)
  const [chainDrop, setChainDrop] = useState<number | null>(null)
  const [picked, setPicked] = useState<AttendanceCard[]>([])
  const [pickMode, setPickMode] = useState<'multi' | 'range' | 'to' | null>(null)
  const [rackTab, setRackTab] = useState<'seat' | 'reason' | 'period'>('seat')
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [awaitTool, setAwaitTool] = useState<string | null>(null)
  const tools = useMemo(() => toolCards(), [])
  const clashes = useMemo(() => findSeatPeriodConflicts(packs, periodLevel), [packs, periodLevel])
  const clashSeats = useMemo(() => new Set(clashes.flatMap((c) => c.seats)), [clashes])

  useEffect(() => {
    if (!awaitTool) return
    let found: ChainBlock | undefined
    for (let i = chains.length - 1; i >= 0; i--) {
      found = [...chains[i]].reverse().find((b) => b.kind === 'tool' && b.label === awaitTool)
      if (found) break
    }
    if (!found) return
    setActiveTool(found.runId)
    setPicked([])
    setAwaitTool(null)
  }, [chains, awaitTool])

  function findToolBlock(runId: string | null) {
    if (!runId) return null
    return chains.flat().find((b) => b.runId === runId && b.kind === 'tool') ?? null
  }

  function lastTool() {
    for (let i = chains.length - 1; i >= 0; i--) {
      const found = [...chains[i]].reverse().find((b) => b.kind === 'tool')
      if (found) return found
    }
    return null
  }

  function clearPick() {
    setPickMode(null)
    setPicked([])
  }

  function commitPicked(cards: AttendanceCard[]) {
    if (cards.length > 0) onCommitCards(cards)
    clearPick()
  }

  function startMode(mode: 'multi' | 'range' | 'to') {
    if (pickMode === mode) {
      if (mode === 'multi') commitPicked(picked)
      else clearPick()
      return
    }
    setPickMode(mode)
    setPicked([])
    setRackTab(mode === 'to' ? 'period' : 'seat')
  }

  function pickSeat(card: AttendanceCard) {
    if (card.kind !== 'seat') return
    if (pickMode === 'multi') {
      setPicked((cur) => (cur.some((c) => c.id === card.id) ? cur.filter((c) => c.id !== card.id) : [...cur, card]))
      return
    }
    if (pickMode === 'range') {
      if (picked.some((c) => c.id === card.id)) {
        setPicked((cur) => cur.filter((c) => c.id !== card.id))
        return
      }
      const next = [...picked, card]
      if (next.length < 2) {
        setPicked(next)
        return
      }
      commitPicked(seatsBetween(next[0], next[1], seats))
      return
    }
    const tool = findToolBlock(activeTool) ?? lastTool()
    if (!tool) return
    if (tool.runId !== activeTool) setActiveTool(tool.runId)
    if (tool.label === '範圍') {
      if (picked.length === 0) {
        setPicked([card])
        return
      }
      onAddSeats(tool.runId, seatsBetween(picked[0], card, seats))
      setPicked([])
      setActiveTool(null)
      return
    }
    setPicked((cur) => (cur.some((c) => c.id === card.id) ? cur.filter((c) => c.id !== card.id) : [...cur, card]))
  }

  function pickPeriod(card: AttendanceCard) {
    if (pickMode !== 'to' || card.kind !== 'period' || card.label === '到' || SPAN_PERIODS.has(card.label)) return
    if (picked.some((c) => c.id === card.id)) {
      setPicked((cur) => cur.filter((c) => c.id !== card.id))
      return
    }
    const next = [...picked, card]
    if (next.length < 2) {
      setPicked(next)
      return
    }
    const bridge = periods.find((p) => p.label === '到') ?? { id: 'period-到', kind: 'period' as const, label: '到' }
    commitPicked([next[0], bridge, next[1]])
  }

  function pickCard(card: AttendanceCard) {
    if (card.kind === 'seat') pickSeat(card)
    if (card.kind === 'period') {
      if (card.label === '到') startMode('to')
      else pickPeriod(card)
    }
  }

  function clickToolBrick(block: ChainBlock) {
    setActiveTool(block.runId)
    if (block.label === '多選' && picked.length > 0) {
      onAddSeats(block.runId, picked)
      setPicked([])
      setActiveTool(null)
    }
    if (block.label === '範圍' && picked.length >= 2) {
      onAddSeats(block.runId, seatsBetween(picked[0], picked[picked.length - 1], seats))
      setPicked([])
      setActiveTool(null)
    }
  }

  function leaveIfOut(e: DragEvent, zone: 'pull' | 'palette' | 'pack') {
    const next = e.relatedTarget as Node | null
    if (next && e.currentTarget.contains(next)) return
    setDropZone((cur) => (cur === zone ? null : cur))
    if (zone === 'pull') {
      setInsert(null)
      setChainDrop(null)
    }
  }

  function onPullDrop(e: DragEvent) {
    e.preventDefault()
    const hint = insert
    const destChain = chainDrop
    setDropZone(null)
    setInsert(null)
    setChainDrop(null)
    const drag = readDrag(e)
    if (drag?.kind === 'pack') {
      onUnpack(drag.id)
      return
    }
    if (drag?.kind === 'chain') {
      onMoveChain(drag.id, destChain ?? chains.length)
      return
    }
    if (drag?.kind === 'brick') {
      const moved = chains.flat().find((b) => b.runId === drag.id)
      if (!moved) return
      if (hint) {
        onInsert(hint.row, hint.after, moved, drag.id)
        return
      }
      const rowEl = (e.target as HTMLElement).closest('[data-att-row]')
      if (rowEl) onAppendRow(Number(rowEl.getAttribute('data-att-row')), moved, drag.id)
      return
    }
    const card = drag?.kind === 'card' ? drag.card : null
    if (!card?.id || !card.kind || !card.label) return
    if (card.kind === 'tool') setAwaitTool(card.label)
    if (hint) {
      onInsert(hint.row, hint.after, card)
      return
    }
    const rowEl = (e.target as HTMLElement).closest('[data-att-row]')
    if (rowEl) {
      onAppendRow(Number(rowEl.getAttribute('data-att-row')), card)
      return
    }
    onNewRow(card)
  }

  function onPaletteDrop(e: DragEvent) {
    e.preventDefault()
    setDropZone(null)
    setInsert(null)
    setChainDrop(null)
    const drag = readDrag(e)
    if (drag?.kind === 'brick') {
      onRemove(drag.id)
      if (activeTool === drag.id) {
        setActiveTool(null)
        setPicked([])
      }
    }
    if (drag?.kind === 'chain') {
      onRemoveChain(drag.id)
      setActiveTool(null)
      setPicked([])
    }
    if (drag?.kind === 'pack') onDeletePack(drag.id)
  }

  return (
    <div className="att-board">
      <div className="att-stage">
        <section
          className={`att-script ${dropZone === 'pull' ? 'is-drop' : ''}`}
          aria-label="快拉區"
          onDragOver={(e) => {
            e.preventDefault()
            setDropZone('pull')
          }}
          onDragLeave={(e) => leaveIfOut(e, 'pull')}
          onDrop={onPullDrop}
        >
          <header className="att-rack-head">
            <h2>快拉區</h2>
          </header>
          <div className="att-chain-stack">
            {chains.map((row, rowIndex) => (
              <div
                key={row[0]?.runId ?? rowIndex}
                className={`att-chain${chainDrop === rowIndex ? ' is-chain-drop' : ''}`}
                data-att-row={rowIndex}
                onDragOver={(e) => {
                  if (!dragKind.current || dragKind.current === 'pack') return
                  e.preventDefault()
                  e.stopPropagation()
                  if (dragKind.current === 'chain') {
                    setInsert(null)
                    setChainDrop(rowIndex)
                    return
                  }
                  setChainDrop(null)
                  if (dragKind.current === 'reason' && row.some((b) => b.kind === 'reason')) {
                    setInsert(null)
                    return
                  }
                  if ((e.target as HTMLElement).closest('.att-brick.is-handle')) {
                    setInsert({ row: rowIndex, after: -1 })
                    return
                  }
                  const brick = (e.target as HTMLElement).closest('[data-att-brick]')
                  const after = brick
                    ? Number(brick.getAttribute('data-att-brick'))
                    : row.length - 1
                  setInsert({ row: rowIndex, after })
                }}
              >
                <button
                  type="button"
                  className={`att-brick is-handle${
                    insert?.row === rowIndex && insert.after === -1 ? ' is-insert' : ''
                  }`}
                  draggable
                  aria-label="拖動整串"
                  title="拖動整串"
                  onDragStart={(e) => {
                    dragKind.current = 'chain'
                    e.dataTransfer.setData('text/plain', `chain:${row[0].runId}`)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {
                    dragKind.current = null
                    setInsert(null)
                    setChainDrop(null)
                  }}
                  onDrop={(e) => {
                    if (!dragKind.current || dragKind.current === 'pack' || dragKind.current === 'chain') return
                    e.preventDefault()
                    e.stopPropagation()
                    setInsert(null)
                    const drag = readDrag(e)
                    if (drag?.kind === 'brick') {
                      const moved = chains.flat().find((b) => b.runId === drag.id)
                      if (moved) onInsert(rowIndex, -1, moved, drag.id)
                      return
                    }
                    const card = drag?.kind === 'card' ? drag.card : null
                    if (card) onInsert(rowIndex, -1, card)
                  }}
                >
                  <span className="att-handle-dots" aria-hidden />
                </button>
                <div className="att-chain-bricks">
                {row.map((block, blockIndex) => (
                  <button
                    key={block.runId}
                    type="button"
                    data-att-brick={blockIndex}
                    className={`att-brick is-${block.kind}${
                      insert?.row === rowIndex && insert.after === blockIndex ? ' is-insert' : ''
                    }${activeTool === block.runId ? ' is-active' : ''}`}
                    draggable
                    onClick={() => {
                      if (block.kind === 'tool') clickToolBrick(block)
                    }}
                    onDrop={(e) => {
                      if (!dragKind.current || dragKind.current === 'pack') return
                      e.preventDefault()
                      e.stopPropagation()
                      setInsert(null)
                      setChainDrop(null)
                      const drag = readDrag(e)
                      if (drag?.kind === 'chain') {
                        onMoveChain(drag.id, rowIndex)
                        return
                      }
                      const hint = { row: rowIndex, after: blockIndex }
                      if (drag?.kind === 'brick') {
                        const moved = chains.flat().find((b) => b.runId === drag.id)
                        if (moved) onInsert(hint.row, hint.after, moved, drag.id)
                        return
                      }
                      const card = drag?.kind === 'card' ? drag.card : null
                      if (card) onInsert(hint.row, hint.after, card)
                    }}
                    onDragStart={(e) => {
                      dragKind.current = block.kind
                      e.dataTransfer.setData('text/plain', `brick:${block.runId}`)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => {
                      dragKind.current = null
                      setInsert(null)
                      setChainDrop(null)
                    }}
                  >
                    <strong>{block.label}</strong>
                  </button>
                ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="att-play"
            onClick={onSave}
            disabled={!canPlay}
            aria-label="記入"
            title="記入"
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <path d="M9 6.5v11l9-5.5z" />
            </svg>
          </button>
        </section>

        <section
          className={`att-log${packs.length === 0 ? ' is-empty' : ''}${dropZone === 'pack' ? ' is-drop' : ''}`}
          aria-label="封裝區"
          onDragOver={(e) => {
            if (dragKind.current !== 'chain' && dragKind.current !== 'pack') return
            e.preventDefault()
            setDropZone('pack')
          }}
          onDragLeave={(e) => leaveIfOut(e, 'pack')}
          onDrop={(e) => {
            e.preventDefault()
            setDropZone(null)
            const drag = readDrag(e)
            if (drag?.kind === 'chain') onPackChain(drag.id)
          }}
        >
          <header className="att-rack-head">
            <h2>封裝區</h2>
            {packs.length > 0 ? (
              <>
                <span className="att-count">{packs.length} 筆</span>
                <button type="button" className="btn att-log-clear" onClick={onClearPacks}>
                  清除
                </button>
              </>
            ) : null}
          </header>
          {clashes.length > 0 ? (
            <p className="att-clash" role="alert">
              {clashes.map((c, i) => (
                <span key={i}>
                  座號 {c.seats.join('、')}：{c.reasons.join('／')} 的{c.period}重疊
                  {i < clashes.length - 1 ? '；' : ''}
                </span>
              ))}
            </p>
          ) : null}
          <div className="att-pack-list">
            {packs.map((pack) => {
              const { reason, rest } = packParts(pack.text)
              const hasClash = pack.blocks.some((b) => b.kind === 'seat' && clashSeats.has(Number(b.label)))
              return (
              <button
                key={pack.id}
                type="button"
                className={`att-pack${hasClash ? ' is-clash' : ''}`}
                draggable
                onDragStart={(e) => {
                  dragKind.current = 'pack'
                  e.dataTransfer.setData('text/plain', `pack:${pack.id}`)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  dragKind.current = null
                }}
              >
                <strong className="att-pack-reason">{reason}</strong>
                {rest}
              </button>
              )
            })}
          </div>
        </section>
      </div>

      <div
        className={`att-palette ${dropZone === 'palette' ? 'is-drop' : ''}${pickMode ? ` is-mode-${pickMode}` : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDropZone('palette')
        }}
        onDragLeave={(e) => leaveIfOut(e, 'palette')}
        onDrop={onPaletteDrop}
      >
        <div className="att-palette-tabs" role="tablist" aria-label="卡片分類">
          {(
            [
              ['seat', '座號'],
              ['reason', '假由'],
              ['period', '節次'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`att-palette-tab${rackTab === id ? ' is-current' : ''}`}
              aria-selected={rackTab === id}
              onClick={() => setRackTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="att-palette-body">
          <CardRack
            kind="seat"
            cards={seats}
            shown={rackTab === 'seat'}
            muted={pickMode === 'to'}
            onKind={(k) => (dragKind.current = k)}
            pickedIds={new Set(picked.filter((c) => c.kind === 'seat').map((c) => c.id))}
            onPick={pickCard}
            footer={
              <div className="att-tool-row">
                {tools.map((card) => {
                  const mode = card.label === '多選' ? 'multi' : 'range'
                  const on = pickMode === mode
                  return (
                    <CardFace
                      key={card.id}
                      card={card}
                      label={on && mode === 'multi' ? '確定' : card.label}
                      confirm={on && mode === 'multi'}
                      picked={on && mode === 'range'}
                      muted={pickMode === 'to' || (pickMode === 'multi' && mode === 'range') || (pickMode === 'range' && mode === 'multi')}
                      draggable={false}
                      onKind={(k) => (dragKind.current = k)}
                      onPick={() => startMode(mode)}
                    />
                  )
                })}
              </div>
            }
          />
          <CardRack
            kind="reason"
            cards={reasons}
            shown={rackTab === 'reason'}
            muted={pickMode !== null}
            onKind={(k) => (dragKind.current = k)}
          />
          <CardRack
            kind="period"
            cards={periods}
            shown={rackTab === 'period'}
            muted={pickMode === 'multi' || pickMode === 'range'}
            lockedLabels={pickMode === 'to' ? SPAN_PERIODS : undefined}
            onKind={(k) => (dragKind.current = k)}
            pickedIds={new Set(picked.filter((c) => c.kind === 'period').map((c) => c.id))}
            onPick={pickCard}
          />
        </div>
      </div>
    </div>
  )
}
