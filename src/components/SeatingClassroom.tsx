import { useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  doorAlongWall,
  doorToRingCells,
  groupSize,
  makeDoor,
  nameScale,
  nextDoorName,
  UNIT_GAP_PX,
  UNIT_PAD_PX,
  unitSeatGrid,
  WALL_LABELS,
  type ClassroomDoor,
  type RoomShape,
  type SeatGroupMode,
  type SeatInkStyle,
  type SeatSpot,
  type WallRing,
  type WallSide,
} from '../lib/seating'

interface Props {
  shape: RoomShape
  rows: number
  cols: number
  mode: SeatGroupMode
  seats: SeatSpot[]
  doors: ClassroomDoor[]
  doorEdit?: boolean
  seatNames?: Record<string, string>
  onAddDoor?: (door: ClassroomDoor) => void
  onSeatDragOver?: (e: DragEvent) => void
  onSeatDrop?: (seatId: string, e: DragEvent) => void
  onSeatDragStart?: (seatId: string, e: DragEvent) => void
  teacherView?: boolean
  hideEmpty?: boolean
  emptyMode?: 'hide' | 'auto' | 'keep'
  inkStyle?: SeatInkStyle
}

function adjacent(a: number, b: number) {
  return Math.abs(a - b) === 1
}

export function NameLines({ text }: { text: string }) {
  return (
    <span className="seat-name-stack">
      {text.split('\n').map((line, i) => (
        <span
          key={`${i}-${line}`}
          className="seat-name"
          style={{ ['--name-scale' as string]: String(nameScale(line)) }}
        >
          {line}
        </span>
      ))}
    </span>
  )
}

function doorBandStyle(
  door: ClassroomDoor,
  ring?: WallRing,
  teacherView = false,
): CSSProperties {
  let { start, span } = doorAlongWall(door, ring)
  let wall = door.wall
  if (teacherView) {
    start = Math.max(0, 1 - start - span)
    if (wall === 'left') wall = 'right'
    else if (wall === 'right') wall = 'left'
  }
  const from = `${start * 100}%`
  const length = `${span * 100}%`
  if (wall === 'front') {
    return teacherView
      ? { left: from, width: length, bottom: 0, height: 'var(--peri)' }
      : { left: from, width: length, top: 0, height: 'var(--peri)' }
  }
  if (wall === 'back') {
    return teacherView
      ? { left: from, width: length, top: 0, height: 'var(--peri)' }
      : { left: from, width: length, bottom: 0, height: 'var(--peri)' }
  }
  if (wall === 'left') return { top: from, height: length, left: 0, width: 'var(--peri)' }
  return { top: from, height: length, right: 0, width: 'var(--peri)' }
}

function doorGrid(door: ClassroomDoor, ring: WallRing): CSSProperties {
  const mapped = doorToRingCells(door, ring)
  if (door.wall === 'front') {
    return { gridColumn: `${mapped.origin + 1} / ${mapped.origin + mapped.span + 1}`, gridRow: '1' }
  }
  if (door.wall === 'back') {
    return {
      gridColumn: `${mapped.origin + 1} / ${mapped.origin + mapped.span + 1}`,
      gridRow: `${ring.rows}`,
    }
  }
  if (door.wall === 'left') {
    return {
      gridColumn: '1',
      gridRow: `${mapped.origin + 1} / ${mapped.origin + mapped.span + 1}`,
    }
  }
  return {
    gridColumn: `${ring.cols}`,
    gridRow: `${mapped.origin + 1} / ${mapped.origin + mapped.span + 1}`,
  }
}

function packToCenter<T>(items: T[], keep: (item: T) => boolean, towardEnd = false): (T | null)[] {
  const kept = items.filter(keep)
  const gap = items.length - kept.length
  const start = towardEnd ? Math.ceil(gap / 2) : Math.floor(gap / 2)
  const out: (T | null)[] = Array.from({ length: items.length }, () => null)
  kept.forEach((item, i) => {
    out[start + i] = item
  })
  return out
}

function perimeterCells(cols: number, rows: number) {
  const cells: { wall: WallSide; index: number; col: number; row: number }[] = []
  for (let c = 0; c < cols; c++) cells.push({ wall: 'front', index: c, col: c, row: 0 })
  for (let c = 0; c < cols; c++) cells.push({ wall: 'back', index: c, col: c, row: rows - 1 })
  for (let r = 1; r < rows - 1; r++) cells.push({ wall: 'left', index: r - 1, col: 0, row: r })
  for (let r = 1; r < rows - 1; r++) cells.push({ wall: 'right', index: r - 1, col: cols - 1, row: r })
  return cells
}

export function SeatingClassroom({
  shape,
  rows,
  cols,
  mode,
  seats,
  doors,
  doorEdit = false,
  seatNames = {},
  onAddDoor,
  onSeatDragOver,
  onSeatDrop,
  onSeatDragStart,
  teacherView = false,
  hideEmpty = false,
  emptyMode,
  inkStyle = 'color',
}: Props) {
  const size = groupSize(mode)
  const vacancy = emptyMode ?? (hideEmpty ? 'auto' : 'keep')
  const seatGrid = unitSeatGrid(mode)
  const floorRef = useRef<HTMLDivElement>(null)
  const roomRef = useRef<HTMLDivElement>(null)
  const [seatPx, setSeatPx] = useState(36)
  const unitW =
    UNIT_PAD_PX * 2 + UNIT_GAP_PX * Math.max(0, seatGrid.cols - 1) + seatPx * seatGrid.cols
  const unitH =
    UNIT_PAD_PX * 2 + UNIT_GAP_PX * Math.max(0, seatGrid.rows - 1) + seatPx * seatGrid.rows
  const [ring, setRing] = useState<WallRing | null>(null)
  const [hotSeat, setHotSeat] = useState<string | null>(null)
  const [sel, setSel] = useState<{ wall: WallSide; indices: number[] } | null>(null)
  const [naming, setNaming] = useState<{ wall: WallSide; start: number } | null>(null)
  const [nameDraft, setNameDraft] = useState('')

  useLayoutEffect(() => {
    const floor = floorRef.current
    const room = roomRef.current
    if (!floor && !room) return
    function measure() {
      const box = floorRef.current
      if (box) {
        const styles = getComputedStyle(box)
        const colGap = Number.parseFloat(styles.columnGap) || 8
        const rowGap = Number.parseFloat(styles.rowGap) || 8
        const padX =
          (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0)
        const padY =
          (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0)
        const w = Math.max(0, box.clientWidth - padX)
        const h = Math.max(0, box.clientHeight - padY)
        const across = Math.max(rows, 1)
        const deep = Math.max(cols, 1)
        const grid = unitSeatGrid(mode)
        const unitChromeX = UNIT_PAD_PX * 2 + UNIT_GAP_PX * Math.max(0, grid.cols - 1)
        const unitChromeY = UNIT_PAD_PX * 2 + UNIT_GAP_PX * Math.max(0, grid.rows - 1)
        const seatFromW =
          (w - colGap * (across - 1) - across * unitChromeX) / (across * grid.cols)
        const seatFromH =
          (h - rowGap * (deep - 1) - deep * unitChromeY) / (deep * grid.rows)
        setSeatPx(Math.max(14, Math.floor(Math.min(seatFromW, seatFromH))))
      }
      const frame = roomRef.current
      if (frame) {
        const target = 22
        const w = frame.clientWidth
        const h = frame.clientHeight
        if (w < 40 || h < 40) return
        const nC = Math.max(8, Math.round(w / target))
        const nR = Math.max(8, Math.round(h / target))
        const size = Math.floor(Math.min(w / nC, h / nR))
        if (size < 10) return
        const colsN = Math.max(8, Math.floor(w / size))
        const rowsN = Math.max(8, Math.floor(h / size))
        frame.style.setProperty('--peri', `${size}px`)
        setRing((prev) =>
          prev && prev.cols === colsN && prev.rows === rowsN ? prev : { cols: colsN, rows: rowsN },
        )
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (floor) ro.observe(floor)
    if (room) ro.observe(room)
    return () => ro.disconnect()
  }, [shape, rows, cols, doorEdit, mode])

  function taken(wall: WallSide, index: number) {
    if (!ring) return false
    return doors.some((d) => {
      if (d.wall !== wall) return false
      const mapped = doorToRingCells(d, ring)
      return index >= mapped.start && index < mapped.start + mapped.span
    })
  }

  function clickCell(wall: WallSide, index: number) {
    if (!doorEdit || taken(wall, index) || naming) return
    const nextPicks = sel?.wall === wall ? [...sel.indices] : []
    if (nextPicks.includes(index)) {
      const remain = nextPicks.filter((n) => n !== index)
      setSel(remain.length ? { wall, indices: remain } : null)
      return
    }
    const canAdd =
      nextPicks.length === 0 ||
      (nextPicks.length < 3 && nextPicks.some((n) => adjacent(n, index)))
    const merged = (canAdd ? [...nextPicks, index] : [index]).sort((a, b) => a - b)
    const contiguous =
      merged.length <= 3 && merged.every((n, idx) => idx === 0 || n === merged[idx - 1] + 1)
    const chosen = contiguous ? merged : [index]
    if (chosen.length === 3) {
      setSel(null)
      setNaming({ wall, start: chosen[0] })
      setNameDraft(nextDoorName(doors))
      return
    }
    setSel({ wall, indices: chosen })
  }

  function confirmName() {
    if (!naming || !onAddDoor) return
    const created = makeDoor(naming.wall, naming.start, doors, ring ?? { cols: 12, rows: 12 })
    created.name = nameDraft.trim() || created.name
    onAddDoor(created)
    setNaming(null)
    setNameDraft('')
  }

  return (
    <div
      ref={roomRef}
      className={`seat-room is-${shape} ${doorEdit ? 'is-peri' : ''} ${teacherView ? 'is-teacher' : ''} is-ink-${inkStyle}`}
      style={
        doorEdit && ring
          ? {
              gridTemplateColumns: `repeat(${ring.cols}, var(--peri))`,
              gridTemplateRows: `repeat(${ring.rows}, var(--peri))`,
            }
          : undefined
      }
    >
      <div className="seat-board-label">黑板</div>
      {doorEdit && ring
        ? (
          <>
            {perimeterCells(ring.cols, ring.rows)
              .filter((cell) => {
                  return !doors.some((d) => {
                    if (d.wall !== cell.wall) return false
                    const mapped = doorToRingCells(d, ring)
                    return cell.index >= mapped.start && cell.index < mapped.start + mapped.span
                  })
                })
              .map((cell) => (
                <button
                  key={`${cell.wall}-${cell.index}`}
                  type="button"
                  className={`seat-peri-cell ${sel?.wall === cell.wall && sel.indices.includes(cell.index) ? 'is-picked' : ''}`}
                  style={{ gridColumn: cell.col + 1, gridRow: cell.row + 1 }}
                  aria-label={`${WALL_LABELS[cell.wall]}第 ${cell.index + 1} 格`}
                  onClick={() => clickCell(cell.wall, cell.index)}
                />
              ))}
            {doors.map((d, index) => (
                <div key={d.id} className="seat-peri-door" style={doorGrid(d, ring)}>
                  <span className="seat-door-tag">{index + 1}</span>
                </div>
              ))}
          </>
        )
        : !doorEdit
          ? doors.map((door) => (
            <div key={door.id} className={`seat-door-band is-${door.wall}`} style={doorBandStyle(door, ring ?? undefined, teacherView)}>
              <span className="seat-door-tag">{door.name}</span>
            </div>
          ))
        : null}
      <div
        ref={floorRef}
        className={`seat-floor ${cols < 2 ? 'is-front-bias' : ''} ${teacherView ? 'is-teacher' : ''}`}
        style={{
          ['--seat-px' as string]: `${seatPx}px`,
          gridTemplateColumns: `repeat(${rows}, ${unitW}px)`,
          gridTemplateRows: `repeat(${cols}, ${unitH}px)`,
          ...(doorEdit && ring
            ? { gridColumn: `2 / ${ring.cols}`, gridRow: `2 / ${ring.rows}` }
            : {}),
        }}
      >
        {(teacherView
          ? Array.from({ length: rows }, (_, i) => rows - 1 - i)
          : Array.from({ length: rows }, (_, i) => i)
        ).flatMap((r, displayCol) => {
          const depth = teacherView
            ? Array.from({ length: cols }, (_, i) => cols - 1 - i)
            : Array.from({ length: cols }, (_, i) => i)
          const stack = depth.map((c) => {
            const unitSeats = seats.filter((s) => s.row === r && s.col === c)
            const filledSeats = unitSeats.filter((s) => seatNames[s.id])
            return { r, c, unitSeats, filledSeats }
          })
          const packed = vacancy === 'auto' ? packToCenter(stack, (u) => u.filledSeats.length > 0, teacherView) : stack
          return packed.map((unit, displayRow) => {
            const unitSeats = unit?.unitSeats ?? []
            const filledSeats = unit?.filledSeats ?? []
            const visibleSeats = vacancy === 'keep' ? unitSeats : filledSeats
            const unitSize = vacancy === 'auto' ? filledSeats.length : size
            const cellStyle = { gridColumn: displayCol + 1, gridRow: displayRow + 1 }
            if (!unit || (vacancy !== 'keep' && filledSeats.length === 0)) {
              return <div key={`u-${displayRow}-${displayCol}`} className="seat-unit is-blank" style={cellStyle} />
            }
            return (
              <div
                key={`u-${unit.r}-${unit.c}`}
                className={`seat-unit is-${Math.max(unitSize, 1)}`}
                data-size={Math.max(unitSize, 1)}
                style={cellStyle}
              >
                {visibleSeats.map((seat) => {
                  const name = seatNames[seat.id]
                  return (
                    <div
                      key={seat.id}
                      className={`seat-slot ${name ? 'is-filled' : ''} ${onSeatDrop ? 'is-drop' : ''} ${hotSeat === seat.id ? 'is-hot' : ''}`}
                      onDragOver={
                        onSeatDrop
                          ? (e) => {
                              e.preventDefault()
                              setHotSeat(seat.id)
                              onSeatDragOver?.(e)
                            }
                          : undefined
                      }
                      onDragEnter={
                        onSeatDrop
                          ? (e) => {
                              e.preventDefault()
                              setHotSeat(seat.id)
                            }
                          : undefined
                      }
                      onDragLeave={
                        onSeatDrop
                          ? (e) => {
                              const next = e.relatedTarget as Node | null
                              if (!e.currentTarget.contains(next)) {
                                setHotSeat((cur) => (cur === seat.id ? null : cur))
                              }
                            }
                          : undefined
                      }
                      onDrop={
                        onSeatDrop
                          ? (e) => {
                              e.preventDefault()
                              setHotSeat(null)
                              onSeatDrop(seat.id, e)
                            }
                          : undefined
                      }
                    >
                          {name ? (
                        <span
                          className="seat-chip"
                          draggable={Boolean(onSeatDragStart)}
                          onDragStart={(e) => {
                            onSeatDragStart?.(seat.id, e)
                          }}
                          onDragEnd={() => setHotSeat(null)}
                        >
                          <NameLines text={name} />
                        </span>
                      ) : (
                        <span className="seat-empty">空</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })
        })}
      </div>
      {naming && (
        <div className="seat-notice" role="dialog" aria-modal="true" aria-labelledby="seat-door-name-title">
          <div className="seat-notice-card">
            <h3 id="seat-door-name-title">幫這扇門取名</h3>
            <input
              className="seat-door-name-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmName()
              }}
            />
            <div className="seat-notice-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setNaming(null)
                  setSel(null)
                }}
              >
                取消
              </button>
              <button type="button" className="btn primary" onClick={confirmName}>
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function SeatUnitPreview({ mode }: { mode: SeatGroupMode }) {
  const size = groupSize(mode)
  const labels =
    mode === 'chess'
      ? ['1']
      : mode === 'pair'
        ? ['左', '右']
        : mode === 'team3'
          ? ['左', '右', '中']
          : mode === 'team4'
            ? ['1', '2', '3', '4']
            : ['左', '右', '左', '右', '中']

  return (
    <div className="seat-unit-preview">
      <div className={`seat-unit is-${size}`} data-size={size}>
        {labels.map((label, i) => (
          <div key={i} className="seat-slot is-preview">
            <span className="seat-empty">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
