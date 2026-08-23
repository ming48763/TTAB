import { type CSSProperties, type Ref } from 'react'
import { resolvePrintPaper } from '../lib/layout'
import { impositionGrid, type PrintImposition } from '../lib/printLayout'
import { totalCardHeightMm, totalCardWidthMm } from '../lib/paper'
import type { LayoutSettings, StudentRow } from '../types'
import { PlateCard } from './PlateCard'

interface Props {
  settings: LayoutSettings
  students: StudentRow[]
  imposition: PrintImposition
  className?: string
  style?: CSSProperties
  pageRef?: Ref<HTMLElement>
}

export function PrintSheet({ settings, students, imposition, className = '', style, pageRef }: Props) {
  const paper = resolvePrintPaper(settings, imposition)
  const grid = impositionGrid(imposition, paper.paperWidthMm, paper.paperHeightMm)
  const cardW = totalCardWidthMm(settings.mode, settings.widthMm)
  const cardH = totalCardHeightMm(settings.mode, settings.faceHeightMm)
  const cellW = paper.paperWidthMm / grid.cols
  const cellH = paper.paperHeightMm / grid.rows
  const scale = Math.min(cellW / Math.max(cardW, 0.01), cellH / Math.max(cardH, 0.01))
  const showCuts = imposition !== '1x1'
  const slots = Array.from({ length: grid.cols * grid.rows }, (_, i) => students[i] ?? null)

  return (
    <section
      ref={pageRef}
      className={`print-page is-imposed ${className}`.trim()}
      style={{
        width: `${paper.paperWidthMm}mm`,
        height: `${paper.paperHeightMm}mm`,
        gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${grid.rows}, minmax(0, 1fr))`,
        ...style,
      }}
    >
      {slots.map((student, i) => (
        <div key={student ? student.rowIndex : `empty-${i}`} className="print-slot">
          {student ? (
        <div
          className="print-slot-scale"
          style={{
            width: `${cardW}mm`,
            height: `${cardH}mm`,
            transform: `scale(${Number.isFinite(scale) ? scale : 1})`,
          }}
        >
              <PlateCard settings={settings} student={student} showGuides />
            </div>
          ) : null}
        </div>
      ))}
      {showCuts && (
        <div className="print-cuts" aria-hidden>
          {Array.from({ length: grid.cols - 1 }, (_, i) => (
            <span
              key={`v-${i}`}
              className="print-cut is-v"
              style={{ left: `${((i + 1) / grid.cols) * 100}%` }}
            />
          ))}
          {Array.from({ length: grid.rows - 1 }, (_, i) => (
            <span
              key={`h-${i}`}
              className="print-cut is-h"
              style={{ top: `${((i + 1) / grid.rows) * 100}%` }}
            />
          ))}
        </div>
      )}
    </section>
  )
}
