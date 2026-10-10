import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SeatingClassroom } from './SeatingClassroom'
import { fitPreviewRow } from '../lib/fitPreviewChrome'
import type { ClassroomDoor, RoomShape, SeatGroupMode, SeatInkStyle, SeatSpot } from '../lib/seating'
import { SEAT_INK_STYLES } from '../lib/seating'

type PaperDir = 'portrait' | 'landscape'

interface Props {
  shape: RoomShape
  rows: number
  cols: number
  mode: SeatGroupMode
  seats: SeatSpot[]
  doors: ClassroomDoor[]
  seatNames: Record<string, string>
  onClose: () => void
}

function paperMm(dir: PaperDir) {
  return dir === 'portrait' ? { w: 210, h: 297 } : { w: 297, h: 210 }
}

function dateStamp() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PAINT_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'textDecorationColor',
  'webkitTextStrokeColor',
] as const

function sampleRgba(ctx: CanvasRenderingContext2D, raw: string) {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  if (a >= 255) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`
}

function replaceModernColor(ctx: CanvasRenderingContext2D, value: string) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const head = /^(?:color-mix|color|oklch|oklab|lab|lch)\(/.exec(value.slice(i))
    if (!head) {
      out += value[i]
      continue
    }
    let depth = 0
    let j = i
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++
      else if (value[j] === ')') {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
    }
    out += sampleRgba(ctx, value.slice(i, j))
    i = j - 1
  }
  return out
}

/** html2canvas 1.4 cannot parse color() / color-mix() from computed styles. */
function bakePaint(root: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  const nodes = [root, ...root.querySelectorAll<HTMLElement>('*')]
  for (const el of nodes) {
    const cs = getComputedStyle(el)
    for (const prop of PAINT_PROPS) {
      const raw = cs[prop]
      if (!raw || !raw.includes('color(')) continue
      el.style[prop] = sampleRgba(ctx, raw)
    }
    for (const prop of ['boxShadow', 'textShadow', 'backgroundImage'] as const) {
      const raw = cs[prop]
      if (!raw || raw === 'none' || !raw.includes('color(')) continue
      el.style[prop] = replaceModernColor(ctx, raw)
    }
  }
}

function RoomPage({
  shape,
  rows,
  cols,
  mode,
  seats,
  doors,
  seatNames,
  teacherView,
  hideEmpty,
  emptyMode,
  inkStyle,
}: Omit<Props, 'onClose'> & {
  teacherView?: boolean
  hideEmpty?: boolean
  emptyMode?: 'hide' | 'auto' | 'keep'
  inkStyle?: SeatInkStyle
}) {
  return (
    <div className="seat-print-sheet-inner">
      <SeatingClassroom
        shape={shape}
        rows={rows}
        cols={cols}
        mode={mode}
        seats={seats}
        doors={doors}
        seatNames={seatNames}
        teacherView={teacherView}
        hideEmpty={hideEmpty}
        emptyMode={emptyMode}
        inkStyle={inkStyle}
      />
    </div>
  )
}

export function SeatingPrintPreview({
  shape,
  rows,
  cols,
  mode,
  seats,
  doors,
  seatNames,
  onClose,
}: Props) {
  const lockedDir: PaperDir | null =
    shape === 'landscape' ? 'landscape' : shape === 'portrait' ? 'portrait' : null
  const [squareDir, setSquareDir] = useState<PaperDir>('portrait')
  const [teacherView, setTeacherView] = useState(false)
  const [emptyMode, setEmptyMode] = useState<'hide' | 'auto' | 'keep'>('hide')
  const [inkStyle, setInkStyle] = useState<SeatInkStyle>('color')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [scale, setScale] = useState(0.32)
  const [framePx, setFramePx] = useState({ w: 210, h: 297 })
  const paperDir = lockedDir ?? squareDir
  const paper = paperMm(paperDir)
  const pages = teacherView ? [false, true] : [false]
  const stageRef = useRef<HTMLDivElement>(null)
  const barFitRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const pdfSourceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useLayoutEffect(() => {
    function fitScale() {
      const stage = stageRef.current
      const sheet = sheetRef.current
      if (!stage || !sheet) return
      const naturalW = sheet.offsetWidth
      const naturalH = sheet.offsetHeight
      if (naturalW <= 0 || naturalH <= 0) return
      const count = teacherView ? 2 : 1
      const gap = count > 1 ? 28 : 0
      const stageStyle = getComputedStyle(stage)
      const padX =
        (Number.parseFloat(stageStyle.paddingLeft) || 0) + (Number.parseFloat(stageStyle.paddingRight) || 0)
      const padY =
        (Number.parseFloat(stageStyle.paddingTop) || 0) + (Number.parseFloat(stageStyle.paddingBottom) || 0)
      const availW = Math.max(0, (stage.clientWidth - padX - gap) / count)
      const availH = Math.max(0, stage.clientHeight - padY)
      if (availW <= 0 || availH <= 0) return
      const next = Math.min(availW / naturalW, availH / naturalH, 1)
      const frameW = Math.round(naturalW * next)
      const used = frameW / naturalW
      const frameH = Math.round(naturalH * used)
      setScale((prev) => (Math.abs(used - prev) > 0.004 ? used : prev))
      setFramePx((prev) => (prev.w === frameW && prev.h === frameH ? prev : { w: frameW, h: frameH }))
    }
    fitScale()
    window.addEventListener('resize', fitScale)
    const ro = new ResizeObserver(fitScale)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => {
      window.removeEventListener('resize', fitScale)
      ro.disconnect()
    }
  }, [paper.w, paper.h, teacherView, emptyMode, inkStyle])

  useLayoutEffect(() => {
    function fitChrome() {
      fitPreviewRow(barFitRef.current, 'spread')
    }
    fitChrome()
    window.addEventListener('resize', fitChrome)
    const ro = new ResizeObserver(fitChrome)
    const parent = barFitRef.current?.parentElement
    if (parent) ro.observe(parent)
    return () => {
      window.removeEventListener('resize', fitChrome)
      ro.disconnect()
    }
  }, [paperDir, teacherView, emptyMode, inkStyle, pdfBusy, lockedDir])

  const downloadPdf = useCallback(() => {
    if (pdfBusy) return
    setPdfBusy(true)
  }, [pdfBusy])

  useEffect(() => {
    if (!pdfBusy) return
    const host = pdfSourceRef.current
    if (!host) return
    let cancelled = false
    const run = async () => {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
      if (cancelled) return
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
          import('html2canvas'),
          import('jspdf'),
        ])
        const sheets = Array.from(host.querySelectorAll<HTMLElement>('.seat-print-pdf-page'))
        if (!sheets.length) return
        const landscape = paperDir === 'landscape'
        const pdf = new jsPDF({
          orientation: landscape ? 'landscape' : 'portrait',
          unit: 'mm',
          format: 'a4',
        })
        for (let i = 0; i < sheets.length; i++) {
          if (cancelled) return
          bakePaint(sheets[i])
          const canvas = await html2canvas(sheets[i], {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
          })
          const img = canvas.toDataURL('image/jpeg', 0.93)
          if (i > 0) pdf.addPage('a4', landscape ? 'landscape' : 'portrait')
          pdf.addImage(img, 'JPEG', 0, 0, paper.w, paper.h)
        }
        pdf.save(`排座位大師_座位表_${dateStamp()}.pdf`)
      } catch (err) {
        console.error(err)
      } finally {
        if (!cancelled) setPdfBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pdfBusy, paper.w, paper.h, paperDir])

  const roomProps = {
    shape,
    rows,
    cols,
    mode,
    seats,
    doors,
    seatNames,
    emptyMode,
    inkStyle,
  }

  return (
    <div
      className={`seat-print-preview is-a4-${paperDir}`}
      style={{ ['--print-scale' as string]: String(scale) }}
    >
      <style>{`@media print { @page { size: A4 ${paperDir}; margin: 0; } }`}</style>
      <header className="seat-print-bar no-print">
        <div className="preview-fit-row" ref={barFitRef}>
        <div className="seat-print-paper">
          <span className="toolbar-label">印出尺寸</span>
          {lockedDir ? (
            <div className="seg">
              <button type="button" className="is-active" disabled>
                A4 {lockedDir === 'portrait' ? '直向' : '橫向'}
              </button>
            </div>
          ) : (
            <div className="seg">
              <button
                type="button"
                className={squareDir === 'portrait' ? 'is-active' : ''}
                onClick={() => setSquareDir('portrait')}
              >
                A4 直向
              </button>
              <button
                type="button"
                className={squareDir === 'landscape' ? 'is-active' : ''}
                onClick={() => setSquareDir('landscape')}
              >
                A4 橫向
              </button>
            </div>
          )}
        </div>
        <div className="seat-print-paper">
          <span className="toolbar-label">樣式</span>
          <div className="toolbar-drop seat-style-drop">
            <button type="button" className="toolbar-drop-btn">
              {SEAT_INK_STYLES.find((s) => s.id === inkStyle)?.label ?? '預設'}
            </button>
            <div className="toolbar-drop-menu">
              {SEAT_INK_STYLES.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={inkStyle === opt.id ? 'is-active' : ''}
                  onClick={() => setInkStyle(opt.id)}
                >
                  <span className="seat-style-swatch" style={{ background: opt.swatch }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className={`seat-print-teacher ${teacherView ? 'is-on' : ''}`}
          aria-pressed={teacherView}
          onClick={() => setTeacherView((v) => !v)}
        >
          老師視角
        </button>
        <div className="seat-print-paper">
          <span className="toolbar-label">空位顯示</span>
          <div className="toolbar-drop seat-empty-drop">
            <button type="button" className="toolbar-drop-btn">
              {emptyMode === 'hide' ? '隱藏空位' : emptyMode === 'auto' ? '自動調整' : '保留空位'}
            </button>
            <div className="toolbar-drop-menu">
              <button
                type="button"
                className={emptyMode === 'hide' ? 'is-active' : ''}
                onClick={() => setEmptyMode('hide')}
              >
                隱藏空位
              </button>
              <button
                type="button"
                className={emptyMode === 'auto' ? 'is-active' : ''}
                onClick={() => setEmptyMode('auto')}
              >
                自動調整
              </button>
              <button
                type="button"
                className={emptyMode === 'keep' ? 'is-active' : ''}
                onClick={() => setEmptyMode('keep')}
              >
                保留空位
              </button>
            </div>
          </div>
        </div>
        <div className="seat-print-actions">
          <button type="button" className="btn" onClick={onClose}>
            返回編輯
          </button>
          <button type="button" className="btn" disabled={pdfBusy} onClick={downloadPdf}>
            {pdfBusy ? '匯出中…' : '下載為PDF'}
          </button>
          <button type="button" className="btn primary" onClick={() => window.print()}>
            開始列印
          </button>
        </div>
        </div>
      </header>
      <div className={`seat-print-stage${teacherView ? ' is-pair' : ''}`} ref={stageRef}>
        {pages.map((isTeacher) => (
          <div
            key={isTeacher ? 'teacher' : 'student'}
            className="pages-preview-frame"
            style={{
              width: `${framePx.w}px`,
              height: `${framePx.h}px`,
            }}
          >
            <div
              ref={isTeacher ? undefined : sheetRef}
              className="seat-print-sheet pages-preview-sheet"
              style={{
                width: `${paper.w}mm`,
                height: `${paper.h}mm`,
                transform: `scale(${scale})`,
              }}
            >
              <RoomPage {...roomProps} teacherView={isTeacher} />
            </div>
          </div>
        ))}
      </div>
      {pdfBusy && (
        <div className="pages-pdf-source" ref={pdfSourceRef} aria-hidden>
          {pages.map((isTeacher) => (
            <div
              key={isTeacher ? 'pdf-t' : 'pdf-s'}
              className="seat-print-pdf-page"
              style={{ width: `${paper.w}mm`, height: `${paper.h}mm` }}
            >
              <RoomPage {...roomProps} teacherView={isTeacher} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
