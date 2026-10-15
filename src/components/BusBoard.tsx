import { useState } from 'react'
import { BUS_MODELS, busModel, busPlan, busSeatOrder, type BusCoach } from '../lib/busLayout'
import { studentCardLines, studentCardText, studentKey } from '../lib/seating'
import type { ColumnMapping, StudentRow } from '../types'
import { uid } from '../types'
import { BrandMark } from './BrandMark'
import { BusChart } from './BusChart'
import { BusPrintPreview } from './BusPrintPreview'
import { BusRolePicker } from './BusRolePicker'
import { StepRail } from './StepRail'

export type BusRolePerson = { id: string; label: string }

interface Props {
  rows: StudentRow[]
  mappings: ColumnMapping[]
  coaches: BusCoach[]
  coachIndex: number
  roles: BusRolePerson[]
  onRoles: (next: BusRolePerson[]) => void
  onCoaches: (next: BusCoach[]) => void
  onCoachIndex: (index: number) => void
  onBack: () => void
  onHome: () => void
}

export function BusBoard({ rows, mappings, coaches, coachIndex, roles, onRoles, onCoaches, onCoachIndex, onBack, onHome }: Props) {
  const [dragStudent, setDragStudent] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [printPreview, setPrintPreview] = useState(false)
  const [rolePicker, setRolePicker] = useState(false)
  const coach = coaches[coachIndex] ?? coaches[0]
  const assignments = coach?.assignments ?? {}
  const [shownFields, setShownFields] = useState<string[]>(() => {
    const names = mappings.filter((mapping) => mapping.role === 'name').map((mapping) => mapping.header)
    if (names.length) return names
    const named = mappings.find((mapping) => /姓名|名字/.test(mapping.header) || /姓名|名字/.test(mapping.label))
    return named ? [named.header] : mappings[0] ? [mappings[0].header] : []
  })

  function readDrag(event: { dataTransfer: DataTransfer }) {
    return event.dataTransfer.getData('text/plain') || dragStudent
  }

  const labels: Record<string, string> = {}
  for (const row of rows) {
    labels[studentKey(row)] = studentCardText(row, mappings, shownFields).replace(/\u3000/g, '')
  }
  for (const role of roles) labels[role.id] = role.label

  const taken = new Set(coaches.flatMap((item) => Object.values(item.assignments)))
  const pool = rows.filter((row) => !taken.has(studentKey(row)))
  const poolCards = [
    ...pool.map((row) => ({
      key: studentKey(row),
      lines: studentCardLines(row, mappings, shownFields).map((line) => ({
        ...line,
        text: line.text.replace(/\u3000/g, ''),
      })),
    })),
    ...roles
      .filter((role) => !taken.has(role.id))
      .map((role) => ({
        key: role.id,
        lines: [{ text: role.label, isName: true, scale: role.label.length <= 3 ? 1 : 3 / role.label.length }],
      })),
  ]
  const seatNames: Record<string, string> = {}
  for (const [seatId, key] of Object.entries(assignments)) {
    if (labels[key]) seatNames[seatId] = labels[key]
  }

  function fillRandom() {
    const empty = [...busPlan(coach?.model).seats].filter((seat) => !assignments[seat.id]).sort((a, b) => busSeatOrder(a) - busSeatOrder(b))
    if (empty.length === 0 || poolCards.length === 0) return
    const waiting = poolCards.map((card) => card.key)
    for (let i = waiting.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const swap = waiting[i]
      waiting[i] = waiting[j]
      waiting[j] = swap
    }
    const next = { ...assignments }
    const count = Math.min(empty.length, waiting.length)
    for (let i = 0; i < count; i++) next[empty[i].id] = waiting[i]
    replaceCurrent(next)
  }

  function replaceCurrent(nextAssignments: Record<string, string>) {
    onCoaches(coaches.map((item, index) => (index === coachIndex ? { ...item, assignments: nextAssignments } : item)))
  }

  function place(seatId: string, student: string | null) {
    const next = { ...assignments }
    if (student === null) {
      delete next[seatId]
      replaceCurrent(next)
      return
    }
    const occupant = next[seatId]
    const fromSeat = Object.keys(next).find((id) => next[id] === student)
    if (fromSeat) delete next[fromSeat]
    next[seatId] = student
    if (occupant && fromSeat) next[fromSeat] = occupant
    onCoaches(
      coaches.map((item, index) => {
        if (index === coachIndex) return { ...item, assignments: next }
        const cleared = { ...item.assignments }
        for (const id of Object.keys(cleared)) {
          if (cleared[id] === student) delete cleared[id]
        }
        return { ...item, assignments: cleared }
      }),
    )
  }

  function patchCoach(patch: Partial<Pick<BusCoach, 'name' | 'plate' | 'model' | 'assignments'>>) {
    onCoaches(coaches.map((item, index) => (index === coachIndex ? { ...item, ...patch } : item)))
  }

  function changeModel(model: string) {
    const ids = new Set(busPlan(model).seats.map((seat) => seat.id))
    const nextAssignments = Object.fromEntries(Object.entries(assignments).filter(([seatId]) => ids.has(seatId)))
    patchCoach({ model, assignments: nextAssignments })
  }

  return (
    <div className="seat-assign">
      <header className="site-header no-print seat-work-head">
        <div className="brand">
          <BrandMark size="sm" onHome={onHome} />
          <div>
            <h1>遊覽車大師</h1>
          </div>
        </div>
        <StepRail
          steps={[
            { label: '匯入', state: 'is-done' },
            { label: '欄位', state: 'is-done' },
            { label: '排座位', state: 'is-current' },
          ]}
        />
      </header>
      <div className="seat-assign-body">
        <section className="seat-assign-map">
          <div className="seat-assign-scroll">
            <div className="bus-stage">
            <BusChart
              names={seatNames}
              model={coach?.model}
              interactive
              onSeatDrop={(seatId, event) => {
                const key = readDrag(event)
                if (key) place(seatId, key)
                setDragStudent(null)
              }}
              onSeatDragStart={(seatId, event) => {
                const key = assignments[seatId]
                if (!key) return
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', key)
                setDragStudent(key)
              }}
            />
            </div>
            <aside className="bus-info no-print">
              <h2>遊覽車資訊</h2>
              <label>
                <span>車種</span>
                <select
                  aria-label="車種"
                  value={busModel(coach?.model).id}
                  onChange={(event) => changeModel(event.target.value)}
                >
                  {BUS_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>車輛名稱</span>
                <input
                  value={coach?.name ?? ''}
                  aria-label="車輛名稱"
                  onChange={(event) => patchCoach({ name: event.target.value })}
                />
              </label>
              <label>
                <span>車牌</span>
                <input
                  value={coach?.plate ?? ''}
                  aria-label="車牌"
                  onChange={(event) => patchCoach({ plate: event.target.value })}
                />
              </label>
              <div className="bus-info-nav">
                <button type="button" aria-label="上一輛" disabled={coachIndex <= 0} onClick={() => onCoachIndex(coachIndex - 1)}>
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M10 3.5 L5.5 8 L10 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span>
                  {coachIndex + 1} / {coaches.length}
                </span>
                <button
                  type="button"
                  aria-label="下一輛"
                  disabled={coachIndex >= coaches.length - 1}
                  onClick={() => onCoachIndex(coachIndex + 1)}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M6 3.5 L10.5 8 L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                className="bus-info-add"
                aria-label="新增遊覽車"
                onClick={() => {
                  onCoaches([...coaches, { id: uid('bus'), name: '', plate: '', model: busModel(coach?.model).id, assignments: {} }])
                  onCoachIndex(coaches.length)
                }}
              >
                +
              </button>
            </aside>
          </div>
          <div className="seat-corner-actions no-print">
            <button type="button" className="btn" onClick={onBack}>
              返回
              <br />
              欄位
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
            <h2>名單</h2>
            <div className="seat-pool-tools">
              <div className="seat-info-hover">
                <button type="button" className="seat-info-trigger">
                  新增資訊
                </button>
                <div className="seat-info-pop" role="group" aria-label="顯示資訊">
                  {mappings.length === 0 ? (
                    <p className="muted">沒有匯入欄位</p>
                  ) : (
                    mappings.map((mapping) => (
                      <label key={mapping.header} className="seat-info-option">
                        <input
                          type="checkbox"
                          checked={shownFields.includes(mapping.header)}
                          onChange={() => {
                            setShownFields((prev) =>
                              prev.includes(mapping.header)
                                ? prev.filter((header) => header !== mapping.header)
                                : [...prev, mapping.header],
                            )
                          }}
                        />
                        <span>{mapping.label || mapping.header}</span>
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
          <div
            className="seat-pool-list"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const key = readDrag(event)
              if (!key) return
              const next = { ...assignments }
              for (const id of Object.keys(next)) {
                if (next[id] === key) delete next[id]
              }
              replaceCurrent(next)
              setDragStudent(null)
            }}
          >
            {poolCards.map((card) => (
              <div
                key={card.key}
                className="booth-drag-card seat-pool-card"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', card.key)
                  setDragStudent(card.key)
                }}
                onDragEnd={() => setDragStudent(null)}
              >
                <span className="seat-name-stack">
                  {card.lines.map((line, index) => (
                    <span
                      key={`${card.key}-${index}`}
                      className={line.isName ? 'seat-name' : 'seat-card-meta'}
                      style={line.isName ? { ['--name-scale' as string]: String(line.scale) } : undefined}
                    >
                      {line.text}
                    </span>
                  ))}
                </span>
              </div>
            ))}
            <button type="button" className="booth-drag-card seat-pool-card seat-pool-add" onClick={() => setRolePicker(true)}>
              +
            </button>
          </div>
        </aside>
      </div>
      {confirmClear && (
        <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="bus-clear-title">
          <div className="seat-notice-card">
            <h3 id="bus-clear-title">清空所有座位？</h3>
            <p>已入座的人都會回到名單，此動作無法復原。</p>
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  replaceCurrent({})
                  setConfirmClear(false)
                }}
              >
                確定清空
              </button>
            </div>
          </div>
        </div>
      )}
      {rolePicker && (
        <BusRolePicker
          onClose={() => setRolePicker(false)}
          onConfirm={(label) => {
            onRoles([...roles, { id: uid('role'), label }])
            setRolePicker(false)
          }}
        />
      )}
      {printPreview && (
        <BusPrintPreview
          names={seatNames}
          model={coach?.model}
          busName={coach?.name ?? ''}
          plateNo={coach?.plate ?? ''}
          onClose={() => setPrintPreview(false)}
        />
      )}
    </div>
  )
}
