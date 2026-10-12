import ExcelJS from 'exceljs'
import type { SweepAssignments, SweepFolder } from '../components/SweepBoard'

export const SWEEP_SHEET_SUFFIX = '掃地工作表'

const INNER_GROUP_ORDER = ['掃地', '拖地', '倒垃圾', '窗戶', '其他']
const OUTER_GROUP_ORDER = ['科任教室', '辦公室', '圖書館', '活動中心', '廁所', '操場', '籃球場', '草皮', '遊樂區', '垃圾場']

const DUP_SUFFIX = /(（重複）|\(重複\))(\d*)$/

export interface SweepExportRow {
  group: string
  task: string
  name: string
  groupRowSpan: number
  taskRowSpan: number
}

export interface SweepExportPage {
  id: 'inner' | 'outer'
  sheetName: string
  heading: string
  groupLabel: string
  rows: SweepExportRow[]
}

export function sweepSheetTitle(prefix: string) {
  return `${prefix.trim()}${SWEEP_SHEET_SUFFIX}`
}

export function sweepFileBase(title: string) {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '').trim()
  return cleaned || SWEEP_SHEET_SUFFIX
}

export function splitSweepTitle(title: string) {
  const base = title.replace(DUP_SUFFIX, '').trim()
  const mark = base.indexOf('·')
  if (mark <= 0) return { group: base || '自定義', task: title.trim() || '自定義' }
  return { group: base.slice(0, mark), task: title.slice(mark + 1).trim() || base.slice(mark + 1) }
}

function groupFolders(folders: SweepFolder[], order: string[]) {
  const groups = new Map<string, SweepFolder[]>()
  for (const folder of folders) {
    const { group } = splitSweepTitle(folder.title)
    const list = groups.get(group) ?? []
    list.push(folder)
    groups.set(group, list)
  }
  return [...groups.keys()]
    .sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      if (ia === -1 && ib === -1) return 0
      if (ia === -1) return 1
      if (ib === -1) return -1
      return ia - ib
    })
    .map((group) => ({ group, folders: groups.get(group) ?? [] }))
}

function rowsFor(folders: SweepFolder[], nameOf: (key: string) => string): SweepExportRow[] {
  const rows: SweepExportRow[] = []
  for (const block of groupFolders(folders, [])) {
    const lines: { group: string; task: string; name: string }[] = []
    for (const folder of block.folders) {
      const { task } = splitSweepTitle(folder.title)
      const names = folder.members.length ? folder.members.map(nameOf) : ['']
      for (const name of names) lines.push({ group: block.group, task, name })
    }
    let index = 0
    while (index < lines.length) {
      let end = index + 1
      while (end < lines.length && lines[end].task === lines[index].task) end += 1
      for (let cursor = index; cursor < end; cursor += 1) {
        rows.push({
          ...lines[cursor],
          groupRowSpan: cursor === 0 ? lines.length : 0,
          taskRowSpan: cursor === index ? end - index : 0,
        })
      }
      index = end
    }
  }
  return rows
}

function pageRows(folders: SweepFolder[], order: string[], nameOf: (key: string) => string) {
  const ordered = groupFolders(folders, order).flatMap((block) => block.folders)
  return rowsFor(ordered, nameOf)
}

export function buildSweepPages(assignments: SweepAssignments, nameOf: (key: string) => string): SweepExportPage[] {
  return [
    {
      id: 'inner',
      sheetName: '內掃',
      heading: '內掃區',
      groupLabel: '分類',
      rows: pageRows(assignments.inner, INNER_GROUP_ORDER, nameOf),
    },
    {
      id: 'outer',
      sheetName: '外掃',
      heading: '外掃區',
      groupLabel: '區域',
      rows: pageRows(assignments.outer, OUTER_GROUP_ORDER, nameOf),
    },
  ]
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

function writePage(book: ExcelJS.Workbook, page: SweepExportPage, title: string) {
  const sheet = book.addWorksheet(page.sheetName)
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    horizontalCentered: true,
  }
  sheet.columns = [{ width: 18 }, { width: 18 }, { width: 24 }]
  sheet.mergeCells(1, 1, 1, 3)
  paintCell(sheet, 1, 1, title, true, 18)
  sheet.getCell(1, 2).border = BORDER
  sheet.getCell(1, 3).border = BORDER
  sheet.getRow(1).height = 32

  sheet.mergeCells(2, 1, 2, 3)
  paintCell(sheet, 2, 1, page.heading, true, 14)
  sheet.getCell(2, 2).border = BORDER
  sheet.getCell(2, 3).border = BORDER
  sheet.getRow(2).height = 24

  ;[page.groupLabel, '工作', '學生'].forEach((label, index) => paintCell(sheet, 3, index + 1, label, true))
  sheet.getRow(3).height = 22

  if (page.rows.length === 0) {
    sheet.mergeCells(4, 1, 4, 3)
    paintCell(sheet, 4, 1, '尚未安排')
    sheet.getCell(4, 2).border = BORDER
    sheet.getCell(4, 3).border = BORDER
    sheet.getRow(4).height = 22
    return
  }

  page.rows.forEach((row, index) => {
    const excelRow = 4 + index
    if (row.groupRowSpan > 0) paintCell(sheet, excelRow, 1, row.group)
    else sheet.getCell(excelRow, 1).border = BORDER
    if (row.taskRowSpan > 0) paintCell(sheet, excelRow, 2, row.task)
    else sheet.getCell(excelRow, 2).border = BORDER
    paintCell(sheet, excelRow, 3, row.name)
    sheet.getRow(excelRow).height = 22
    if (row.groupRowSpan > 1) sheet.mergeCells(excelRow, 1, excelRow + row.groupRowSpan - 1, 1)
    if (row.taskRowSpan > 1) sheet.mergeCells(excelRow, 2, excelRow + row.taskRowSpan - 1, 2)
  })
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
  window.setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 2000)
}

export async function exportSweepExcel(pages: SweepExportPage[], title: string) {
  const book = new ExcelJS.Workbook()
  for (const page of pages) writePage(book, page, title)
  const buf = (await book.xlsx.writeBuffer()) as ArrayBuffer
  downloadBuffer(
    buf,
    `${sweepFileBase(title)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
}
