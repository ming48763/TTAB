import { useEffect, useRef, useState } from 'react'

export const BUS_ROLES = ['領隊', '老師', '校長', '主任', '家長', '導遊'] as const
const ITEM = 48

interface Props {
  roles?: readonly string[]
  onConfirm: (role: string) => void
  onClose: () => void
}

export function BusRolePicker({ onConfirm, onClose, roles = BUS_ROLES }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const [index, setIndex] = useState(0)
  const confirmRef = useRef(onConfirm)
  const closeRef = useRef(onClose)
  const rolesRef = useRef(roles)
  confirmRef.current = onConfirm
  closeRef.current = onClose
  rolesRef.current = roles

  function readIndex() {
    const el = scroller.current
    const list = rolesRef.current
    if (!el) return 0
    return Math.max(0, Math.min(list.length - 1, Math.round(el.scrollTop / ITEM)))
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = scroller.current
      if (!el) return
      if (event.key === 'Escape') closeRef.current()
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const next = Math.max(0, Math.min(rolesRef.current.length - 1, readIndex() + (event.key === 'ArrowDown' ? 1 : -1)))
        el.scrollTo({ top: next * ITEM, behavior: 'smooth' })
      }
      if (event.key === 'Enter') confirmRef.current(rolesRef.current[readIndex()] ?? rolesRef.current[0])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="role-wheel-backdrop" onClick={onClose}>
      <div
        className="role-wheel-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bus-role-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="role-wheel-head">
          <button type="button" className="role-wheel-close" aria-label="關閉" onClick={onClose}>
            ×
          </button>
          <h3 id="bus-role-title">新增卡片</h3>
        </header>
        <div className="role-wheel">
          <div className="role-wheel-band" aria-hidden="true" />
          <div
            ref={scroller}
            className="role-wheel-scroller"
            onScroll={() => setIndex(readIndex())}
            onPointerDown={(event) => {
              const el = scroller.current
              if (!el) return
              el.setPointerCapture(event.pointerId)
              drag.current = { y: event.clientY, top: el.scrollTop }
            }}
            onPointerMove={(event) => {
              const el = scroller.current
              if (!drag.current || !el) return
              el.scrollTop = drag.current.top - (event.clientY - drag.current.y)
            }}
            onPointerUp={() => {
              drag.current = null
              const el = scroller.current
              if (!el) return
              el.scrollTo({ top: readIndex() * ITEM, behavior: 'smooth' })
            }}
            onPointerCancel={() => {
              drag.current = null
            }}
          >
            <div className="role-wheel-pad" />
            {roles.map((role, itemIndex) => (
              <button
                key={role}
                type="button"
                className={`role-wheel-item${itemIndex === index ? ' is-selected' : ''}`}
                onClick={() => scroller.current?.scrollTo({ top: itemIndex * ITEM, behavior: 'smooth' })}
              >
                {role}
              </button>
            ))}
            <div className="role-wheel-pad" />
          </div>
        </div>
        <button type="button" className="role-wheel-ok" onClick={() => onConfirm(roles[readIndex()] ?? roles[0])}>
          新增
        </button>
      </div>
    </div>
  )
}
