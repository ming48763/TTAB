import { useEffect, useRef, useState, type DragEvent } from 'react'
import { BusRolePicker } from './BusRolePicker'
import { BrandMark } from './BrandMark'
import { roomSlotColumns, type RoomUnit } from '../lib/roomPlan'
import {
  ROOM_SHEET_SUFFIX,
  buildRoomExport,
  exportRoomExcel,
  roomFileBase,
  roomPdfGrid,
  roomSheetTitle,
  type RoomExportLine,
} from '../lib/roomExport'
import { studentCardLines, studentKey } from '../lib/seating'
import type { ColumnMapping, StudentRow } from '../types'
import { uid } from '../types'

const ROOM_ROLES = ['老師', '校長', '主任', '家長'] as const

export type RoomPerson = { id: string; label: string }

interface Props {
  rows: StudentRow[]
  mappings: ColumnMapping[]
  rooms: RoomUnit[]
  roles: RoomPerson[]
  onRooms: (next: RoomUnit[]) => void
  onRoles: (next: RoomPerson[]) => void
  onBack: () => void
  onHome: () => void
}

export function RoomBoard({ rows, mappings, rooms, roles, onRooms, onRoles, onBack, onHome }: Props) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [hotSlot, setHotSlot] = useState<string | null>(null)
  const [rolePicker, setRolePicker] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPrefix, setExportPrefix] = useState('')
  const [showLeader, setShowLeader] = useState(false)
  const [exportBusy, setExportBusy] = useState<'xlsx' | 'pdf' | null>(null)
  const [pdfJob, setPdfJob] = useState<string | null>(null)
  const pdfHostRef = useRef<HTMLDivElement>(null)
  const [shownFields, setShownFields] = useState<string[]>(() => {
    const names = mappings.filter((mapping) => mapping.role === 'name').map((mapping) => mapping.header)
    if (names.length) return names
    const named = mappings.find((mapping) => /姓名|名字/.test(mapping.header) || /姓名|名字/.test(mapping.label))
    return named ? [named.header] : mappings[0] ? [mappings[0].header] : []
  })

  const taken = new Set(rooms.flatMap((room) => room.slots.map((slot) => slot.personId).filter((id): id is string => Boolean(id))))
  const pool = rows.filter((row) => !taken.has(studentKey(row)))
  const poolRoles = roles.filter((role) => !taken.has(role.id))

  function readDrag(event: DragEvent) {
    return event.dataTransfer.getData('text/plain') || dragId
  }

  function personLines(id: string) {
    const role = roles.find((item) => item.id === id)
    if (role) return [{ text: role.label, isName: true, scale: role.label.length <= 3 ? 1 : 3 / role.label.length }]
    const row = rows.find((item) => studentKey(item) === id)
    if (!row) return []
    return studentCardLines(row, mappings, shownFields)
  }

  function place(slotId: string, personId: string) {
    let displaced: string | null = null
    let fromSlot: string | null = null
    for (const room of rooms) {
      for (const slot of room.slots) {
        if (slot.id === slotId) displaced = slot.personId
        if (slot.personId === personId) fromSlot = slot.id
      }
    }
    if (fromSlot === slotId) return
    onRooms(
      rooms.map((room) => ({
        ...room,
        slots: room.slots.map((slot) => {
          if (slot.id === slotId) return { ...slot, personId }
          if (fromSlot && slot.id === fromSlot) return { ...slot, personId: displaced }
          return slot
        }),
      })),
    )
  }

  function personName(id: string) {
    return personLines(id)
      .map((line) => line.text)
      .join(' ')
  }

  const exportTitle = roomSheetTitle(exportPrefix)
  const exportLines: RoomExportLine[] = buildRoomExport(
    rooms.map((room) => ({
      title: room.title,
      names: room.slots.flatMap((slot, index) => {
        if (!slot.personId) return []
        const name = personName(slot.personId)
        return [index === 0 && showLeader ? `房長 ${name}` : name]
      }),
    })),
  )

  useEffect(() => {
    if (!pdfJob) return
    const host = pdfHostRef.current
    if (!host) return
    let cancelled = false
    const run = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
      if (cancelled) return
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
        const sheet = host.querySelector<HTMLElement>('.sweep-export-page')
        if (!sheet) return
        const canvas = await html2canvas(sheet, { scale: 2, backgroundColor: '#ffffff', logging: false })
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const img = canvas.toDataURL('image/jpeg', 0.93)
        const pageW = 210
        const pageH = 297
        const imgH = (canvas.height / canvas.width) * pageW
        if (imgH <= pageH) pdf.addImage(img, 'JPEG', 0, 0, pageW, imgH)
        else {
          const fit = pageH / imgH
          pdf.addImage(img, 'JPEG', (pageW - pageW * fit) / 2, 0, pageW * fit, pageH)
        }
        pdf.save(`${roomFileBase(pdfJob)}.pdf`)
        if (!cancelled) {
          setPdfJob(null)
          setExportBusy(null)
          setExportOpen(false)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setPdfJob(null)
          setExportBusy(null)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pdfJob])

  function clearPerson(personId: string) {
    onRooms(
      rooms.map((room) => ({
        ...room,
        slots: room.slots.map((slot) => (slot.personId === personId ? { ...slot, personId: null } : slot)),
      })),
    )
  }

  async function downloadExcel() {
    if (exportBusy) return
    setExportBusy('xlsx')
    try {
      await exportRoomExcel(exportLines, exportTitle)
      setExportOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setExportBusy(null)
    }
  }

  function downloadPdf() {
    if (exportBusy) return
    setExportBusy('pdf')
    setPdfJob(exportTitle)
  }

  function fillRandom() {
    const empty = rooms.flatMap((room) => room.slots.filter((slot) => !slot.personId))
    const waiting = [...pool.map((row) => studentKey(row)), ...poolRoles.map((role) => role.id)]
    if (empty.length === 0 || waiting.length === 0) return
    for (let i = waiting.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const swap = waiting[i]
      waiting[i] = waiting[j]
      waiting[j] = swap
    }
    const count = Math.min(empty.length, waiting.length)
    const assigned = new Map(empty.slice(0, count).map((slot, index) => [slot.id, waiting[index]]))
    onRooms(
      rooms.map((room) => ({
        ...room,
        slots: room.slots.map((slot) => (assigned.has(slot.id) ? { ...slot, personId: assigned.get(slot.id) ?? null } : slot)),
      })),
    )
  }

  function startDrag(id: string, event: DragEvent) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    setDragId(id)
  }

  return (
    <div className="sweep-board room-board">
      <header className="site-header no-print seat-work-head">
        <div className="brand">
          <BrandMark size="sm" onHome={onHome} />
          <div>
            <h1>排房間大師</h1>
          </div>
        </div>
        <div className="sweep-head-actions">
          <button type="button" className="btn" onClick={onBack}>
            返回房間
          </button>
          <button type="button" className="btn primary" onClick={() => setExportOpen(true)} disabled={exportBusy !== null}>
            匯出
          </button>
        </div>
      </header>
      <div className="sweep-toolbar no-print">
        <div className="sweep-toolbar-actions">
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
            一鍵排列
          </button>
          <button
            type="button"
            className="seat-random-btn"
            onClick={() => {
              if (taken.size === 0) return
              onRooms(
                rooms.map((room) => ({
                  ...room,
                  slots: room.slots.map((slot) => ({ ...slot, personId: null })),
                })),
              )
            }}
          >
            清空
          </button>
        </div>
      </div>
      <div className="sweep-body">
        <section className="sweep-zone is-duty" aria-label="房間分配">
          <div className="sweep-tabs">
            <div className="sweep-tab is-current">房間分配</div>
          </div>
          <div className="sweep-folder-board">
            {rooms.map((room) => (
              <article key={room.id} className="sweep-folder room-folder">
                <header className="sweep-folder-head">
                  <input
                    className="sweep-folder-title"
                    aria-label="房號"
                    value={room.title}
                    onChange={(event) =>
                      onRooms(rooms.map((item) => (item.id === room.id ? { ...item, title: event.target.value } : item)))
                    }
                  />
                </header>
                <div className={`sweep-folder-body ${roomSlotColumns(room.capacity) === 4 ? 'is-wide' : 'is-compact'}`}>
                  {room.slots.map((slot, index) => {
                    const lines = slot.personId ? personLines(slot.personId) : []
                    return (
                      <div
                        key={slot.id}
                        className={`room-slot booth-drag-card seat-pool-card${index === 0 ? ' is-lead' : ''}${slot.personId ? ' is-filled' : ''}${hotSlot === slot.id ? ' is-hot' : ''}`}
                        draggable={Boolean(slot.personId)}
                        onDragStart={(event) => {
                          if (!slot.personId) {
                            event.preventDefault()
                            return
                          }
                          startDrag(slot.personId, event)
                        }}
                        onDragEnd={() => setDragId(null)}
                        onDragOver={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          setHotSlot(slot.id)
                        }}
                        onDragLeave={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                            setHotSlot((cur) => (cur === slot.id ? null : cur))
                          }
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          const key = readDrag(event)
                          setHotSlot(null)
                          setDragId(null)
                          if (key) place(slot.id, key)
                        }}
                      >
                        {slot.personId ? (
                          <span className="seat-name-stack">
                            {lines.map((line, index) => (
                              <span
                                key={`${slot.id}-${index}`}
                                className={line.isName ? 'seat-name' : 'seat-card-meta'}
                                style={line.isName ? { ['--name-scale' as string]: String(line.scale) } : undefined}
                              >
                                {line.text}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </article>
            ))}
          </div>
        </section>
        <aside
          className="sweep-zone is-pool"
          aria-label="名單"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const key = readDrag(event)
            setDragId(null)
            if (key) clearPerson(key)
          }}
        >
          <div className="sweep-tabs">
            <div className="sweep-tab is-current">
              名單
              <span className="sweep-tab-count">{pool.length + poolRoles.length}</span>
            </div>
          </div>
          <div className="sweep-zone-list">
            {pool.map((row) => {
              const key = studentKey(row)
              const lines = studentCardLines(row, mappings, shownFields)
              return (
                <div
                  key={key}
                  className="booth-drag-card seat-pool-card"
                  draggable
                  onDragStart={(event) => startDrag(key, event)}
                  onDragEnd={() => setDragId(null)}
                >
                  <span className="seat-name-stack">
                    {lines.map((line, index) => (
                      <span
                        key={`${key}-${index}`}
                        className={line.isName ? 'seat-name' : 'seat-card-meta'}
                        style={line.isName ? { ['--name-scale' as string]: String(line.scale) } : undefined}
                      >
                        {line.text}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
            {poolRoles.map((role) => (
              <div
                key={role.id}
                className="booth-drag-card seat-pool-card"
                draggable
                onDragStart={(event) => startDrag(role.id, event)}
                onDragEnd={() => setDragId(null)}
              >
                <span className="seat-name-stack">
                  <span className="seat-name">{role.label}</span>
                </span>
              </div>
            ))}
            <button type="button" className="booth-drag-card seat-pool-card seat-pool-add" onClick={() => setRolePicker(true)}>
              +
            </button>
          </div>
        </aside>
      </div>
      {rolePicker && (
        <BusRolePicker
          roles={ROOM_ROLES}
          onClose={() => setRolePicker(false)}
          onConfirm={(label) => {
            onRoles([...roles, { id: uid('role'), label }])
            setRolePicker(false)
          }}
        />
      )}
      {exportOpen ? (
        <div className="seat-notice" role="dialog" aria-modal="true" aria-labelledby="room-export-title">
          <div className="seat-notice-card sweep-export-card">
            <h3 id="room-export-title">匯出房間分配表</h3>
            <label className="sweep-export-field">
              <span className="sweep-export-name">
                <input
                  value={exportPrefix}
                  onChange={(event) => setExportPrefix(event.target.value)}
                  placeholder="例如四年三班"
                  aria-label="標題前綴"
                />
                <span>{ROOM_SHEET_SUFFIX}</span>
              </span>
            </label>
            <label className="room-export-leader">
              <input
                type="checkbox"
                checked={showLeader}
                onChange={(event) => setShowLeader(event.target.checked)}
                disabled={exportBusy !== null}
              />
              <span>顯示房長</span>
            </label>
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setExportOpen(false)} disabled={exportBusy !== null}>
                取消
              </button>
              <button type="button" className="btn primary" onClick={() => void downloadExcel()} disabled={exportBusy !== null}>
                {exportBusy === 'xlsx' ? '匯出中…' : 'Excel'}
              </button>
              <button type="button" className="btn primary" onClick={downloadPdf} disabled={exportBusy !== null}>
                {exportBusy === 'pdf' ? '匯出中…' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <div ref={pdfHostRef} className="sweep-export-host" aria-hidden="true">
        {pdfJob ? (
          <section className="sweep-export-page">
            <h1>{pdfJob}</h1>
            {rooms.map((room) => {
              const names = room.slots.map((slot, index) => {
                if (!slot.personId) return ''
                const name = personName(slot.personId)
                return index === 0 && showLeader ? `房長 ${name}` : name
              })
              const grid = roomPdfGrid(names, room.capacity)
              return (
                <div key={room.id} className="room-export-block">
                  <h2>{room.title}</h2>
                  <table className="room-export-grid">
                    <tbody>
                      {grid.map((gridRow, rowIndex) => (
                        <tr key={rowIndex}>
                          {gridRow.map((name, colIndex) => (
                            <td key={colIndex}>{name}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </section>
        ) : null}
      </div>
    </div>
  )
}
