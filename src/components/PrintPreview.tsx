import { bestBadgePack, chunk, resolvePrintPaper } from '../lib/layout'
import type { PrintImposition } from '../lib/printLayout'
import { impositionGrid } from '../lib/printLayout'
import { totalCardHeightMm, totalCardWidthMm } from '../lib/paper'
import type { LayoutSettings, PaperSizeId, StudentRow } from '../types'
import { PrintSheet } from './PrintSheet'

interface Props {
  settings: LayoutSettings
  rows: StudentRow[]
  imposition: PrintImposition
  sheetSize?: PaperSizeId
}

export function PrintPreview({ settings, rows, imposition, sheetSize = 'A4' }: Props) {
  const isBadge = settings.mode === 'badge-single'
  const pack = isBadge
    ? bestBadgePack(
        totalCardWidthMm(settings.mode, settings.widthMm),
        totalCardHeightMm(settings.mode, settings.faceHeightMm),
        sheetSize,
        settings.gapMm,
        settings.marginMm,
      )
    : null
  const paper = pack
    ? {
        size: pack.size,
        orientation: pack.orientation,
        paperWidthMm: pack.paperWidthMm,
        paperHeightMm: pack.paperHeightMm,
      }
    : resolvePrintPaper(settings, imposition)
  const grid = pack ? { cols: pack.cols, rows: pack.rows } : impositionGrid(imposition, paper.paperWidthMm, paper.paperHeightMm)
  const perPage = Math.max(1, grid.cols * grid.rows)
  const pages = chunk(rows, perPage)
  const pageSize = `${paper.size} ${paper.orientation}`

  return (
    <div className="print-panel">
      <style>{`@media print { @page { size: ${pageSize}; margin: 0; } }`}</style>
      <div className="print-root">
        {(pages.length ? pages : [[]]).map((pageRows, pageIndex) => (
          <PrintSheet
            key={pageIndex}
            settings={settings}
            students={pageRows}
            imposition={imposition}
            sheetSize={sheetSize}
          />
        ))}
      </div>
    </div>
  )
}
