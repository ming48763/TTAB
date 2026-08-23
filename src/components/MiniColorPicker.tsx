import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

type Props = {
  value: string
  onChange: (hex: string) => void
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function parseHex(hex: string) {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return { r: 26, g: 58, b: 50 }
  return {
    r: parseInt(m[1].slice(0, 2), 16),
    g: parseInt(m[1].slice(2, 4), 16),
    b: parseInt(m[1].slice(4, 6), 16),
  }
}

function toHex(r: number, g: number, b: number) {
  const h = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function rgbToHsv(r: number, g: number, b: number) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return {
    r: (r + m) * 255,
    g: (g + m) * 255,
    b: (b + m) * 255,
  }
}

export default function MiniColorPicker({ value, onChange }: Props) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#1a3a32'
  const rgb = parseHex(hex)
  const [hsv, setHsv] = useState(() => rgbToHsv(rgb.r, rgb.g, rgb.b))
  const hsvRef = useRef(hsv)
  hsvRef.current = hsv
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const drag = useRef<'sv' | 'hue' | null>(null)

  useEffect(() => {
    if (drag.current) return
    const next = parseHex(hex)
    setHsv(rgbToHsv(next.r, next.g, next.b))
  }, [hex])

  function emit(next: { h: number; s: number; v: number }) {
    hsvRef.current = next
    setHsv(next)
    const out = hsvToRgb(next.h, next.s, next.v)
    onChange(toHex(out.r, out.g, out.b))
  }

  function setFromSv(e: ReactPointerEvent | PointerEvent) {
    const el = svRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const s = clamp((e.clientX - box.left) / box.width, 0, 1)
    const v = clamp(1 - (e.clientY - box.top) / box.height, 0, 1)
    emit({ ...hsvRef.current, s, v })
  }

  function setFromHue(e: ReactPointerEvent | PointerEvent) {
    const el = hueRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const h = clamp(((e.clientX - box.left) / box.width) * 360, 0, 359.99)
    emit({ ...hsvRef.current, h })
  }

  function onSvDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = 'sv'
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromSv(e)
  }

  function onHueDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.stopPropagation()
    drag.current = 'hue'
    e.currentTarget.setPointerCapture(e.pointerId)
    setFromHue(e)
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current === 'sv') setFromSv(e)
    if (drag.current === 'hue') setFromHue(e)
  }

  function onUp() {
    drag.current = null
  }

  function setChannel(key: 'r' | 'g' | 'b', raw: string) {
    const n = clamp(Number(raw) || 0, 0, 255)
    const next = { ...rgb, [key]: n }
    onChange(toHex(next.r, next.g, next.b))
  }

  async function pickFromScreen() {
    const Eye = (window as Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper
    if (!Eye) return
    try {
      const result = await new Eye().open()
      onChange(result.sRGBHex.slice(0, 7))
    } catch {
      /* cancelled */
    }
  }

  const hueColor = `hsl(${hsv.h} 100% 50%)`
  const canDrop = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div className="mini-picker" onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={svRef}
        className="mini-picker-sv"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        onPointerDown={onSvDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <span
          className="mini-picker-ring"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div className="mini-picker-row">
        {canDrop ? (
          <button type="button" className="mini-picker-drop" title="取色" onClick={pickFromScreen}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path
                fill="currentColor"
                d="M13.4 1.1a1.5 1.5 0 0 1 2.1 2.1l-1.2 1.2-2.1-2.1 1.2-1.2ZM11.5 3.8 3.2 12.1l-.9 2.6 2.6-.9 8.3-8.3-1.7-1.7Z"
              />
            </svg>
          </button>
        ) : null}
        <span className="mini-picker-preview" style={{ background: hex }} />
        <div
          ref={hueRef}
          className="mini-picker-hue"
          onPointerDown={onHueDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
        >
          <span className="mini-picker-hue-knob" style={{ left: `${(hsv.h / 360) * 100}%` }} />
        </div>
      </div>
      <div className="mini-picker-rgb">
        <label>
          R
          <input type="number" min={0} max={255} value={rgb.r} onChange={(e) => setChannel('r', e.target.value)} />
        </label>
        <label>
          G
          <input type="number" min={0} max={255} value={rgb.g} onChange={(e) => setChannel('g', e.target.value)} />
        </label>
        <label>
          B
          <input type="number" min={0} max={255} value={rgb.b} onChange={(e) => setChannel('b', e.target.value)} />
        </label>
      </div>
    </div>
  )
}
