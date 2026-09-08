import ExcelJS from 'exceljs'
import type { SnapTable } from './snapSheet'

export async function exportSnapSheetExcel(table: SnapTable, fileName = '拍拍成表.xlsx') {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('成績表')
  sheet.addRow(table.headers)
  for (const row of table.rows) sheet.addRow(row)
  sheet.getRow(1).font = { bold: true }
  sheet.columns = table.headers.map((h) => ({
    header: h,
    width: Math.max(10, Math.min(24, h.length * 2 + 4)),
  }))
  const buf = (await book.xlsx.writeBuffer()) as ArrayBuffer
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
