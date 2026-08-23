import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { chunk, resolvePrintPaper } from '../lib/layout'
import {
  impositionGrid,
  impositionHint,
  type PrintImposition,
} from '../lib/printLayout'
import type { LayoutSettings, StudentRow } from '../types'
import { PrintSheet } from './PrintSheet'

const LAYOUTS: PrintImposition[] = ['1x1', '2x1', '2x2']

interface Props {
  settings: LayoutSettings
  rows: StudentRow[]
  title: string
  imposition: PrintImposition
  onImpositionChange: (next: PrintImposition) => void
  onClose: () => void
  onPrint: () => void
}

export function PagesPreview({
  settings,
  rows,
  title,
  imposition,
  onImpositionChange,
  onClose,
  onPrint,
}: Props) {
  const paper = resolvePrintPaper(settings, imposition)
  const grid = impositionGrid(imposition, paper.paperWidthMm, paper.paperHeightMm)
  const perPage = Math.max(1, grid.cols * grid.rows)
  const pages = useMemo(() => chunk(rows, perPage), [rows, perPage])
  const pageCount = Math.max(1, pages.length)
  const [page, setPage] = useState(0)
  const [pdfBusy, setPdfBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const pdfSourceRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.32)

  const current = pages[page] ?? []
  const dirLabel = paper.orientation === 'portrait' ? '直向' : '橫向'

  useEffect(() => {
    setPage(0)
  }, [imposition])

  useLayoutEffect(() => {
    function fitScale() {
      const stage = stageRef.current
      const sheet = sheetRef.current
      if (!stage || !sheet) return
      const naturalW = sheet.offsetWidth
      const naturalH = sheet.offsetHeight
      if (naturalW <= 0 || naturalH <= 0) return
      const next = Math.min((stage.clientWidth - 32) / naturalW, (stage.clientHeight - 32) / naturalH, 1)
      const clamped = Math.max(0.12, next)
      setScale((prev) => (Math.abs(clamped - prev) > 0.004 ? clamped : prev))
    }
    fitScale()
    window.addEventListener('resize', fitScale)
    const ro = new ResizeObserver(fitScale)
    if (stageRef.current) ro.observe(stageRef.current)
    return () => {
      window.removeEventListener('resize', fitScale)
      ro.disconnect()
    }
  }, [paper.paperWidthMm, paper.paperHeightMm, paper.orientation, imposition])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPage((p) => Math.max(0, p - 1))
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPage((p) => Math.min(pageCount - 1, p + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pageCount])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let locked = false
    let unlockTimer = 0
    function onWheel(e: WheelEvent) {
      if (pageCount <= 1) return
      e.preventDefault()
      if (locked) return
      const dy = e.deltaY
      if (Math.abs(dy) < 8) return
      locked = true
      window.clearTimeout(unlockTimer)
      unlockTimer = window.setTimeout(() => {
        locked = false
      }, 320)
      setPage((p) => (dy > 0 ? Math.min(pageCount - 1, p + 1) : Math.max(0, p - 1)))
    }
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      root.removeEventListener('wheel', onWheel)
      window.clearTimeout(unlockTimer)
    }
  }, [pageCount])

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
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
        const sheets = Array.from(host.querySelectorAll<HTMLElement>('.print-page'))
        if (!sheets.length) return
        const w = paper.paperWidthMm
        const h = paper.paperHeightMm
        const landscape = w > h
        const pdf = new jsPDF({
          orientation: landscape ? 'landscape' : 'portrait',
          unit: 'mm',
          format: [w, h],
        })
        for (let i = 0; i < sheets.length; i++) {
          if (cancelled) return
          const canvas = await html2canvas(sheets[i], {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
          })
          const img = canvas.toDataURL('image/jpeg', 0.93)
          if (i > 0) pdf.addPage([w, h], landscape ? 'landscape' : 'portrait')
          pdf.addImage(img, 'JPEG', 0, 0, w, h)
        }
        const layoutLabel = imposition.replace('x', 'X')
        pdf.save(`${title}_${paper.size}_${dirLabel}_${layoutLabel}.pdf`)
      } finally {
        if (!cancelled) setPdfBusy(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pdfBusy, title, dirLabel, paper.size, paper.paperHeightMm, paper.paperWidthMm, imposition])

  return (
    <div
      ref={rootRef}
      className="pages-preview no-print"
      role="dialog"
      aria-modal="true"
      aria-label="列印頁面預覽"
    >
      <header className="pages-preview-bar">
        <div className="pages-preview-meta">
          <strong>列印預覽</strong>
          <span>
            {paper.size} {dirLabel} · {impositionHint(imposition, paper.size, paper.orientation)} · 每頁 {perPage} 張 · 共{' '}
            {pageCount} 頁 · {rows.length} 人
          </span>
        </div>
        <div className="pages-preview-layout">
          <span className="toolbar-label">布局</span>
          <div className="seg">
            {LAYOUTS.map((id) => (
              <button
                key={id}
                type="button"
                className={imposition === id ? 'is-active' : ''}
                onClick={() => onImpositionChange(id)}
                title={impositionHint(
                  id,
                  paper.size,
                  id === '2x1'
                    ? settings.orientation === 'portrait'
                      ? 'landscape'
                      : 'portrait'
                    : settings.orientation,
                )}
              >
                {id === '1x1' ? '1×1' : id === '2x1' ? '2×1' : '2×2'}
              </button>
            ))}
          </div>
        </div>
        <div className="pages-preview-pager">
          <button type="button" className="btn" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>
            上一頁
          </button>
          <span className="pages-preview-index">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="btn"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            下一頁
          </button>
        </div>
        <div className="pages-preview-actions">
          <button type="button" className="btn" onClick={onClose}>
            返回編輯
          </button>
          <button type="button" className="btn" disabled={pdfBusy} onClick={downloadPdf}>
            {pdfBusy ? '匯出中…' : '下載為PDF'}
          </button>
          <button type="button" className="btn primary" onClick={onPrint}>
            開始列印
          </button>
        </div>
      </header>

      <div className="pages-preview-body" ref={stageRef}>
        <div
          className="pages-preview-frame"
          style={{
            width: `calc(${paper.paperWidthMm}mm * ${scale})`,
            height: `calc(${paper.paperHeightMm}mm * ${scale})`,
          }}
        >
          <div
            ref={sheetRef}
            className="pages-preview-sheet"
            style={{
              width: `${paper.paperWidthMm}mm`,
              height: `${paper.paperHeightMm}mm`,
              transform: `scale(${scale})`,
            }}
          >
            <PrintSheet settings={settings} students={current} imposition={imposition} />
          </div>
        </div>
      </div>

      {pdfBusy && (
        <div className="pages-pdf-source" ref={pdfSourceRef} aria-hidden>
          {(pages.length ? pages : [[]]).map((pageRows, pageIndex) => (
            <PrintSheet key={pageIndex} settings={settings} students={pageRows} imposition={imposition} />
          ))}
        </div>
      )}
    </div>
  )
}
