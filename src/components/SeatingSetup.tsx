import { BrandMark } from './BrandMark'
import { StepRail } from './StepRail'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SeatUnitPreview, SeatingClassroom } from './SeatingClassroom'
import {
  buildSeats,
  clampGrid,
  commitGridInput,
  groupSize,
  MAX_GRID,
  ROOM_SHAPES,
  SEAT_MODES,
  seatCapacity,
  type ClassroomDoor,
  type RoomShape,
  type SeatGroupMode,
} from '../lib/seating'

type SetupStep = 'mode' | 'room' | 'grid' | 'doors'

const MODE_TILE_MAX = 168
const MODE_TILE_GAP = 12

/** Largest square that fits `count` tiles in the box, capped at MODE_TILE_MAX. */
function fitModeTiles(count: number, width: number, height: number) {
  if (width < 8 || height < 8 || count < 1) return null
  let bestTile = 0
  let bestCols = 1
  const limit = Math.min(count, Math.max(1, Math.floor((width + MODE_TILE_GAP) / (1 + MODE_TILE_GAP))))
  for (let cols = 1; cols <= limit; cols++) {
    const rows = Math.ceil(count / cols)
    const tile = Math.min(
      MODE_TILE_MAX,
      (width - MODE_TILE_GAP * (cols - 1)) / cols,
      (height - MODE_TILE_GAP * (rows - 1)) / rows,
    )
    if (tile < 1) continue
    const larger = tile > bestTile + 0.5
    const tieMoreCols = Math.abs(tile - bestTile) <= 0.5 && cols > bestCols
    if (larger || tieMoreCols) {
      bestTile = tile
      bestCols = cols
    }
  }
  if (bestTile < 1) return null
  return { tile: Math.floor(bestTile), cols: bestCols }
}

function GridCountInput({
  label,
  value,
  onCommit,
}: {
  label: string
  value: number
  onCommit: (n: number) => void
}) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  function finish() {
    const next = commitGridInput(text)
    setText(String(next))
    if (next !== value) onCommit(next)
  }

  function step(delta: number) {
    const next = clampGrid(value + delta)
    if (next === value) return
    onCommit(next)
  }

  return (
    <label className="seat-count">
      <span className="seat-count-label">{label}</span>
      <span className="seat-count-box">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={text}
          onChange={(e) => {
            const v = e.target.value
            if (v === '') {
              setText('')
              return
            }
            if (!/^\d{1,2}$/.test(v)) return
            setText(v)
            const n = Number(v)
            if (n >= 1 && n <= MAX_GRID) {
              const next = clampGrid(n)
              if (next !== value) onCommit(next)
            }
          }}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              finish()
              e.currentTarget.blur()
            }
          }}
        />
        <span className="seat-count-spin">
          <button
            type="button"
            className="seat-count-up"
            aria-label={`${label} 增加`}
            disabled={value >= MAX_GRID}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(1)}
          >
            <span className="seat-count-tri" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="seat-count-down"
            aria-label={`${label} 減少`}
            disabled={value <= 1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => step(-1)}
          >
            <span className="seat-count-tri" aria-hidden="true" />
          </button>
        </span>
      </span>
    </label>
  )
}

interface Props {
  mode: SeatGroupMode
  rows: number
  cols: number
  shape: RoomShape
  doors: ClassroomDoor[]
  studentCount: number
  onMode: (mode: SeatGroupMode) => void
  onRows: (n: number) => void
  onCols: (n: number) => void
  onShape: (shape: RoomShape) => void
  onDoors: (doors: ClassroomDoor[]) => void
  onBack: () => void
  onNext: () => void
  onHome: () => void
  startPhase?: SetupStep
}

export function SeatingSetup({
  mode,
  rows,
  cols,
  shape,
  doors,
  studentCount,
  onMode,
  onRows,
  onCols,
  onShape,
  onDoors,
  onBack,
  onNext,
  onHome,
  startPhase = 'mode',
}: Props) {
  const [phase, setPhase] = useState<SetupStep>(startPhase)
  const seats = buildSeats(rows, cols, mode)
  const cap = seatCapacity(rows, cols, mode)
  const size = groupSize(mode)
  const stepIndex = phase === 'mode' ? 1 : phase === 'room' ? 2 : phase === 'grid' ? 3 : 4

  const [notice, setNotice] = useState<string | null>(null)
  const modeFitRef = useRef<HTMLDivElement>(null)
  const [modeFit, setModeFit] = useState({ tile: MODE_TILE_MAX, cols: 2 })

  const fittingTiles = phase === 'mode' || phase === 'room'
  const tileCount = phase === 'room' ? ROOM_SHAPES.length : SEAT_MODES.length

  useLayoutEffect(() => {
    if (!fittingTiles) return
    const el = modeFitRef.current
    if (!el) return
    const apply = () => {
      const style = getComputedStyle(el)
      const padX = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight)
      const padY = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      const next = fitModeTiles(tileCount, el.clientWidth - padX, el.clientHeight - padY)
      if (!next) return
      if (window.matchMedia('(orientation: portrait)').matches) {
        const choose = el.closest('.booth-choose')
        if (choose) {
          const chooseStyle = getComputedStyle(choose)
          const choosePad =
            Number.parseFloat(chooseStyle.paddingTop) + Number.parseFloat(chooseStyle.paddingBottom)
          const cap = Math.floor(choose.clientHeight - choosePad - 4)
          if (cap >= 48) next.tile = Math.min(next.tile, cap)
        }
      }
      setModeFit((prev) => (prev.tile === next.tile && prev.cols === next.cols ? prev : next))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => observer.disconnect()
  }, [fittingTiles, tileCount])

  function seatsShort() {
    return studentCount > cap
  }

  function goNext() {
    if ((phase === 'grid' || phase === 'doors') && seatsShort()) {
      setNotice(
        `目前有 ${cap} 個座位，名單有 ${studentCount} 人，座位不夠。請增加排數或每排單位，或改選人數較多的座位模式。`,
      )
      setPhase('grid')
      return
    }
    if (phase === 'mode') setPhase('room')
    else if (phase === 'room') setPhase('grid')
    else if (phase === 'grid') setPhase('doors')
    else onNext()
  }

  function goPrev() {
    if (phase === 'room') setPhase('mode')
    else if (phase === 'grid') setPhase('room')
    else if (phase === 'doors') setPhase('grid')
    else onBack()
  }

  return (
    <div className="booth-shell seat-setup">
      <header className="site-header no-print seat-work-head">
        <div className="brand">
          <BrandMark size="sm" onHome={onHome} />
          <div>
            <h1>排座位大師</h1>
          </div>
        </div>
        <StepRail
          steps={[
            { label: '匯入', state: 'is-done' },
            { label: '欄位', state: 'is-done' },
            { label: '教室', state: 'is-current' },
            { label: '排座位' },
          ]}
        />
      </header>
      <div className="booth-main">
        <section className={`booth-choose${fittingTiles ? ' is-mode' : ''}${phase === 'grid' ? ' is-grid' : ''}`}>
          <p className="booth-step-label">
            步驟 {stepIndex}／4
            {phase === 'mode'
              ? ' · 座位模式'
              : phase === 'room'
                ? ' · 教室格局'
                : phase === 'grid'
                  ? ' · 布局'
                  : ' · 開門'}
          </p>

          {phase === 'mode' && (
            <>
              <h2>選擇座位模式</h2>
              <div className="seat-mode-fit" ref={modeFitRef}>
                <div
                  className="seat-mode-grid"
                  style={{
                    ['--tile' as string]: `${modeFit.tile}px`,
                    gridTemplateColumns: `repeat(${modeFit.cols}, ${modeFit.tile}px)`,
                    gridAutoRows: `${modeFit.tile}px`,
                  }}
                >
                  {SEAT_MODES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`tool-tile is-ready ${mode === opt.id ? 'is-picked' : ''}`}
                      onClick={() => onMode(opt.id)}
                    >
                      <strong>{opt.label}</strong>
                      <span>{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {phase === 'room' && (
            <>
              <h2>選擇教室格局</h2>
              <div className="seat-mode-fit" ref={modeFitRef}>
                <div
                  className="seat-mode-grid is-three"
                  style={{
                    ['--tile' as string]: `${modeFit.tile}px`,
                    gridTemplateColumns: `repeat(${modeFit.cols}, ${modeFit.tile}px)`,
                    gridAutoRows: `${modeFit.tile}px`,
                  }}
                >
                  {ROOM_SHAPES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      className={`tool-tile is-ready ${shape === opt.id ? 'is-picked' : ''}`}
                      onClick={() => onShape(opt.id)}
                    >
                      <strong>{opt.label}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {phase === 'grid' && (
            <>
              <h2>選擇布局</h2>
              <div className="seat-grid-block">
                <div className="seat-grid-fields">
                  <GridCountInput label="排（寬）" value={rows} onCommit={onRows} />
                  <GridCountInput label="每排單位（長）" value={cols} onCommit={onCols} />
                </div>
                <p className="muted seat-grid-summary">
                  <span className="seat-grid-calc">
                    {rows} 排 × {cols} 單位 × {size} 人 ＝ {cap} 個座位
                  </span>
                  {studentCount > cap ? (
                    <span className="seat-grid-short">{studentCount} 人，目前座位不夠</span>
                  ) : null}
                </p>
              </div>
            </>
          )}

          {phase === 'doors' && (
            <>
              <h2>開門</h2>
              {doors.length === 0 ? (
                <p className="muted">目前還沒有門。</p>
              ) : (
                <div className="seat-door-table-wrap">
                  <table className="seat-door-table">
                    <thead>
                      <tr>
                        <th>序號</th>
                        <th>門的名稱</th>
                        <th>刪除</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doors.map((door, index) => (
                        <tr key={door.id}>
                          <td>{index + 1}</td>
                          <td>
                            <input
                              aria-label={`門 ${index + 1} 的名稱`}
                              value={door.name}
                              onChange={(e) =>
                                onDoors(
                                  doors.map((item) =>
                                    item.id === door.id ? { ...item, name: e.target.value } : item,
                                  ),
                                )
                              }
                            />
                          </td>
                          <td>
                            <button type="button" onClick={() => onDoors(doors.filter((item) => item.id !== door.id))}>
                              刪除
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          <div className="booth-actions">
            <button type="button" className="btn" onClick={goPrev}>
              {phase === 'mode' ? '返回欄位設定' : '上一步'}
            </button>
            <button type="button" className="btn primary" onClick={goNext}>
              {phase === 'doors' ? '開始排座位' : '下一步'}
            </button>
          </div>
        </section>

        <aside className="booth-preview">
          <p className="booth-step-label">{phase === 'mode' ? '單位布局' : '教室預覽'}</p>
          <div className="seat-preview-stage">
            {phase === 'mode' ? (
              <SeatUnitPreview mode={mode} />
            ) : (
              <SeatingClassroom
                shape={shape}
                rows={rows}
                cols={cols}
                mode={mode}
                seats={seats}
                doors={doors}
                doorEdit={phase === 'doors'}
                onAddDoor={
                  phase === 'doors' ? (door) => onDoors([...doors, door]) : undefined
                }
              />
            )}
          </div>
        </aside>
      </div>
      {notice && (
        <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="seat-notice-title">
          <div className="seat-notice-card">
            <h3 id="seat-notice-title">座位不夠</h3>
            <p>{notice}</p>
            <button type="button" className="btn primary" onClick={() => setNotice(null)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
