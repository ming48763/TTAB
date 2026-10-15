import { useState, type DragEvent } from 'react'
import { busPlan } from '../lib/busLayout'
import { type SeatInkStyle } from '../lib/seating'

interface Props {
  names: Record<string, string>
  model?: string
  inkStyle?: SeatInkStyle
  interactive?: boolean
  onSeatDrop?: (seatId: string, event: DragEvent) => void
  onSeatDragStart?: (seatId: string, event: DragEvent) => void
}

export function BusChart({
  names,
  model,
  inkStyle = 'color',
  interactive = false,
  onSeatDrop,
  onSeatDragStart,
}: Props) {
  const [hotSeat, setHotSeat] = useState<string | null>(null)
  const plan = busPlan(model)

  return (
    <div
      className={`bus-chart is-ink-${inkStyle}`}
      data-bus-model={plan.id}
      style={{ ['--bus-aspect' as string]: String(plan.aspect) }}
      aria-label="遊覽車座位表，第一排在上"
    >
      <div className="bus-hull">
        <div className="bus-rail is-left" aria-hidden>
          {plan.rowLabels.filter((label) => label.side === 'left').map((label) => (
            <span key={label.text} className="bus-row-label" style={{ top: `${label.y}%` }}>
              {label.text}
            </span>
          ))}
        </div>
        <div className="bus-body">
          {plan.doors.map((door) => (
            <span
              key={door.name}
              className="bus-door"
              style={{ left: `${door.x}%`, top: `${door.y}%`, width: `${door.w}%`, height: `${door.h}%` }}
            >
              {door.name}
            </span>
          ))}
          {plan.aisle.map((mark) => (
            <span
              key={mark.text}
              className="bus-aisle-mark"
              style={{ top: `${mark.y}%`, left: mark.x == null ? undefined : `${mark.x}%` }}
            >
              {mark.text}
            </span>
          ))}
          {plan.seats.map((seat) => {
            const name = names[seat.id]
            return (
              <div
                key={seat.id}
                className={`bus-seat ${name ? 'is-filled' : ''} ${hotSeat === seat.id ? 'is-hot' : ''}`}
                style={{ left: `${seat.x}%`, top: `${seat.y}%`, width: `${plan.seatW}%`, height: `${plan.seatH}cqh` }}
                title={name ? `${seat.code} ${name}` : seat.code}
                onDragOver={
                  onSeatDrop
                    ? (event) => {
                        event.preventDefault()
                        setHotSeat(seat.id)
                      }
                    : undefined
                }
                onDragLeave={
                  onSeatDrop
                    ? (event) => {
                        const next = event.relatedTarget as Node | null
                        if (!event.currentTarget.contains(next)) {
                          setHotSeat((cur) => (cur === seat.id ? null : cur))
                        }
                      }
                    : undefined
                }
                onDrop={
                  onSeatDrop
                    ? (event) => {
                        event.preventDefault()
                        setHotSeat(null)
                        onSeatDrop(seat.id, event)
                      }
                    : undefined
                }
              >
                {name ? (
                  <span
                    className="bus-seat-name"
                    draggable={interactive}
                    onDragStart={(event) => {
                      if (!interactive) return
                      onSeatDragStart?.(seat.id, event)
                    }}
                    onDragEnd={() => setHotSeat(null)}
                  >
                    {name.split('\n').map((line, index, lines) => (
                      <span
                        key={`${seat.id}-${index}`}
                        style={{
                          ['--name-count' as string]: String(Math.max([...line.replace(/[ \n]/g, '')].length, 3)),
                          ['--name-lines' as string]: String(Math.max(lines.length, 1)),
                        }}
                      >
                        {line}
                      </span>
                    ))}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
        <div className="bus-rail is-right" aria-hidden>
          {plan.rowLabels.filter((label) => label.side === 'right').map((label) => (
            <span key={label.text} className="bus-row-label" style={{ top: `${label.y}%` }}>
              {label.text}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
