import Tesseract from 'tesseract.js'
import type { ColumnMapping, StudentRow } from '../types'

export type SnapCell = string

export interface SnapTable {
  headers: string[]
  rows: SnapCell[][]
}

export interface OcrProgress {
  status: string
  progress: number
}

export interface RosterPerson {
  seat: string
  name: string
  studentId: string
}

function normalizeName(s: string) {
  return s.replace(/\s+/g, '').trim()
}

function editDistance(a: string, b: string) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

export function rosterFromStudents(rows: StudentRow[], mappings: ColumnMapping[]): RosterPerson[] {
  const seatH = mappings.find((m) => m.role === 'seat')?.header
  const nameH = mappings.find((m) => m.role === 'name')?.header
  const idH = mappings.find((m) => m.role === 'studentId')?.header
  return rows
    .map((r) => ({
      seat: seatH ? (r.values[seatH] ?? '').trim() : '',
      name: nameH ? (r.values[nameH] ?? '').trim() : '',
      studentId: idH ? (r.values[idH] ?? '').trim() : '',
    }))
    .filter((p) => p.name || p.seat)
}

export function bestNameMatch(raw: string, roster: RosterPerson[]) {
  const q = normalizeName(raw)
  if (!q || roster.length === 0) return null
  let best: { person: RosterPerson; dist: number } | null = null
  for (const person of roster) {
    const n = normalizeName(person.name)
    if (!n) continue
    if (n === q) return { person, dist: 0, exact: true as const }
    const dist = editDistance(q, n)
    if (!best || dist < best.dist) best = { person, dist }
  }
  if (!best) return null
  const maxAllow = Math.max(1, Math.floor(normalizeName(best.person.name).length / 3))
  if (best.dist > maxAllow) return null
  return { ...best, exact: best.dist === 0 }
}

export function guessNameCol(headers: string[], rows: SnapCell[][]) {
  const nameHints = [/姓名/, /名字/, /name/i]
  for (let c = 0; c < headers.length; c++) {
    if (nameHints.some((re) => re.test(headers[c]))) return c
  }
  // Prefer column with more CJK chars
  let best = -1
  let bestScore = -1
  for (let c = 0; c < headers.length; c++) {
    let score = 0
    for (const row of rows) {
      const v = row[c] ?? ''
      if (/[\u4e00-\u9fff]/.test(v)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

export function guessScoreCols(headers: string[], rows: SnapCell[][]) {
  const skip = [/姓名/, /名字/, /座號/, /座号/, /學號/, /学号/, /名次/, /排名/, /總分/, /平均/, /備註/]
  const cols: number[] = []
  for (let c = 0; c < headers.length; c++) {
    if (skip.some((re) => re.test(headers[c]))) continue
    let nums = 0
    let cells = 0
    for (const row of rows) {
      const v = (row[c] ?? '').trim()
      if (!v) continue
      cells += 1
      if (/^-?\d+(\.\d+)?$/.test(v.replace(/,/g, ''))) nums += 1
    }
    if (cells > 0 && nums / cells >= 0.5) cols.push(c)
  }
  return cols
}

function parseNum(v: string) {
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export function applyStats(
  table: SnapTable,
  scoreCols: number[],
  opts: { total: boolean; average: boolean; rank: boolean },
): SnapTable {
  const headers = [...table.headers]
  const rows = table.rows.map((r) => [...r])
  const drop = new Set(['總分', '平均', '排名'])
  // Remove previous stat columns
  for (let c = headers.length - 1; c >= 0; c--) {
    if (drop.has(headers[c])) {
      headers.splice(c, 1)
      for (const row of rows) row.splice(c, 1)
      scoreCols = scoreCols.filter((i) => i < c).map((i) => (i > c ? i - 1 : i))
    }
  }
  const validScores = scoreCols.filter((c) => c >= 0 && c < headers.length)
  if (validScores.length === 0) return { headers, rows }

  const totals = rows.map((row) => {
    const vals = validScores.map((c) => parseNum(row[c] ?? '')).filter((n): n is number => n != null)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0)
  })
  const averages = rows.map((row) => {
    const vals = validScores.map((c) => parseNum(row[c] ?? '')).filter((n): n is number => n != null)
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  })

  if (opts.total) {
    headers.push('總分')
    rows.forEach((row, i) => row.push(totals[i] == null ? '' : String(Math.round(totals[i]! * 100) / 100)))
  }
  if (opts.average) {
    headers.push('平均')
    rows.forEach((row, i) =>
      row.push(averages[i] == null ? '' : String(Math.round(averages[i]! * 100) / 100)),
    )
  }
  if (opts.rank) {
    const keys = opts.total ? totals : averages
    const order = keys
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v != null)
      .sort((a, b) => (b.v as number) - (a.v as number))
    const ranks = Array(rows.length).fill('')
    let place = 0
    let last: number | null = null
    order.forEach((item, idx) => {
      if (last == null || item.v !== last) {
        place = idx + 1
        last = item.v
      }
      ranks[item.i] = String(place)
    })
    headers.push('排名')
    rows.forEach((row, i) => row.push(ranks[i]))
  }
  return { headers, rows }
}

function clusterColumns(xs: number[], tolerance: number) {
  if (xs.length === 0) return [] as number[]
  const sorted = [...xs].sort((a, b) => a - b)
  const centers: number[] = [sorted[0]]
  const counts: number[] = [1]
  for (let i = 1; i < sorted.length; i++) {
    const x = sorted[i]
    const last = centers.length - 1
    if (Math.abs(x - centers[last]) <= tolerance) {
      centers[last] = (centers[last] * counts[last] + x) / (counts[last] + 1)
      counts[last] += 1
    } else {
      centers.push(x)
      counts.push(1)
    }
  }
  return centers
}

function nearestCol(x: number, centers: number[]) {
  let best = 0
  let bestD = Infinity
  centers.forEach((c, i) => {
    const d = Math.abs(c - x)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

/** Build table from Tesseract word boxes. */
export function tableFromWords(
  words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[],
): SnapTable {
  const usable = words
    .map((w) => ({
      text: w.text.trim(),
      x: (w.bbox.x0 + w.bbox.x1) / 2,
      y: (w.bbox.y0 + w.bbox.y1) / 2,
      h: Math.max(1, w.bbox.y1 - w.bbox.y0),
    }))
    .filter((w) => w.text.length > 0)

  if (usable.length === 0) {
    return {
      headers: ['欄1', '欄2', '欄3'],
      rows: Array.from({ length: 5 }, () => ['', '', '']),
    }
  }

  const avgH = usable.reduce((s, w) => s + w.h, 0) / usable.length
  const rowTol = Math.max(10, avgH * 0.7)
  const sorted = [...usable].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: typeof usable[] = []
  for (const w of sorted) {
    const last = lines[lines.length - 1]
    if (!last || Math.abs(w.y - last[0].y) > rowTol) lines.push([w])
    else last.push(w)
  }

  const allX = usable.map((w) => w.x)
  const width = Math.max(...usable.map((w) => w.x)) - Math.min(...allX)
  const colTol = Math.max(18, width / 18)
  const centers = clusterColumns(allX, colTol)
  const colCount = Math.max(1, centers.length)

  const matrix = lines.map((line) => {
    const byCol = Array.from({ length: colCount }, () => [] as string[])
    for (const w of line) {
      byCol[nearestCol(w.x, centers)].push(w.text)
    }
    return byCol.map((parts) => parts.join(''))
  })

  if (matrix.length === 0) {
    return { headers: Array.from({ length: colCount }, (_, i) => `欄${i + 1}`), rows: [] }
  }

  const headerLike = matrix[0].some((c) => /姓名|座號|學號|分數|成績|科目|名次/.test(c))
  if (headerLike) {
    return {
      headers: matrix[0].map((h, i) => h || `欄${i + 1}`),
      rows: matrix.slice(1),
    }
  }
  return {
    headers: Array.from({ length: colCount }, (_, i) => `欄${i + 1}`),
    rows: matrix,
  }
}

export async function ocrImageToTable(
  source: File | Blob | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<SnapTable> {
  const result = await Tesseract.recognize(source, 'chi_tra+eng', {
    logger: (m) => {
      if (m.status && typeof m.progress === 'number') {
        onProgress?.({ status: m.status, progress: m.progress })
      }
    },
  })
  const words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = []
  for (const block of result.data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const w of line.words ?? []) {
          words.push({ text: w.text, bbox: w.bbox })
        }
      }
    }
  }
  if (words.length > 0) return tableFromWords(words)

  const lines = (result.data.text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) {
    return {
      headers: ['座號', '姓名', '成績'],
      rows: Array.from({ length: 5 }, () => ['', '', '']),
    }
  }
  const split = lines.map((l) => l.split(/\s{2,}|\t+/).map((c) => c.trim()).filter(Boolean))
  const colCount = Math.max(...split.map((r) => r.length), 1)
  const padded = split.map((r) => Array.from({ length: colCount }, (_, i) => r[i] ?? ''))
  return {
    headers: Array.from({ length: colCount }, (_, i) => `欄${i + 1}`),
    rows: padded,
  }
}

export function emptySnapTable(cols = 3, rows = 8): SnapTable {
  return {
    headers: Array.from({ length: cols }, (_, i) => (i === 0 ? '座號' : i === 1 ? '姓名' : `欄${i + 1}`)),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
  }
}
