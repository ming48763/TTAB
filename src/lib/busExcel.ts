import ExcelJS from 'exceljs'
import { buildBusSheet, type BusCellKind } from './busSheet'

const YELLOW = 'FFFFF4CC'
const WHITE = 'FFFFFFFF'
const INK = 'FF000000'
const LINE = 'FFC9BFAD'
const THIN = { style: 'thin' as const, color: { argb: LINE } }
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }

function fillFor(kind: BusCellKind) {
  if (kind === 'door' || kind === 'aisle') return YELLOW
  return WHITE
}

function downloadBuffer(buf: ArrayBuffer, fileName: string) {
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 2000)
}

export async function downloadBusExcel(
  model: string | undefined,
  names: Record<string, string>,
  info: { busName: string; plateNo: string },
  fileName: string,
) {
  const grid = buildBusSheet(model, names, info)
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('遊覽車座位表')
  grid.cells.forEach((line, rowIndex) => {
    const row = sheet.getRow(rowIndex + 1)
    line.forEach((text, colIndex) => {
      const cell = row.getCell(colIndex + 1)
      const kind = grid.kinds[rowIndex][colIndex]
      cell.value = text
      cell.border = BORDER
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillFor(kind) } }
      cell.font = {
        name: '微軟正黑體',
        size: kind === 'title' ? 16 : 12,
        bold: kind === 'title',
        color: { argb: INK },
      }
      cell.alignment = {
        horizontal: kind === 'info' ? 'left' : 'center',
        vertical: 'middle',
        wrapText: false,
      }
    })
    row.height = kindHeight(grid.kinds[rowIndex][0])
  })
  for (const merge of grid.merges) {
    for (let row = merge.r1; row <= merge.r2; row++) {
      for (let col = merge.c1; col <= merge.c2; col++) {
        if (row === merge.r1 && col === merge.c1) continue
        sheet.getRow(row + 1).getCell(col + 1).value = ''
      }
    }
    sheet.mergeCells(merge.r1 + 1, merge.c1 + 1, merge.r2 + 1, merge.c2 + 1)
  }
  sheet.columns = grid.cells[0].map((_, index) => {
    const edge = index === 0 || index === grid.columns - 1
    const aisle = grid.kinds.some((row) => row[index] === 'aisle')
    return { width: edge ? 12 : aisle ? 10 : 16 }
  })
  const buf = (await book.xlsx.writeBuffer()) as ArrayBuffer
  downloadBuffer(buf, fileName)
}

function kindHeight(kind: BusCellKind) {
  if (kind === 'title') return 28
  if (kind === 'info') return 22
  return 24
}
