import { BrandMark } from './BrandMark'
import { useState } from 'react'
import { SeatingClassroom } from './SeatingClassroom'
import { SeatingPrintPreview } from './SeatingPrintPreview'
import {
  buildSeats,
  studentCardLines,
  studentCardText,
  studentKey,
  type ClassroomDoor,
  type RoomShape,
  type SeatGroupMode,
} from '../lib/seating'
import type { ColumnMapping, StudentRow } from '../types'

interface Props {
  rows: StudentRow[]
  mappings: ColumnMapping[]
  mode: SeatGroupMode
  gridRows: number
  gridCols: number
  shape: RoomShape
  doors: ClassroomDoor[]
  assignments: Record<string, string>
  onAssign: (next: Record<string, string>) => void
  onBack: () => void
  onHome: () => void
}

export function SeatingBoard({
  rows,
  mappings,
  mode,
  gridRows,
  gridCols,
  shape,
  doors,
  assignments,
  onAssign,
  onBack,
  onHome,
}: Props) {
  const seats = buildSeats(gridRows, gridCols, mode)
  const [dragStudent, setDragStudent] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [shownFields, setShownFields] = useState<string[]>(() => {
    const names = mappings.filter((m) => m.role === 'name').map((m) => m.header)
    if (names.length) return names
    const named = mappings.find((m) => /姓名|名字/.test(m.header) || /姓名|名字/.test(m.label))
    return named ? [named.header] : mappings[0] ? [mappings[0].header] : []
  })

  function readDrag(e: { dataTransfer: DataTransfer }) {
    return e.dataTransfer.getData('text/plain') || dragStudent
  }

  const labels: Record<string, string> = {}
  for (const row of rows) {
    labels[studentKey(row)] = studentCardText(row, mappings, shownFields)
  }

  const taken = new Set(Object.values(assignments))
  const pool = rows.filter((row) => !taken.has(studentKey(row)))
  const seatNames: Record<string, string> = {}
  for (const [seatId, key] of Object.entries(assignments)) {
    if (labels[key]) seatNames[seatId] = labels[key]
  }

  function fillRandom() {
    const empty = seats
      .filter((seat) => !assignments[seat.id])
      .sort((a, b) => a.col - b.col || a.row - b.row)
    if (empty.length === 0 || pool.length === 0) return
    const waiting = [...pool]
    for (let i = waiting.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const swap = waiting[i]
      waiting[i] = waiting[j]
      waiting[j] = swap
    }
    const next = { ...assignments }
    const n = Math.min(empty.length, waiting.length)
    for (let i = 0; i < n; i++) {
      next[empty[i].id] = studentKey(waiting[i])
    }
    onAssign(next)
  }

  function place(seatId: string, student: string | null) {
    const next = { ...assignments }
    if (student === null) {
      delete next[seatId]
      onAssign(next)
      return
    }
    const occupant = next[seatId]
    const fromSeat = Object.keys(next).find((id) => next[id] === student)
    if (fromSeat) delete next[fromSeat]
    next[seatId] = student
    if (occupant && fromSeat) next[fromSeat] = occupant
    onAssign(next)
  }

  return (
    <div className="seat-assign">
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
          <li className="is-done">教室</li>
          <li className="is-current">排座位</li>
        </ol>
      </header>
      <div className="seat-assign-body">
      <section className="seat-assign-map">
        <div className="seat-assign-scroll">
        <div className="seat-assign-bar">
          <p className="muted">
            把右側姓名拖到座位。若位子已有人會換成新同學，原同學回到名單。
          </p>
        </div>
        <SeatingClassroom
          shape={shape}
          rows={gridRows}
          cols={gridCols}
          mode={mode}
          seats={seats}
          doors={doors}
          seatNames={seatNames}
          onSeatDrop={(seatId, e) => {
            const key = readDrag(e)
            if (key) place(seatId, key)
            setDragStudent(null)
          }}
          onSeatDragStart={(seatId, e) => {
            const key = assignments[seatId]
            if (!key) return
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', key)
            setDragStudent(key)
          }}
        />
        </div>
        <div className="seat-corner-actions no-print">
          <button type="button" className="btn" onClick={onBack}>
            返回
            <br />
            教室
            <br />
            設定
          </button>
          <button type="button" className="btn primary" onClick={() => setPrintPreview(true)}>
            預覽
            <br />
            列印
          </button>
        </div>
      </section>
      <aside className="seat-pool no-print">
        <div className="seat-pool-head">
          <h2>未入座</h2>
          <div className="seat-pool-tools">
          <div className="seat-info-hover">
            <button type="button" className="seat-info-trigger">
              新增資訊
            </button>
            <div className="seat-info-pop" role="group" aria-label="顯示資訊">
              {mappings.length === 0 ? (
                <p className="muted">沒有匯入欄位</p>
              ) : (
                mappings.map((m) => (
                  <label key={m.header} className="seat-info-option">
                    <input
                      type="checkbox"
                      checked={shownFields.includes(m.header)}
                      onChange={() => {
                        setShownFields((prev) =>
                          prev.includes(m.header)
                            ? prev.filter((h) => h !== m.header)
                            : [...prev, m.header],
                        )
                      }}
                    />
                    <span>{m.label || m.header}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <button type="button" className="seat-random-btn" onClick={fillRandom}>
            一鍵隨機
          </button>
          <button
            type="button"
            className="seat-random-btn"
            onClick={() => {
              if (Object.keys(assignments).length === 0) return
              setConfirmClear(true)
            }}
          >
            清空
          </button>
          </div>
        </div>
        <p className="booth-step-label">
          {pool.length} 人待安排 · 已入座 {rows.length - pool.length} 人
        </p>
        <div
          className="seat-pool-list"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const key = readDrag(e)
            if (!key) return
            const next = { ...assignments }
            for (const id of Object.keys(next)) {
              if (next[id] === key) delete next[id]
            }
            onAssign(next)
            setDragStudent(null)
          }}
        >
          {pool.length === 0 ? (
            <p className="muted">大家都入座了。</p>
          ) : (
            pool.map((row) => {
              const key = studentKey(row)
              const lines = studentCardLines(row, mappings, shownFields)
              return (
                <div
                  key={key}
                  className="booth-drag-card seat-pool-card"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', key)
                    setDragStudent(key)
                  }}
                  onDragEnd={() => setDragStudent(null)}
                >
                  <span className="seat-name-stack">
                    {lines.map((line, i) => (
                      <span
                        key={`${key}-${i}`}
                        className={line.isName ? 'seat-name' : 'seat-card-meta'}
                        style={
                          line.isName
                            ? { ['--name-scale' as string]: String(line.scale) }
                            : undefined
                        }
                      >
                        {line.text}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </aside>
      </div>
      {confirmClear && (
        <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="seat-clear-title">
          <div className="seat-notice-card">
            <h3 id="seat-clear-title">清空所有座位？</h3>
            <p>已入座的人都會回到未入座名單，此動作無法復原。</p>
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  onAssign({})
                  setConfirmClear(false)
                }}
              >
                確定清空
              </button>
            </div>
          </div>
        </div>
      )}
      {printPreview && (
        <SeatingPrintPreview
          shape={shape}
          rows={gridRows}
          cols={gridCols}
          mode={mode}
          seats={seats}
          doors={doors}
          seatNames={seatNames}
          onClose={() => setPrintPreview(false)}
        />
      )}
    </div>
  )
}
