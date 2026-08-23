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

export function guessRole(header: string): FieldRole {
  const h = header.trim()
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

  const rawHeaders = (matrix[0] ?? []).map((cell, i) => {
    const text = String(cell ?? '').trim()
    return text || `欄位${i + 1}`
  })

  // Deduplicate headers
  const seen = new Map<string, number>()
  const headers = rawHeaders.map((h) => {
    const count = seen.get(h) ?? 0
    seen.set(h, count + 1)
    return count === 0 ? h : `${h}_${count + 1}`
  })

  const rows: StudentRow[] = []
  let lastNonEmpty = 0
  for (let i = 1; i < matrix.length; i++) {
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
