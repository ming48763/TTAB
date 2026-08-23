import { BrandMark } from './BrandMark'
import { useEffect, useState } from 'react'
import { SeatUnitPreview, SeatingClassroom } from './SeatingClassroom'
import {
  buildSeats,
  clampGrid,
  commitGridInput,
  groupSize,
  ROOM_SHAPES,
  SEAT_MODES,
  seatCapacity,
  type ClassroomDoor,
  type RoomShape,
  type SeatGroupMode,
} from '../lib/seating'

type SetupStep = 'mode' | 'room' | 'grid' | 'doors'

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

  return (
    <label>
      {label}
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
          if (n >= 1 && n <= 12) {
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
}: Props) {
  const [phase, setPhase] = useState<SetupStep>('mode')
  const seats = buildSeats(rows, cols, mode)
  const cap = seatCapacity(rows, cols, mode)
  const size = groupSize(mode)
  const stepIndex = phase === 'mode' ? 1 : phase === 'room' ? 2 : phase === 'grid' ? 3 : 4

  const [notice, setNotice] = useState<string | null>(null)

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
        <ol className="step-rail" aria-label="進度">
          <li className="is-done">匯入</li>
          <li className="is-done">欄位</li>
          <li className="is-current">教室</li>
          <li>排座位</li>
        </ol>
      </header>
      <div className="booth-main">
        <section className="booth-choose">
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
              <div className="seat-mode-grid">
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
            </>
          )}

          {phase === 'room' && (
            <>
              <h2>選擇教室格局</h2>
              <p className="booth-step-label">黑板固定在前方。直式與橫式教室比例與 A4 相同。</p>
              <div className="seat-mode-grid is-three">
                {ROOM_SHAPES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={`tool-tile is-ready ${shape === opt.id ? 'is-picked' : ''}`}
                    onClick={() => onShape(opt.id)}
                  >
                    <strong>{opt.label}</strong>
                    <span>{opt.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {phase === 'grid' && (
            <>
              <h2>選擇布局</h2>
              <p className="booth-step-label">
                排是寬（由左到右），每排單位是長（由黑板往後）。目前每個單位 {size} 人。
              </p>
              <div className="seat-grid-fields">
                <GridCountInput label="排（寬）" value={rows} onCommit={onRows} />
                <GridCountInput label="每排單位（長）" value={cols} onCommit={onCols} />
              </div>
              <p className="muted">
                {rows} 排 × {cols} 單位 × {size} 人 ＝ {cap} 個座位
                {studentCount > cap ? `（名單 ${studentCount} 人，座位較少）` : `（名單 ${studentCount} 人）`}
              </p>
            </>
          )}

          {phase === 'doors' && (
            <>
              <h2>開門</h2>
              <p className="booth-step-label">
                外圍是一格一格的方塊。在同一面牆上點擊連續三格就會開門，接著幫門取名。點 × 可刪除。
              </p>
              {doors.length === 0 && <p className="muted">目前還沒有門。</p>}
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
                onRenameDoor={(id, name) =>
                  onDoors(doors.map((d) => (d.id === id ? { ...d, name } : d)))
                }
                onRemoveDoor={(id) => onDoors(doors.filter((d) => d.id !== id))}
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
