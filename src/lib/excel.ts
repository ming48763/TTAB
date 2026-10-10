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

/** School rosters often put a merged title above the real headers. */
function findHeaderIndex(matrix: (string | number | boolean | null)[][]) {
  const limit = Math.min(matrix.length - 1, 8)
  let best = 0
  let bestScore = -1
  for (let i = 0; i < limit; i++) {
    const filled = (matrix[i] ?? []).map(cellText).filter(Boolean)
    if (filled.length < 2) continue
    const hits = filled.filter(looksLikeHeaderCell).length
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

export function parseExcelFile(file: ArrayBuffer): ParsedWorkbook {
  const workbook = XLSX.read(file, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('Excel 檔案沒有工作表')
  }
  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })

  if (matrix.length < 2) {
    throw new Error('請至少包含一列表頭與一列資料')
  }

  const headerIndex = findHeaderIndex(matrix)
  const headerCells = (matrix[headerIndex] ?? []).map(cellText)
  const columnCount = lastUsedColumn(matrix, headerIndex, headerCells)
  const rawHeaders = headerCells.slice(0, columnCount).map((text, i) => text || `欄位${i + 1}`)

  // Deduplicate headers
  const seen = new Map<string, number>()
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) ?? 0
    seen.set(h, count + 1)
    return count === 0 ? h : `${h}_${count + 1}`
  })

  const rows: StudentRow[] = []
  let lastNonEmpty = 0
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const line = matrix[i] ?? []
    const values: Record<string, string> = {}
    let empty = true
    headers.forEach((header, col) => {
      const v = String(line[col] ?? '').trim()
      values[header] = v
      if (v) empty = false
    })
    if (empty) continue
    lastNonEmpty = i
    rows.push({ rowIndex: i, values })
  }

  if (rows.length === 0 || lastNonEmpty === 0) {
    throw new Error('找不到有效的學生資料列')
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
