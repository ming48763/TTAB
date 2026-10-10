import ExcelJS from 'exceljs'
import type { PackedCard } from '../components/AttendanceBoard'
import {
  expandPeriods,
  periodCount,
  periodCards,
  reasonCards,
  REASON_LABELS,
  speakChain,
  speakPeriods,
  type AttendanceCard,
  type PeriodLevel,
} from './attendance'

export type AttDateMode = 'fixed' | 'today' | 'standing'

const TERM_START = new Date(2026, 7, 31)
const WEEK_COUNT = 20
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五']
const CENTER = { horizontal: 'center' as const, vertical: 'middle' as const }
const DAY_SHEET_RE = /^\d{4}-\d{2}-\d{2}$/

function startOfDay(d: Date) {
  const n = new Date(d)
  n.setHours(0, 0, 0, 0)
  return n
}

function mondayOf(d: Date) {
  const n = startOfDay(d)
  const day = n.getDay()
  const offset = day === 0 ? -6 : 1 - day
  n.setDate(n.getDate() + offset)
  return n
}

function addDays(d: Date, n: number) {
  const next = new Date(d)
  next.setDate(d.getDate() + n)
  return next
}

function iso(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function slashDate(d: Date) {
  return iso(d).replaceAll('-', '/')
}

function parseIso(value: string) {
  const compact = value.trim().replaceAll('/', '-')
  const [y, m, d] = compact.split('-').map(Number)
  return startOfDay(new Date(y, (m ?? 1) - 1, d ?? 1))
}

function weekdayMon0(d: Date) {
  const day = d.getDay()
  if (day === 0 || day === 6) return 4
  return day - 1
}

export function weekdayMon0FromIso(value: string) {
  return weekdayMon0(parseIso(value))
}

export function todayIso() {
  return iso(new Date())
}

export function reasonMark(label: string) {
  return label.slice(0, 1)
}

function isSchoolDay(d: Date) {
  const day = d.getDay()
  return day !== 0 && day !== 6
}

function termWeekOf(day: Date) {
  const start = mondayOf(TERM_START)
  const mon = mondayOf(day)
  const diff = Math.round((mon.getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return Math.min(WEEK_COUNT, Math.max(1, diff + 1))
}

function weekRange(week: number) {
  const start = addDays(mondayOf(TERM_START), (week - 1) * 7)
  return { start, end: addDays(start, 7) }
}

function daysOfWeek(week: number, extraIsos: string[] = []) {
  const { start, end } = weekRange(week)
  const days = [0, 1, 2, 3, 4].map((i) => addDays(start, i)).filter(isSchoolDay)
  const have = new Set(days.map(iso))
  for (const value of extraIsos) {
    if (!value) continue
    const day = parseIso(value)
    if (Number.isNaN(day.getTime())) continue
    const key = iso(day)
    if (have.has(key) || day < start || day >= end) continue
    days.push(day)
    have.add(key)
  }
  days.sort((a, b) => a.getTime() - b.getTime())
  return days
}

function datedIsos(
  packs: PackedCard[],
  stamp?: { dateMode: AttDateMode; date: string },
) {
  const extra: string[] = []
  for (const pack of packs) {
    if (pack.dateMode === 'standing' || !pack.date) continue
    extra.push(pack.date)
  }
  if (stamp && stamp.dateMode !== 'standing' && stamp.date) extra.push(stamp.date)
  return extra
}

function packsInWeek(packs: PackedCard[], days: Date[]) {
  const isos = new Set(days.map(iso))
  const weekdays = new Set(days.map(weekdayMon0))
  return packs.filter((pack) => {
    if (pack.dateMode === 'standing') return weekdays.has(pack.weekday ?? 0)
    if (!pack.date) return false
    return isos.has(iso(parseIso(pack.date)))
  })
}

function dayPeriodColumns(level: PeriodLevel) {
  const last = level === 'elementary' ? 7 : 8
  return ['早修', ...Array.from({ length: last }, (_, i) => `第${i + 1}節`)]
}

function periodColumnsOf(labels: string[], level: PeriodLevel, columns: string[]) {
  const { nums, extras } = expandPeriods(labels, level)
  const want = new Set<string>()
  for (const extra of extras) {
    if (columns.includes(extra)) want.add(extra)
  }
  for (const n of nums) {
    const label = `第${n}節`
    if (columns.includes(label)) want.add(label)
  }
  return columns.filter((c) => want.has(c))
}

function emptyDayGrid(colCount: number) {
  return Array.from({ length: 30 }, () => Array.from({ length: colCount }, () => ''))
}

function fillPresent(grid: string[][]) {
  for (const row of grid) {
    for (let i = 0; i < row.length; i++) {
      if (!row[i]) row[i] = 'V'
    }
  }
}

function putMark(grid: string[][], seat: number, col: number, mark: string) {
  if (seat < 1 || seat > 30 || col < 0 || col >= grid[0].length) return
  const cell = grid[seat - 1][col]
  if (!cell) grid[seat - 1][col] = mark
  else if (!cell.includes(mark)) grid[seat - 1][col] = `${cell}${mark}`
}

function packAppliesToDay(pack: PackedCard, day: Date) {
  if (pack.dateMode === 'standing') return (pack.weekday ?? 0) === weekdayMon0(day)
  if (!pack.date) return false
  return iso(parseIso(pack.date)) === iso(day)
}

function applyPackToDay(grid: string[][], pack: PackedCard, day: Date, columns: string[], level: PeriodLevel) {
  if (!packAppliesToDay(pack, day)) return
  const reason = pack.blocks.find((b) => b.kind === 'reason')
  const periods = pack.blocks.filter((b) => b.kind === 'period')
  if (!reason || periods.length === 0) return
  const mark = reasonMark(reason.label)
  const seats = pack.blocks
    .filter((b) => b.kind === 'seat')
    .map((b) => Number(b.label))
    .filter((n) => n >= 1 && n <= 30)
  const used = periodColumnsOf(
    periods.map((p) => p.label),
    level,
    columns,
  )
  for (const seat of seats) {
    for (const col of used) {
      putMark(grid, seat, columns.indexOf(col), mark)
    }
  }
}

function centerSheet(sheet: ExcelJS.Worksheet) {
  const maxRow = Math.max(sheet.rowCount, 1)
  const maxCol = Math.max(sheet.columnCount, 1)
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      sheet.getCell(r, c).alignment = CENTER
    }
  }
}

function packDateLabel(pack: PackedCard) {
  if (pack.dateMode === 'standing') return `常態(${WEEKDAYS[pack.weekday ?? 0] ?? '一'})`
  return slashDate(parseIso(pack.date))
}

function detailRows(packs: PackedCard[], names: string[], level: PeriodLevel) {
  const rows: (string | number)[][] = []
  const seen = new Set<string>()
  for (const pack of packs) {
    const reason = pack.blocks.find((b) => b.kind === 'reason')
    const periods = pack.blocks.filter((b) => b.kind === 'period')
    if (!reason || periods.length === 0) continue
    const periodText = speakPeriods(
      periods.map((p) => p.label),
      level,
    )
    const count = periodCount(
      periods.map((p) => p.label),
      level,
    )
    const dateLabel = packDateLabel(pack)
    for (const seat of pack.blocks.filter((b) => b.kind === 'seat')) {
      const n = Number(seat.label)
      if (n < 1 || n > 30) continue
      const key = `${n}|${dateLabel}|${reason.label}|${periodText}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push([n, names[n - 1] ?? '', dateLabel, reason.label, periodText, count])
    }
  }
  rows.sort((a, b) => Number(a[0]) - Number(b[0]) || String(a[2]).localeCompare(String(b[2])))
  return rows
}

function summaryGrid(packs: PackedCard[], level: PeriodLevel) {
  const reasons = [...REASON_LABELS]
  const columns = dayPeriodColumns(level)
  const used = Array.from({ length: 30 }, () => reasons.map(() => new Set<string>()))
  for (const pack of packs) {
    const reason = pack.blocks.find((b) => b.kind === 'reason')
    const periods = pack.blocks.filter((b) => b.kind === 'period')
    if (!reason || periods.length === 0) continue
    const col = reasons.indexOf(reason.label as (typeof REASON_LABELS)[number])
    if (col < 0) continue
    const slots = periodColumnsOf(
      periods.map((p) => p.label),
      level,
      columns,
    )
    const dayKey = pack.dateMode === 'standing' ? `standing-${pack.weekday ?? 0}` : iso(parseIso(pack.date))
    for (const seat of pack.blocks.filter((b) => b.kind === 'seat')) {
      const n = Number(seat.label)
      if (n < 1 || n > 30) continue
      for (const slot of slots) used[n - 1][col].add(`${dayKey}|${slot}`)
    }
  }
  const counts = used.map((row) => row.map((set) => set.size))
  return { reasons, counts }
}

async function buildWorkbook(
  packs: PackedCard[],
  names: string[],
  level: PeriodLevel,
  days: Date[],
  presentDays: Set<string>,
) {
  const book = new ExcelJS.Workbook()
  const columns = dayPeriodColumns(level)
  const { reasons, counts } = summaryGrid(packs, level)

  const overview = book.addWorksheet('總覽')
  overview.addRow(['座號', '姓名', ...reasons])
  for (let i = 0; i < 30; i++) {
    overview.addRow([i + 1, names[i] ?? '', ...counts[i]])
  }
  overview.columns = [{ width: 8 }, { width: 12 }, ...reasons.map(() => ({ width: 10 }))]
  centerSheet(overview)

  const detail = book.addWorksheet('明細')
  detail.addRow(['座號', '姓名', '日期', '假別', '節次', '節數'])
  for (const row of detailRows(packs, names, level)) detail.addRow(row)
  detail.columns = [{ width: 8 }, { width: 12 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 8 }]
  centerSheet(detail)

  for (const day of days) {
    const grid = emptyDayGrid(columns.length)
    for (const pack of packs) applyPackToDay(grid, pack, day, columns, level)
    if (presentDays.has(iso(day))) fillPresent(grid)
    const sheet = book.addWorksheet(iso(day))
    sheet.addRow(['座號', '姓名', ...columns])
    for (let i = 0; i < 30; i++) {
      sheet.addRow([i + 1, names[i] ?? '', ...grid[i]])
    }
    sheet.columns = [{ width: 8 }, { width: 12 }, ...columns.map(() => ({ width: 10 }))]
    centerSheet(sheet)
  }

  return book
}

function exportFilename(week: number) {
  return `出缺席快拉_week${week}.xlsx`
}

function downloadBlob(buf: ArrayBuffer, filename: string) {
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => {
    a.remove()
    URL.revokeObjectURL(url)
  }, 2000)
}

function applyExportStamp(
  packs: PackedCard[],
  stamp: { dateMode: AttDateMode; date: string; weekday: number },
) {
  return packs.map((pack) => {
    if (stamp.dateMode === 'standing') {
      return { ...pack, dateMode: 'standing' as const, date: stamp.date, weekday: stamp.weekday }
    }
    if (pack.dateMode === 'standing') return pack
    return {
      ...pack,
      dateMode: stamp.dateMode,
      date: stamp.date,
      weekday: stamp.weekday,
    }
  })
}

export async function exportAttendanceExcel(
  packs: PackedCard[],
  names: string[] = [],
  level: PeriodLevel = 'above',
  stamp?: { dateMode: AttDateMode; date: string; weekday: number },
  options?: { restamp?: boolean; presentDays?: string[] },
) {
  const dated = stamp && options?.restamp !== false ? applyExportStamp(packs, stamp) : packs
  const weekDate = stamp?.date ?? dated.find((p) => p.dateMode !== 'standing' && p.date)?.date ?? todayIso()
  const week = termWeekOf(parseIso(weekDate))
  const days = daysOfWeek(week, datedIsos(dated, stamp))
  const weekPacks = groupPacks(packsInWeek(dated, days), level)
  const presentDays = new Set(options?.presentDays ?? [])
  if (stamp && stamp.dateMode !== 'standing') presentDays.add(stamp.date)
  const book = await buildWorkbook(weekPacks, names, level, days, presentDays)
  const buf = (await book.xlsx.writeBuffer()) as ArrayBuffer
  downloadBlob(buf, exportFilename(week))
}

function markToReason(mark: string) {
  const hit = reasonCards().find((c) => c.label.startsWith(mark) || reasonMark(c.label) === mark)
  return hit?.label ?? (mark ? `${mark}假` : '')
}

function parsePeriodText(text: string, level: PeriodLevel): AttendanceCard[] {
  const all = periodCards(level)
  const found: AttendanceCard[] = []
  const raw = text.replace(/\s/g, '')
  if (!raw) return [all.find((c) => c.label === '全天') ?? all[0]]
  if (raw.includes('全天')) {
    const card = all.find((c) => c.label === '全天')
    if (card) return [card]
  }
  if (raw.includes('上半')) {
    const card = all.find((c) => c.label === '上半')
    if (card) found.push(card)
  }
  if (raw.includes('下半')) {
    const card = all.find((c) => c.label === '下半')
    if (card) found.push(card)
  }
  if (raw.includes('早修')) {
    const card = all.find((c) => c.label === '早修')
    if (card) found.push(card)
  }
  if (raw.includes('午休')) {
    const card = all.find((c) => c.label === '午休')
    if (card) found.push(card)
  }
  const chunk = /第?([\d、,~\-～至-]+)節/.exec(raw)
  if (chunk) {
    for (const part of chunk[1].split(/[、,]/)) {
      const range = /(\d+)\s*[-~～至]+\s*(\d+)/.exec(part)
      if (range) {
        const a = Number(range[1])
        const b = Number(range[2])
        for (let n = Math.min(a, b); n <= Math.max(a, b); n++) {
          const card = all.find((c) => c.label === `第${n}節`)
          if (card) found.push(card)
        }
        continue
      }
      const one = part.match(/\d+/)
      if (one) {
        const card = all.find((c) => c.label === `第${one[0]}節`)
        if (card) found.push(card)
      }
    }
  }
  return found.length > 0 ? found : [all.find((c) => c.label === '全天') ?? all[0]]
}

function seatCard(n: number): AttendanceCard {
  return {
    id: `seat-${n}`,
    kind: 'seat',
    label: String(n).padStart(2, '0'),
  }
}

function reasonCard(label: string): AttendanceCard {
  return { id: `reason-${label}`, kind: 'reason', label }
}

const STANDING_RE = /^常態[（(]?星期?([一二三四五])期?[)）]?$/

function standingWeekday(text: string) {
  const m = STANDING_RE.exec(text.replace(/\s/g, ''))
  if (!m) return null
  return ['一', '二', '三', '四', '五'].indexOf(m[1])
}

function packSeats(pack: PackedCard) {
  return [
    ...new Set(
      pack.blocks
        .filter((b) => b.kind === 'seat')
        .map((b) => Number(b.label))
        .filter((n) => n >= 1 && n <= 30),
    ),
  ].sort((a, b) => a - b)
}

function packPeriodKey(pack: PackedCard, level: PeriodLevel) {
  return periodColumnsOf(
    pack.blocks.filter((b) => b.kind === 'period').map((b) => b.label),
    level,
    dayPeriodColumns(level),
  ).join(',')
}

function packKey(pack: PackedCard, level: PeriodLevel = 'above') {
  const reason = pack.blocks.find((b) => b.kind === 'reason')?.label ?? ''
  const seats = packSeats(pack).join(',')
  const periods = packPeriodKey(pack, level)
  if (pack.dateMode === 'standing') return `standing|${pack.weekday ?? 0}|${reason}|${periods}|${seats}`
  return `day|${iso(parseIso(pack.date))}|${reason}|${periods}|${seats}`
}

function groupKey(pack: PackedCard, level: PeriodLevel) {
  const reason = pack.blocks.find((b) => b.kind === 'reason')?.label ?? ''
  const periods = packPeriodKey(pack, level)
  if (pack.dateMode === 'standing') return `standing|${pack.weekday ?? 0}|${reason}|${periods}`
  return `day|${iso(parseIso(pack.date))}|${reason}|${periods}`
}

function makePack(
  seats: number[],
  reason: string,
  periods: AttendanceCard[],
  dateMode: AttDateMode,
  date: string,
  weekday: number,
  level: PeriodLevel,
): PackedCard {
  const blocks = [...seats.sort((a, b) => a - b).map(seatCard), reasonCard(reason), ...periods]
  return {
    id: `import-${dateMode}-${date}-${weekday}-${reason}-${seats.join('-')}`,
    text: speakChain(blocks, level) ?? `${reason}：${seats.join('、')}`,
    blocks,
    dateMode,
    date,
    weekday,
  }
}

function groupPacks(packs: PackedCard[], level: PeriodLevel) {
  const map = new Map<string, PackedCard>()
  for (const pack of packs) {
    const reason = pack.blocks.find((b) => b.kind === 'reason')?.label ?? ''
    const periods = pack.blocks.filter((b) => b.kind === 'period')
    const key = groupKey(pack, level)
    const seats = packSeats(pack)
    const prev = map.get(key)
    const mergedSeats = [...new Set([...(prev ? packSeats(prev) : []), ...seats])]
    const dateMode = pack.dateMode === 'standing' || prev?.dateMode === 'standing' ? 'standing' : 'fixed'
    map.set(
      key,
      makePack(mergedSeats, reason, periods, dateMode, pack.date, pack.weekday ?? 0, level),
    )
  }
  return [...map.values()]
}

function isDetailHeader(sheet: ExcelJS.Worksheet) {
  const a = String(sheet.getRow(1).getCell(1).text ?? '')
  const c = String(sheet.getRow(1).getCell(3).text ?? '')
  const d = String(sheet.getRow(1).getCell(4).text ?? '')
  return a.includes('座號') && (c.includes('日期') || d.includes('假別'))
}

function readDetailSheet(sheet: ExcelJS.Worksheet, names: string[], incoming: PackedCard[], level: PeriodLevel) {
  sheet.eachRow((row, i) => {
    if (i === 1) return
    const seat = Number(row.getCell(1).text)
    const name = String(row.getCell(2).text ?? '').trim()
    const dateText = String(row.getCell(3).text ?? '').trim()
    const reason = String(row.getCell(4).text ?? '').trim()
    const periodText = String(row.getCell(5).text ?? '').trim()
    if (!seat || seat < 1 || seat > 30 || !reason || !dateText) return
    if (name) names[seat - 1] = name
    const stand = standingWeekday(dateText)
    const periods = parsePeriodText(periodText, level)
    if (stand != null) {
      incoming.push(makePack([seat], reason, periods, 'standing', iso(TERM_START), stand, level))
      return
    }
    const day = parseIso(dateText)
    incoming.push(makePack([seat], reason, periods, 'fixed', iso(day), weekdayMon0(day), level))
  })
}

function readDaySheet(
  sheet: ExcelJS.Worksheet,
  day: Date,
  names: string[],
  incoming: PackedCard[],
  level: PeriodLevel,
  presentDays: Set<string>,
) {
  const header = sheet.getRow(1)
  const columns: string[] = []
  header.eachCell((cell, col) => {
    if (col >= 3) columns[col - 3] = String(cell.text ?? '').trim()
  })
  for (let r = 2; r <= 31; r++) {
    const row = sheet.getRow(r)
    const seat = Number(row.getCell(1).text)
    const name = String(row.getCell(2).text ?? '').trim()
    if (!seat || seat < 1 || seat > 30) continue
    if (name) names[seat - 1] = name
    const byReason = new Map<string, string[]>()
    columns.forEach((period, i) => {
      const mark = String(row.getCell(i + 3).text ?? '').trim()
      if (!mark || !period) return
      if (mark === 'V' || mark === 'v') {
        presentDays.add(iso(day))
        return
      }
      const reason = markToReason(mark[0])
      const list = byReason.get(reason) ?? []
      list.push(period)
      byReason.set(reason, list)
    })
    for (const [reason, periods] of byReason) {
      const cards = periods
        .map((p) => periodCards(level).find((c) => c.label === p))
        .filter((c): c is AttendanceCard => Boolean(c))
      if (cards.length === 0) continue
      incoming.push(makePack([seat], reason, cards, 'fixed', iso(day), weekdayMon0(day), level))
    }
  }
}

export async function importAttendanceExcel(file: ArrayBuffer, level: PeriodLevel = 'above') {
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(file)
  const names = Array.from({ length: 30 }, () => '')
  const incoming: PackedCard[] = []
  const presentDays = new Set<string>()

  const detailSheet = book.getWorksheet('明細')
  const oldOverview = book.getWorksheet('總覽')
  if (detailSheet && isDetailHeader(detailSheet)) {
    readDetailSheet(detailSheet, names, incoming, level)
  } else if (oldOverview && isDetailHeader(oldOverview)) {
    readDetailSheet(oldOverview, names, incoming, level)
  }

  for (const sheet of book.worksheets) {
    if (DAY_SHEET_RE.test(sheet.name)) {
      readDaySheet(sheet, parseIso(sheet.name), names, incoming, level, presentDays)
    }
  }

  if (incoming.length === 0) {
    for (const sheet of book.worksheets) {
      if (!/^week\s+\d+$/i.test(sheet.name)) continue
      const n = Number(/\d+/.exec(sheet.name)?.[0] ?? 0)
      const monday = addDays(mondayOf(TERM_START), (n - 1) * 7)
      for (let r = 3; r <= 32; r++) {
        const row = sheet.getRow(r)
        const seat = Number(row.getCell(1).text)
        const name = String(row.getCell(2).text ?? '').trim()
        if (!seat || seat < 1 || seat > 30) continue
        if (name) names[seat - 1] = name
        for (let c = 0; c < 5; c++) {
          const mark = String(row.getCell(c + 3).text ?? '').trim()
          const day = addDays(monday, c)
          if (mark === 'V' || mark === 'v') {
            presentDays.add(iso(day))
            continue
          }
          if (!mark) continue
          const reason = markToReason(mark[0])
          incoming.push(
            makePack([seat], reason, parsePeriodText('全天', level), 'fixed', iso(day), c, level),
          )
        }
      }
    }
  }

  return { packs: groupPacks(incoming, level), names, presentDays: [...presentDays] }
}

export function mergeImportedPacks(current: PackedCard[], incoming: PackedCard[], level: PeriodLevel = 'above') {
  const map = new Map(current.map((p) => [packKey(p, level), p]))
  for (const pack of incoming) map.set(packKey(pack, level), pack)
  return [...map.values()]
}

export function mergeNames(current: string[], incoming: string[]) {
  return Array.from({ length: 30 }, (_, i) => incoming[i] || current[i] || '')
}
