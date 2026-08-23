import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { PlateFace } from './PlateCard'
import type { LayoutSettings, StudentRow } from '../types'

const MM_PX = 3.7795275591

interface Props {
  settings: LayoutSettings
  student: StudentRow | null
  movable?: boolean
  highlightIds?: string[]
  hotGhost?: { x: number; y: number } | null
}

function MiniFace({
  settings,
  student,
  widthPx,
  highlightIds,
  hotGhost,
}: {
  settings: LayoutSettings
  student: StudentRow | null
  widthPx: number
  highlightIds?: string[]
  hotGhost?: { x: number; y: number } | null
}) {
  const scale = widthPx / Math.max(settings.widthMm * MM_PX, 1)

  return (
    <div className="mini-face" style={{ width: widthPx, height: settings.faceHeightMm * MM_PX * scale }}>
      <div
        className="mini-face-scale"
        style={{
          width: `${settings.widthMm}mm`,
          height: `${settings.faceHeightMm}mm`,
          transform: `scale(${scale})`,
        }}
      >
        <PlateFace settings={settings} student={student} highlightIds={highlightIds} hotGhost={hotGhost} />
      </div>
    </div>
  )
}

export function StandPreview({ settings, student, movable = true, highlightIds, hotGhost }: Props) {
  const isDesk = settings.mode === 'desk'
  const faceW = isDesk ? 168 : 176
  const aspect = settings.faceHeightMm / Math.max(settings.widthMm, 1)
  const faceH = Math.max(28, Math.min(78, aspect * faceW))
  const flapH = faceH * 0.5
  const boxRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{
    startX: number
    startY: number
    origLeft: number
    origTop: number
  } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [follow, setFollow] = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const movedRef = useRef(false)
  movedRef.current = pos !== null

  useEffect(() => {
    if (!movable) return
    if (movedRef.current) return
    const box = boxRef.current
    const stage = box?.closest('.editor-stage') as HTMLElement | null
    if (!box || !stage) return

    function pinToView() {
      if (movedRef.current || dragRef.current) return
      const el = boxRef.current
      const canvas = el?.closest('.editor-stage') as HTMLElement | null
      if (!el || !canvas) return
      const rect = canvas.getBoundingClientRect()
      const toolbar = document.querySelector('.editor-toolbar')
      const toolBottom = toolbar?.getBoundingClientRect().bottom ?? 0
      const minTop = Math.max(rect.top + 10, toolBottom + 10)
      const left = rect.right - el.offsetWidth - 14
      const top = Math.min(rect.bottom - el.offsetHeight - 8, minTop)
      setFollow({ left, top })
    }

    pinToView()
    window.addEventListener('scroll', pinToView, { passive: true, capture: true })
    window.addEventListener('resize', pinToView)
    stage.addEventListener('scroll', pinToView, { passive: true })
    const ro = new ResizeObserver(pinToView)
    ro.observe(stage)
    return () => {
      window.removeEventListener('scroll', pinToView, true)
      window.removeEventListener('resize', pinToView)
      stage.removeEventListener('scroll', pinToView)
      ro.disconnect()
    }
  }, [pos, movable])

  useEffect(() => {
    if (!movable) return
    function onMove(e: PointerEvent) {
      const drag = dragRef.current
      const box = boxRef.current
      if (!drag || !box) return
      if ((e.buttons & 1) === 0) {
        dragRef.current = null
        setDragging(false)
        return
      }
      const maxLeft = Math.max(8, window.innerWidth - box.offsetWidth - 8)
      const maxTop = Math.max(8, window.innerHeight - box.offsetHeight - 8)
      const left = Math.min(maxLeft, Math.max(8, drag.origLeft + (e.clientX - drag.startX)))
      const top = Math.min(maxTop, Math.max(8, drag.origTop + (e.clientY - drag.startY)))
      setPos({ left, top })
    }

    function onUp() {
      if (!dragRef.current) return
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
  }, [])

  function onDragStart(e: ReactPointerEvent) {
    if (!movable) return
    if (e.button !== 0) return
    const box = boxRef.current
    if (!box) return
    e.preventDefault()
    e.stopPropagation()
    const boxRect = box.getBoundingClientRect()
    const origLeft = boxRect.left
    const origTop = boxRect.top
    dragRef.current = { startX: e.clientX, startY: e.clientY, origLeft, origTop }
    setPos({ left: origLeft, top: origTop })
    setDragging(true)
  }

  return (
    <aside
      ref={boxRef}
      className={`stand-preview ${movable ? 'is-docked' : 'is-static'} ${pos ? 'is-moved' : ''} ${dragging ? 'is-dragging' : ''}`}
      aria-label="折起立起預覽"
      style={
        movable
          ? pos
            ? { left: pos.left, top: pos.top }
            : follow
              ? { left: follow.left, top: follow.top }
              : undefined
          : undefined
      }
    >
      <header className="stand-preview-head" onPointerDown={onDragStart}>
        <strong>立起預覽</strong>
      </header>
      <div className="stand-viewport">
        <div className="stand-wood" aria-hidden />
        {isDesk ? (
          <div
            className="tent-3d"
            style={
              {
                '--fw': `${faceW}px`,
                '--fh': `${faceH}px`,
                '--flap': `${flapH}px`,
              } as CSSProperties
            }
          >
            <div className="tent-panel tent-back" aria-hidden>
              <div className="tent-flap tent-flap-back" />
            </div>
            <div className="tent-panel tent-front">
              <MiniFace settings={settings} student={student} widthPx={faceW} highlightIds={highlightIds} hotGhost={hotGhost} />
              <div className="tent-flap tent-flap-front" aria-hidden />
            </div>
          </div>
        ) : (
          <div className="stand-card-iso">
            <MiniFace settings={settings} student={student} widthPx={faceW} highlightIds={highlightIds} hotGhost={hotGhost} />
          </div>
        )}
      </div>
    </aside>
  )
}
