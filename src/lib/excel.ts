import * as XLSX from 'xlsx'
import type { ColumnMapping, FieldRole, StudentRow } from '../types'

const ROLE_HINTS: { role: FieldRole; patterns: RegExp[] }[] = [
  {
    role: 'seat',
    patterns: [/座號/, /座号/, /座位/, /^no\.?$/i, /^number$/i, /^#$/, /座次/],
  },
  {
    role: 'name',
    patterns: [/姓名/, /名字/, /學生姓名/, /^name$/i, /名子/],
  },
  {
    role: 'studentId',
    patterns: [/學號/, /学号/, /學生編號/, /^id$/i, /student\s*id/i, /學籍/],
  },
]

const HEADER_HINT =
  /班級|班別|座號|座号|座次|學號|学号|姓名|名字|家長|家长|性別|性别|備註|备注|電話|电话|地址|^name$|^no\.?$|^id$|^class$/i

function cellText(cell: string | number | boolean | null | undefined) {
  return String(cell ?? '').trim()
}

function looksLikeHeaderCell(text: string) {
  return HEADER_HINT.test(text.trim())
}

function looksLikeName(text: string) {
  const value = text.trim()
  if (!value || looksLikeHeaderCell(value)) return false
  return /^[\u4e00-\u9fff]{2,5}$/.test(value) || /^[\u4e00-\u9fff]{1,4}[·．.][\u4e00-\u9fff]{1,4}$/.test(value)
}

function looksLikeSeat(text: string) {
  return /^\d{1,3}$/.test(text.trim())
}

function looksLikeStudentId(text: string) {
  const value = text.trim()
  return /^\d{4,}$/.test(value) || /^[A-Za-z][A-Za-z0-9-]{3,}$/.test(value)
}

function majority(hits: number, total: number) {
  return total > 0 && hits * 2 > total
}

/** Name a column from the values already in it when the sheet has no header row. */
function inferHeaderName(samples: (string | number | boolean | null)[], index: number) {
  const filled = samples.map(cellText).filter(Boolean)
  if (majority(filled.filter(looksLikeName).length, filled.length)) return '姓名'
  if (majority(filled.filter(looksLikeStudentId).length, filled.length)) return '學號'
  if (majority(filled.filter(looksLikeSeat).length, filled.length)) return '座號'
  return `欄位${index + 1}`
}

/** School rosters often put a merged title above the real headers. Returns -1 when no row is a header. */
function findHeaderIndex(matrix: (string | number | boolean | null)[][]) {
  const limit = Math.min(matrix.length, 8)
  let best = -1
  let bestScore = 0
  for (let i = 0; i < limit; i++) {
    if (i === matrix.length - 1 && matrix.length > 1) continue
    const filled = (matrix[i] ?? []).map(cellText).filter(Boolean)
    const hits = filled.filter(looksLikeHeaderCell).length
    if (hits === 0) continue
    const numeric = filled.filter((text) => /^\d+$/.test(text)).length
    const longTitle = filled.some((text) => text.length > 16)
    const score = hits * 5 + filled.length - numeric * 3 - (longTitle ? 4 : 0)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  return best
}

function lastUsedColumn(
  matrix: (string | number | boolean | null)[][],
  headerIndex: number,
  headerCells: string[],
) {
  let last = 0
  headerCells.forEach((text, index) => {
    if (text) last = index + 1
  })
  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? []
    for (let c = line.length - 1; c >= last; c--) {
      if (cellText(line[c])) {
        last = c + 1
        break
      }
    }
  }
  return Math.max(last, 1)
}

export function guessRole(header: string): FieldRole {
  const h = header.trim()
  if (/家長|家长|監護|监护|父親|母親/.test(h)) return 'custom'
  for (const { role, patterns } of ROLE_HINTS) {
    if (patterns.some((p) => p.test(h))) return role
  }
  return 'custom'
}

export interface ParsedWorkbook {
  headers: string[]
  rows: StudentRow[]
  mappings: ColumnMapping[]
}

export const EXCEL_MAX_BYTES = 5 * 1024 * 1024
export const EXCEL_MAX_SPAN = 1000

export class ExcelLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExcelLimitError'
  }
}

export function assertXlsxSize(file: File) {
  const isXlsx =
    /\.xlsx$/i.test(file.name) ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (isXlsx && file.size > EXCEL_MAX_BYTES) {
    throw new ExcelLimitError('xlsx 檔案需在 5MB 以下。')
  }
}

export function fileUploadDialogMessage(error: unknown): string | null {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (raw.includes('請至少包含一列表頭與一列資料')) {
    return '檔案為空：請至少包含一列表頭與一列資料'
  }
  if (
    raw.includes('Bad compressed size') ||
    raw.includes('Array buffer allocation failed') ||
    raw.includes('讀取檔案失敗，檔案損毀或格式不符')
  ) {
    return '讀取檔案失敗，檔案損毀或格式不符'
  }
  return null
}

const EXCEL_MAX_UNZIPPED = 64 * 1024 * 1024
const CORRUPT_MESSAGE = '讀取檔案失敗，檔案損毀或格式不符'

function corruptFile() {
  return new Error(CORRUPT_MESSAGE)
}

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset]! | (bytes[offset + 1]! << 8)
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
  )
}

function findEocd(bytes: Uint8Array) {
  const start = Math.max(0, bytes.length - (22 + 65535))
  for (let i = bytes.length - 22; i >= start; i -= 1) {
    if (readU32(bytes, i) !== 0x06054b50) continue
    const count = readU16(bytes, i + 10)
    const cdOffset = readU32(bytes, i + 16)
    if (count === 0) return i
    if (cdOffset + 4 <= bytes.length && readU32(bytes, cdOffset) === 0x02014b50) return i
  }
  return -1
}

async function countDeflate(payload: Uint8Array, room: number) {
  if (payload.byteLength === 0) return 0
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader = stream.getReader()
  let total = 0
  try {
    while (total <= room) {
      const { done, value } = await reader.read()
      if (done) return total
      total += value?.byteLength ?? 0
    }
    await reader.cancel()
    throw corruptFile()
  } catch (err) {
    await reader.cancel().catch(() => undefined)
    if (err instanceof Error && err.message === CORRUPT_MESSAGE) throw err
    throw corruptFile()
  }
}

export async function assertXlsxInflate(file: ArrayBuffer) {
  const bytes = new Uint8Array(file)
  if (bytes.length < 4 || readU32(bytes, 0) !== 0x04034b50) return
  const eocd = findEocd(bytes)
  if (eocd < 0) throw corruptFile()
  const entryCount = readU16(bytes, eocd + 10)
  const cdOffset = readU32(bytes, eocd + 16)
  if (cdOffset > bytes.length) throw corruptFile()
  let cursor = cdOffset
  let declared = 0
  let actual = 0
  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.length || readU32(bytes, cursor) !== 0x02014b50) throw corruptFile()
    const flags = readU16(bytes, cursor + 8)
    const method = readU16(bytes, cursor + 10)
    const compSize = readU32(bytes, cursor + 20)
    const uncompSize = readU32(bytes, cursor + 24)
    const nameLen = readU16(bytes, cursor + 28)
    const extraLen = readU16(bytes, cursor + 30)
    const commentLen = readU16(bytes, cursor + 32)
    const localOffset = readU32(bytes, cursor + 42)
    cursor += 46 + nameLen + extraLen + commentLen
    if (cursor > bytes.length || flags & 1) throw corruptFile()
    if (compSize === 0xffffffff || uncompSize === 0xffffffff) throw corruptFile()
    declared += uncompSize
    if (declared > EXCEL_MAX_UNZIPPED || uncompSize > EXCEL_MAX_UNZIPPED) throw corruptFile()
    if (localOffset + 30 > bytes.length) throw corruptFile()
    const dataStart = localOffset + 30 + readU16(bytes, localOffset + 26) + readU16(bytes, localOffset + 28)
    if (dataStart > bytes.length || compSize > bytes.length - dataStart) throw corruptFile()
    const room = EXCEL_MAX_UNZIPPED - actual
    let produced = 0
    if (method === 0) produced = compSize
    else if (method === 8) produced = await countDeflate(bytes.subarray(dataStart, dataStart + compSize), room)
    else throw corruptFile()
    actual += produced
    if (actual > EXCEL_MAX_UNZIPPED) throw corruptFile()
  }
}

export function assertTableSpan(rowCount: number, colCount: number) {
  if (rowCount > EXCEL_MAX_SPAN || colCount > EXCEL_MAX_SPAN) {
    throw new ExcelLimitError(
      `列數與欄數不可以大於 1000。\n偵測到欄數：${colCount}\n偵測到列數：${rowCount}`,
    )
  }
}

export async function parseExcelFile(file: ArrayBuffer): Promise<ParsedWorkbook> {
  await assertXlsxInflate(file)
  const workbook = XLSX.read(file, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel 檔案沒有工作表')
  }
  const sheet = workbook.Sheets[sheetName]
  const ref = sheet['!ref']
  if (ref) {
    const range = XLSX.utils.decode_range(ref)
    assertTableSpan(range.e.r - range.s.r + 1, range.e.c - range.s.c + 1)
  }
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  const hasValue = matrix.some((line) => (line ?? []).some((cell) => cellText(cell)))
  if (!hasValue) {
    throw new Error('請至少包含一列表頭與一列資料')
  }

  const headerIndex = findHeaderIndex(matrix)
  const dataStart = headerIndex >= 0 ? headerIndex + 1 : 0
  const headerCells = headerIndex >= 0 ? (matrix[headerIndex] ?? []).map(cellText) : []
  const columnCount = lastUsedColumn(matrix, headerIndex, headerCells)
  const rawHeaders =
    headerIndex >= 0
      ? headerCells.slice(0, columnCount).map((text, i) => text || `欄位${i + 1}`)
      : Array.from({ length: columnCount }, (_, index) =>
          inferHeaderName(
            matrix.slice(dataStart).map((line) => line?.[index] ?? ''),
            index,
          ),
        )

  // Deduplicate headers
  const seen = new Map<string, number>()
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) ?? 0
    seen.set(h, count + 1)
    return count === 0 ? h : `${h}_${count + 1}`
  })

  const rows: StudentRow[] = []
  for (let i = dataStart; i < matrix.length; i++) {
    const line = matrix[i] ?? []
    const values: Record<string, string> = {}
    let empty = true
    headers.forEach((header, col) => {
      const v = String(line[col] ?? '').trim()
      values[header] = v
      if (v) empty = false
    })
    if (empty) continue
    rows.push({ rowIndex: i, values })
  }

  if (rows.length === 0) {
    throw new Error(headerIndex >= 0 ? '請至少包含一列表頭與一列資料' : '找不到有效的學生資料列')
  }

  const mappings: ColumnMapping[] = headers.map((header) => {
    const role = guessRole(header)
    const known = role === 'name' || role === 'seat' || role === 'studentId'
    return {
      header,
      role: known ? role : 'custom',
      label: header,
      enabled: known,
    }
  })

  return { headers, rows, mappings }
}

/** 檔案視窗關閉時，系統會把那一下點擊送到頁面上。短時間內擋掉，避免點到「重新上傳」。 */
export function swallowFollowingClick() {
  const stop = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  document.addEventListener('click', stop, true)
  window.setTimeout(() => document.removeEventListener('click', stop, true), 1000)
}
