import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { LayoutItem } from '../types'

export const IMAGE_FRAME_CHOICES = [
  { id: 'circle', label: '圓形' },
  { id: 'rounded', label: '圓角' },
  { id: 'square', label: '方形' },
  { id: 'arch', label: '拱形' },
] as const

export type ImageFrameId = (typeof IMAGE_FRAME_CHOICES)[number]['id']

const FRAME = 220
const PAD = 56

function coverSize(natW: number, natH: number) {
  const scale = Math.max(FRAME / natW, FRAME / natH)
  return { w: natW * scale, h: natH * scale }
}

export function ImageFrameDialog({
  item,
  onCancel,
  onConfirm,
}: {
  item: LayoutItem
  onCancel: () => void
  onConfirm: (patch: Pick<LayoutItem, 'imageFrame' | 'imageFocusX' | 'imageFocusY'>) => void
}) {
  const [shape, setShape] = useState<ImageFrameId>(item.imageFrame ?? 'circle')
  const [focus, setFocus] = useState({ x: item.imageFocusX ?? 50, y: item.imageFocusY ?? 50 })
  const [nat, setNat] = useState({ w: 1, h: 1 })
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => setNat({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 })
    img.src = item.imageSrc ?? ''
  }, [item.imageSrc])

  const photo = coverSize(nat.w, nat.h)
  const extraX = Math.max(0, photo.w - FRAME)
  const extraY = Math.max(0, photo.h - FRAME)
  const left = PAD - extraX * (focus.x / 100)
  const top = PAD - extraY * (focus.y / 100)

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, fx: focus.x, fy: focus.y }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current
    if (!start) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    setFocus({
      x: extraX > 1 ? Math.min(100, Math.max(0, start.fx - (dx / extraX) * 100)) : 50,
      y: extraY > 1 ? Math.min(100, Math.max(0, start.fy - (dy / extraY) * 100)) : 50,
    })
  }

  function onPointerUp() {
    drag.current = null
  }

  return (
    <div
      className="seat-notice image-frame-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-frame-title"
      onPointerDown={(e) => {
        e.stopPropagation()
        e.nativeEvent.stopImmediatePropagation()
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        className="seat-notice-card image-frame-card"
        onSubmit={(e) => {
          e.preventDefault()
          onConfirm({ imageFrame: shape, imageFocusX: focus.x, imageFocusY: focus.y })
        }}
      >
        <h3 id="image-frame-title">外框</h3>
        <div className="image-frame-shapes">
          {IMAGE_FRAME_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={shape === choice.id ? 'is-active' : ''}
              onClick={() => setShape(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div
          className="image-frame-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="image-frame-photo" style={{ width: photo.w, height: photo.h, left, top }}>
            <img src={item.imageSrc} alt="" draggable={false} />
          </div>
          <div className={`image-frame-hole is-${shape}`} />
        </div>
        <div className="seat-notice-actions">
          <button type="button" className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onConfirm({ imageFrame: undefined, imageFocusX: 50, imageFocusY: 50 })}
          >
            無
          </button>
          <button type="submit" className="btn primary">
            確認
          </button>
        </div>
      </form>
    </div>
  )
}
