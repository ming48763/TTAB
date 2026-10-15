import ExcelJS from 'exceljs'
import { roomSlotColumns } from './roomPlan'

export const ROOM_SHEET_SUFFIX = '房間分配表'

export interface RoomExportLine {
  room: string
  name: string
  roomRowSpan: number
}

export function roomSheetTitle(prefix: string) {
  return `${prefix.trim()}${ROOM_SHEET_SUFFIX}`
}

export function roomFileBase(title: string) {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').trim()
  return cleaned || ROOM_SHEET_SUFFIX
}

/** Fill each room downward, then across: 1 4 / 2 5 / 3 6. */
export function roomPdfGrid(names: string[], capacity: number): string[][] {
  const columns = roomSlotColumns(capacity)
  const rowCount = Math.max(1, Math.ceil(capacity / columns))
  const grid = Array.from({ length: rowCount }, () => Array.from({ length: columns }, () => ''))
  for (let index = 0; index < capacity; index += 1) {
    const row = index % rowCount
    const col = Math.floor(index / rowCount)
    if (row < rowCount && col < columns) grid[row][col] = names[index] ?? ''
  }
  return grid
}

export function buildRoomExport(rooms: { title: string; names: string[] }[]): RoomExportLine[] {
  const lines: RoomExportLine[] = []
  for (const room of rooms) {
    const names = room.names.length ? room.names : ['']
    names.forEach((name, index) => {
      lines.push({
        room: room.title,
        name,
        roomRowSpan: index === 0 ? names.length : 0,
      })
    })
  }
  return lines
}

const THIN = { style: 'thin' as const, color: { argb: 'FF222222' } }
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN }
const CENTER = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true }

function paintCell(sheet: ExcelJS.Worksheet, row: number, col: number, value: string, bold = false, size = 12) {
  const cell = sheet.getCell(row, col)
  cell.value = value
  cell.font = { name: 'Noto Sans TC', size, bold }
  cell.alignment = CENTER
  cell.border = BORDER
  return cell
}

function downloadBuffer(buf: ArrayBuffer, fileName: string, type: string) {
  const blob = new Blob([buf], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export async function exportRoomExcel(lines: RoomExportLine[], title: string) {
  const book = new ExcelJS.Workbook()
  const sheet = book.addWorksheet('房間分配')
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
  }
  sheet.columns = [{ width: 22 }, { width: 28 }]
  sheet.mergeCells(1, 1, 1, 2)
  paintCell(sheet, 1, 1, title, true, 18)
  sheet.getCell(1, 2).border = BORDER
  sheet.getRow(1).height = 32
  ;['房號', '姓名'].forEach((label, index) => paintCell(sheet, 2, index + 1, label, true))
  sheet.getRow(2).height = 22

  const body = lines.length ? lines : [{ room: '', name: '尚未安排', roomRowSpan: 1 }]
  body.forEach((line, index) => {
    const excelRow = 3 + index
    if (line.roomRowSpan > 0) paintCell(sheet, excelRow, 1, line.room)
    else sheet.getCell(excelRow, 1).border = BORDER
    paintCell(sheet, excelRow, 2, line.name)
    sheet.getRow(excelRow).height = 22
    if (line.roomRowSpan > 1) sheet.mergeCells(excelRow, 1, excelRow + line.roomRowSpan - 1, 1)
  })

  const buf = (await book.xlsx.writeBuffer()) as ArrayBuffer
  downloadBuffer(buf, `${roomFileBase(title)}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}
