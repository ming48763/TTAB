import { chunk, resolvePrintPaper } from '../lib/layout'
import type { PrintImposition } from '../lib/printLayout'
import { impositionGrid } from '../lib/printLayout'
import type { LayoutSettings, StudentRow } from '../types'
import { PrintSheet } from './PrintSheet'

interface Props {
  settings: LayoutSettings
  rows: StudentRow[]
  imposition: PrintImposition
}

export function PrintPreview({ settings, rows, imposition }: Props) {
  const paper = resolvePrintPaper(settings, imposition)
  const grid = impositionGrid(imposition, paper.paperWidthMm, paper.paperHeightMm)
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
          />
        ))}
      </div>
    </div>
  )
}
