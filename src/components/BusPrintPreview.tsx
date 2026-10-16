import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { captureSheet } from '../lib/captureSheet'
import { savePdfFile } from '../lib/savePdf'
import { fitPreviewRow } from '../lib/fitPreviewChrome'
import { SEAT_INK_STYLES, type SeatInkStyle } from '../lib/seating'
import { BusChart } from './BusChart'
import { downloadBusExcel } from '../lib/busExcel'

type PaperDir = 'portrait' | 'landscape'

interface Props {
  names: Record<string, string>
  model?: string
  busName: string
  plateNo: string
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

function BusPage({
  names,
  model,
  inkStyle,
  busName,
  plateNo,
}: {
  names: Record<string, string>
  model?: string
  inkStyle: SeatInkStyle
  busName: string
  plateNo: string
}) {
  const passengerCount = Object.values(names).filter((name) => name.trim()).length
  return (
    <div className="bus-print-page">
      <h2>遊覽車座位表</h2>
      <div className="bus-print-id">
        <span>車輛名稱：{busName}</span>
        <span>車牌：{plateNo}</span>
        <span>人數：{passengerCount}</span>
      </div>
      <div className="bus-print-fit">
        <BusChart names={names} model={model} inkStyle={inkStyle} />
      </div>
    </div>
  )
}

export function BusPrintPreview({ names, model, busName, plateNo, onClose }: Props) {
  const [paperDir, setPaperDir] = useState<PaperDir>('portrait')
  const [inkStyle, setInkStyle] = useState<SeatInkStyle>('color')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [exportChoice, setExportChoice] = useState<null | 'download' | 'print'>(null)
  const [scale, setScale] = useState(0.32)
  const [framePx, setFramePx] = useState({ w: 297, h: 210 })
  const paper = paperMm(paperDir)
  const stageRef = useRef<HTMLDivElement>(null)
  const barFitRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const pdfSourceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (exportChoice) {
        setExportChoice(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, exportChoice])

  useLayoutEffect(() => {
    function fitScale() {
      const stage = stageRef.current
      const sheet = sheetRef.current
      if (!stage || !sheet) return
      const naturalW = sheet.offsetWidth
      const naturalH = sheet.offsetHeight
      if (naturalW <= 0 || naturalH <= 0) return
      const stageStyle = getComputedStyle(stage)
      const padX =
        (Number.parseFloat(stageStyle.paddingLeft) || 0) + (Number.parseFloat(stageStyle.paddingRight) || 0)
      const padY =
        (Number.parseFloat(stageStyle.paddingTop) || 0) + (Number.parseFloat(stageStyle.paddingBottom) || 0)
      const availW = Math.max(0, stage.clientWidth - padX)
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
  }, [paper.w, paper.h, inkStyle])

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
  }, [paperDir, inkStyle, pdfBusy, exportChoice])

  function chooseExport(format: 'pdf' | 'excel') {
    const mode = exportChoice
    setExportChoice(null)
    if (format === 'excel') {
      const countName = busName.trim() || '遊覽車'
      void downloadBusExcel(model, names, { busName, plateNo }, `遊覽車大師_${countName}_${dateStamp()}.xlsx`)
      return
    }
    if (mode === 'print') {
      window.print()
      return
    }
    downloadPdf()
  }

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
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
      if (cancelled) return
      try {
        const { jsPDF } = await import('jspdf')
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
          const canvas = await captureSheet(sheets[i])
          const img = canvas.toDataURL('image/jpeg', 0.93)
          if (i > 0) pdf.addPage('a4', landscape ? 'landscape' : 'portrait')
          pdf.addImage(img, 'JPEG', 0, 0, paper.w, paper.h)
        }
        savePdfFile(pdf, `遊覽車大師_座位表_${dateStamp()}.pdf`)
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

  return (
    <div className={`seat-print-preview is-a4-${paperDir}`} style={{ ['--print-scale' as string]: String(scale) }}>
      <style>{`@media print { @page { size: A4 ${paperDir}; margin: 0; } }`}</style>
      <header className="seat-print-bar no-print">
        <div className="preview-fit-row" ref={barFitRef}>
          <div className="seat-print-paper">
            <span className="toolbar-label">印出尺寸</span>
            <div className="seg">
              <button
                type="button"
                className={paperDir === 'landscape' ? 'is-active' : ''}
                onClick={() => setPaperDir('landscape')}
              >
                A4 橫向
              </button>
              <button
                type="button"
                className={paperDir === 'portrait' ? 'is-active' : ''}
                onClick={() => setPaperDir('portrait')}
              >
                A4 直向
              </button>
            </div>
          </div>
          <div className="seat-print-paper">
            <span className="toolbar-label">樣式</span>
            <div className="toolbar-drop seat-style-drop">
              <button type="button" className="toolbar-drop-btn">
                {SEAT_INK_STYLES.find((style) => style.id === inkStyle)?.label ?? '預設'}
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
          <div className="seat-print-actions">
            <button type="button" className="btn" onClick={onClose}>
              返回編輯
            </button>
            <button type="button" className="btn" disabled={pdfBusy} onClick={() => setExportChoice('download')}>
              {pdfBusy ? '匯出中…' : '下載為'}
            </button>
            <button type="button" className="btn primary" onClick={() => setExportChoice('print')}>
              開始列印
            </button>
          </div>
        </div>
      </header>
      <div className="seat-print-stage" ref={stageRef}>
        <div className="pages-preview-frame" style={{ width: `${framePx.w}px`, height: `${framePx.h}px` }}>
          <div
            ref={sheetRef}
            className="seat-print-sheet pages-preview-sheet"
            style={{
              width: `${paper.w}mm`,
              height: `${paper.h}mm`,
              transform: `scale(${scale})`,
            }}
          >
            <BusPage names={names} model={model} inkStyle={inkStyle} busName={busName} plateNo={plateNo} />
          </div>
        </div>
      </div>
      {exportChoice && (
        <div className="seat-notice" role="dialog" aria-modal="true" aria-labelledby="bus-export-title">
          <div className="seat-notice-card" onClick={(event) => event.stopPropagation()}>
            <h3 id="bus-export-title">選擇格式</h3>
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setExportChoice(null)}>
                取消
              </button>
              <button type="button" className="btn" onClick={() => chooseExport('pdf')}>
                PDF
              </button>
              <button type="button" className="btn primary" onClick={() => chooseExport('excel')}>
                Excel
              </button>
            </div>
          </div>
        </div>
      )}
      {pdfBusy && (
        <div className="pages-pdf-source" ref={pdfSourceRef} aria-hidden>
          <div className="seat-print-pdf-page" style={{ width: `${paper.w}mm`, height: `${paper.h}mm` }}>
            <BusPage names={names} model={model} inkStyle={inkStyle} busName={busName} plateNo={plateNo} />
          </div>
        </div>
      )}
    </div>
  )
}
