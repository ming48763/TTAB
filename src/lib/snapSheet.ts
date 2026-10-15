import Tesseract from 'tesseract.js'
import type { ColumnMapping, StudentRow } from '../types'
import { clipSnapImage, prepareSnapImage } from './snapPrepare'

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

function keepOcrWord(text: string, confidence: number) {
  const t = text.trim()
  if (!t) return false
  if (/[\u4e00-\u9fff]/.test(t)) return true
  if (/^[|｜\[\]{}()\\\-—=~`'".:;*_]+$/.test(t)) return false
  if (/^\d{1,4}$/.test(t)) return confidence >= 10
  if (/^[xX×✓✔]$/.test(t)) return confidence >= 10
  return confidence >= 60 && /[A-Za-z0-9]/.test(t)
}

function columnRanges(words: { x0: number; x1: number }[], gap: number) {
  const spans = words.map((word) => [word.x0, word.x1] as [number, number]).sort((a, b) => a[0] - b[0])
  const ranges: [number, number][] = []
  for (const [start, end] of spans) {
    const last = ranges[ranges.length - 1]
    if (!last || start > last[1] + gap) ranges.push([start, end])
    else last[1] = Math.max(last[1], end)
  }
  return ranges
}

function rangeIndex(x: number, ranges: [number, number][]) {
  const hit = ranges.findIndex(([start, end]) => x >= start && x <= end)
  if (hit >= 0) return hit
  return nearestCol(
    x,
    ranges.map(([start, end]) => (start + end) / 2),
  )
}

/** Build table from Tesseract word boxes. */
export function tableFromWords(
  words: { text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[],
): SnapTable {
  const usable = words
    .map((word) => ({
      text: word.text.trim(),
      confidence: word.confidence ?? 100,
      x0: word.bbox.x0,
      x1: word.bbox.x1,
      x: (word.bbox.x0 + word.bbox.x1) / 2,
      y: (word.bbox.y0 + word.bbox.y1) / 2,
      h: Math.max(1, word.bbox.y1 - word.bbox.y0),
    }))
    .filter((word) => keepOcrWord(word.text, word.confidence))

  if (usable.length === 0) {
    return {
      headers: ['欄1', '欄2', '欄3'],
      rows: Array.from({ length: 5 }, () => ['', '', '']),
    }
  }

  const avgH = usable.reduce((sum, word) => sum + word.h, 0) / usable.length
  const charWidths = usable.map((word) => (word.x1 - word.x0) / Math.max(1, [...word.text].length))
  const sortedWidths = [...charWidths].sort((a, b) => a - b)
  const charW = sortedWidths[Math.floor(sortedWidths.length / 2)] ?? 16
  const rowTol = Math.max(8, avgH * 0.55)
  const sorted = [...usable].sort((a, b) => a.y - b.y || a.x - b.x)
  const lines: typeof usable[] = []
  for (const word of sorted) {
    const last = lines[lines.length - 1]
    if (!last || Math.abs(word.y - last[0].y) > rowTol) lines.push([word])
    else last.push(word)
  }

  const ranges = columnRanges(usable, Math.max(8, charW * 0.65))
  const colCount = Math.max(1, ranges.length)
  const matrix = lines.map((line) => {
    const byCol = Array.from({ length: colCount }, () => [] as string[])
    const ordered = [...line].sort((a, b) => a.x - b.x)
    for (const word of ordered) byCol[rangeIndex(word.x, ranges)].push(word.text)
    return byCol.map((parts) => parts.join('').replace(/[|｜]/g, '').replace(/\s+/g, ' ').trim())
  })

  const headerAt = matrix.findIndex((row, index) => index < 5 && row.some((cell) => /姓名|座號|學號|分數|成績|科目|名次/.test(cell)))
  if (headerAt >= 0) {
    return {
      headers: matrix[headerAt].map((header, index) => header || `欄${index + 1}`),
      rows: matrix.slice(headerAt + 1).filter((row) => row.some((cell) => /[\u4e00-\u9fff]|\d/.test(cell))),
    }
  }
  return {
    headers: Array.from({ length: colCount }, (_, index) => `欄${index + 1}`),
    rows: matrix.filter((row) => row.some((cell) => /[\u4e00-\u9fff]|\d/.test(cell))),
  }
}

function tableFromPlainText(text: string): SnapTable {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /[\u4e00-\u9fff]|\d/.test(line))
  const split = lines.map((line) =>
    line
      .split(/\s{2,}|\t+|\|/)
      .map((cell) => cell.replace(/[|｜]/g, '').trim())
      .filter((cell) => cell && !/^[|｜\[\]{}()\\\-—=~`'".:;*_]+$/.test(cell)),
  )
  const rows = split.filter((row) => row.length > 0)
  if (rows.length === 0) {
    return { headers: ['欄1'], rows: [] }
  }
  const colCount = Math.max(...rows.map((row) => row.length))
  const matrix = rows.map((row) => Array.from({ length: colCount }, (_, index) => row[index] ?? ''))
  const headerAt = matrix.findIndex((row, index) => index < 6 && row.some((cell) => /姓名|座號|學號/.test(cell)))
  if (headerAt >= 0) {
    return {
      headers: matrix[headerAt].map((header, index) => header || `欄${index + 1}`),
      rows: matrix.slice(headerAt + 1),
    }
  }
  return {
    headers: Array.from({ length: colCount }, (_, index) => `欄${index + 1}`),
    rows: matrix,
  }
}

function likelyName(name: string) {
  if (name.length < 2 || name.length > 4) return false
  if (/[圖框線]/.test(name)) return false
  return (name.match(/[一國加中點單]/g) ?? []).length < 2
}

function rosterFromOcrText(texts: string[]): SnapTable | null {
  const seen = new Set<string>()
  const rows: { seat: number | null; name: string; score: string }[] = []
  for (const text of texts) {
    for (const raw of text.split(/\n/)) {
      const line = raw.replace(/[|｜]/g, ' ').replace(/\s+/g, ' ').trim()
      const runs = line.match(/[\u4e00-\u9fff]+/g) ?? []
      if (runs.some((part) => part.length > 6)) continue
      const name = runs.filter((part) => part.length >= 2 && part.length <= 4).find(likelyName)
      if (!name || seen.has(name)) continue
      const seatMatch = line.match(/(?:^|\s)(\d{1,2})(?:\s|$)/)
      let seat = seatMatch ? Number(seatMatch[1]) : null
      if (seat != null && (seat < 1 || seat > 80)) seat = null
      const score = [...line.matchAll(/(?:^|\D)(\d{2,3})(?=\D|$)/g)]
        .map((match) => match[1] ?? '')
        .find((num) => num !== seatMatch?.[1] && Number(num) >= 10 && Number(num) <= 100)
      if (name.length !== 3 && seat == null && !score) continue
      seen.add(name)
      rows.push({ seat, name, score: score ?? '' })
    }
  }
  if (rows.length < 4) return null
  rows.sort((a, b) => (a.seat ?? 999) - (b.seat ?? 999) || a.name.localeCompare(b.name, 'zh-Hant'))
  return {
    headers: ['座號', '姓名', '成績'],
    rows: rows.map((row) => [row.seat == null ? '' : String(row.seat), row.name, row.score]),
  }
}

function noiseRatio(table: SnapTable) {
  const cells = table.rows.flat().filter((cell) => cell.trim())
  if (cells.length === 0) return 1
  const noise = cells.filter((cell) => !/[\u4e00-\u9fff]{2,}/.test(cell) && !/^\d{1,3}$/.test(cell))
  return noise.length / cells.length
}

function nameHits(table: SnapTable) {
  return table.rows.reduce((sum, row) => {
    const found = (row ?? []).join('').match(/[\u4e00-\u9fff]{2,}/g)
    return sum + (found?.length ?? 0)
  }, 0)
}

type SnapWorker = Awaited<ReturnType<typeof Tesseract.createWorker>>

function rowDarkness(data: Uint8ClampedArray, width: number, height: number, x0 = 0, x1 = width) {
  const frac = new Float32Array(height)
  const span = Math.max(1, x1 - x0)
  for (let y = 0; y < height; y += 1) {
    let n = 0
    const row = y * width
    for (let x = x0; x < x1; x += 1) {
      if ((data[(row + x) * 4] ?? 255) < 140) n += 1
    }
    frac[y] = n / span
  }
  return frac
}

function darknessPeaks(frac: Float32Array, minFrac: number, minGap: number) {
  const peaks: number[] = []
  for (let i = 2; i < frac.length - 2; i += 1) {
    if (frac[i] < minFrac) continue
    if (frac[i] < frac[i - 1] || frac[i] < frac[i + 1]) continue
    if (frac[i] < frac[i - 2] || frac[i] < frac[i + 2]) continue
    const last = peaks[peaks.length - 1]
    if (last != null && i - last < minGap) {
      if (frac[i] > frac[last]) peaks[peaks.length - 1] = i
      continue
    }
    peaks.push(i)
  }
  return peaks
}

function horizontalRules(frac: Float32Array, minFrac = 0.3) {
  const peaks = darknessPeaks(frac, minFrac, 8)
  const gaps: number[] = []
  for (let i = 1; i < peaks.length; i += 1) {
    const gap = peaks[i] - peaks[i - 1]
    if (gap >= 45 && gap <= 120) gaps.push(gap)
  }
  if (gaps.length < 4) return []
  gaps.sort((a, b) => a - b)
  const pitch = gaps[Math.floor(gaps.length / 2)] ?? 0
  if (pitch < 45) return []
  let seed = peaks[0] ?? 0
  let seedScore = -1
  for (const y of peaks) {
    const linked = peaks.some((other) => other !== y && Math.abs(Math.abs(other - y) - pitch) < pitch * 0.3)
    if (linked && frac[y] > seedScore) {
      seedScore = frac[y]
      seed = y
    }
  }
  const used = new Set<number>()
  const snap = (expected: number) => {
    let best = -1
    let bestDist = pitch * 0.36
    for (const y of peaks) {
      if (used.has(y)) continue
      const dist = Math.abs(y - expected)
      if (dist < bestDist) {
        bestDist = dist
        best = y
      }
    }
    return best
  }
  const walk = (dir: 1 | -1) => {
    const found: number[] = []
    let cursor = seed
    let misses = 0
    for (let guard = 0; guard < 40; guard += 1) {
      const expected = cursor + dir * pitch
      if (expected < 8 || expected > frac.length - 8) break
      const hit = snap(expected)
      if (hit < 0) {
        misses += 1
        if (misses >= 2 || (frac[Math.round(expected)] ?? 0) < 0.06) break
        found.push(Math.round(expected))
        cursor = expected
        continue
      }
      misses = 0
      used.add(hit)
      found.push(hit)
      cursor = hit
    }
    return found
  }
  used.add(seed)
  const down = walk(1)
  const up = walk(-1).reverse()
  const lines = [...up, seed, ...down]
  return lines.length >= 8 ? lines : []
}

function emptyGridBand(data: Uint8ClampedArray, width: number, height: number) {
  const y0 = Math.floor(height * 0.28)
  const y1 = Math.floor(height * 0.82)
  const count = new Float32Array(width)
  let samples = 0
  const gray = (x: number, y: number) => data[(y * width + x) * 4] ?? 255
  for (let y = y0; y < y1; y += 3) {
    samples += 1
    for (let x = 4; x < width - 4; x += 1) {
      if (gray(x, y) >= 140) continue
      let left = 0
      let right = 0
      while (left < 6 && x - left - 1 >= 0 && gray(x - left - 1, y) < 140) left += 1
      while (right < 6 && x + right + 1 < width && gray(x + right + 1, y) < 140) right += 1
      if (left + right <= 2) count[x] += 1
    }
  }
  if (samples < 8) return null
  const peaks: number[] = []
  for (let x = 2; x < width - 2; x += 1) {
    if (count[x] / samples < 0.18) continue
    if (count[x] < count[x - 1] || count[x] < count[x + 1]) continue
    const last = peaks[peaks.length - 1]
    if (last != null && x - last < 16) {
      if (count[x] > count[last]) peaks[peaks.length - 1] = x
      continue
    }
    peaks.push(x)
  }
  let bestStart = 0
  let bestLen = 0
  let start = 0
  for (let i = 1; i <= peaks.length; i += 1) {
    const gap = i < peaks.length ? peaks[i] - peaks[i - 1] : 999
    if (gap < 28 || gap > 90) {
      const len = i - start
      if (len > bestLen) {
        bestLen = len
        bestStart = start
      }
      start = i
    }
  }
  if (bestLen < 4) return null
  return { x0: peaks[bestStart] ?? 0, x1: peaks[bestStart + bestLen - 1] ?? width }
}

function contentSpan(data: Uint8ClampedArray, width: number, y0: number, y1: number, rightLimit: number) {
  const dark = new Uint8Array(width)
  const top = Math.max(0, y0)
  const bottom = Math.min(Math.floor(data.length / 4 / width), y1)
  const gray = (x: number, y: number) => data[(y * width + x) * 4] ?? 255
  const limit = Math.min(width - 1, rightLimit)
  const xMin = Math.max(0, limit - 680)
  for (let y = top; y < bottom; y += 2) {
    let rule = 0
    let seen = 0
    const probe = Math.max(0, limit - 220)
    for (let x = probe; x < limit; x += 2) {
      seen += 1
      if (gray(x, y) < 150) rule += 1
    }
    if (seen > 0 && rule / seen > 0.35) continue
    for (let x = xMin; x < limit; x += 2) {
      if (gray(x, y) >= 150) continue
      if (gray(x - 2, y) >= 150 && gray(x + 2, y) >= 150) continue
      dark[x] = 1
      dark[x + 1] = 1
    }
  }
  const clusters: { start: number; end: number; pixels: number }[] = []
  let start = -1
  let gap = 0
  let pixels = 0
  for (let x = xMin; x <= limit; x += 1) {
    if (dark[x]) {
      if (start < 0) start = x
      pixels += 1
      gap = 0
      continue
    }
    if (start < 0) continue
    gap += 1
    if (gap > 18) {
      if (pixels > 8) clusters.push({ start, end: x - gap, pixels })
      start = -1
      pixels = 0
    }
  }
  if (start >= 0 && pixels > 8) clusters.push({ start, end: limit, pixels })
  if (clusters.length === 0) return null
  const name = clusters.reduce((best, cluster) => (cluster.pixels > best.pixels ? cluster : best))
  if (name.pixels < 12 || name.end - name.start < 12) return null
  const score = clusters.find((cluster) => cluster.start > name.end && cluster.start - name.end < 90)
  const seat = [...clusters].reverse().find((cluster) => cluster.end < name.start && name.start - cluster.end < 90)
  const box = (cluster: { start: number; end: number } | undefined, pad: number) =>
    cluster ? { x0: Math.max(0, cluster.start - pad), x1: Math.min(width, cluster.end + pad) } : null
  return { seat: box(seat, 4), name: box(name, 6), score: box(score, 4) }
}

function cellImage(source: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number) {
  const inset = 2
  const sx = x0 + inset
  const sy = y0 + inset
  const sw = Math.max(1, x1 - x0 - inset * 2)
  const sh = Math.max(1, y1 - y0 - inset * 2)
  const scale = Math.min(4, Math.max(2, 120 / sh))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(32, Math.round(sw * scale))
  canvas.height = Math.max(32, Math.round(sh * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = image.data
  const w = canvas.width
  const h = canvas.height
  for (let y = 0; y < h; y += 1) {
    for (let x = 2; x < w - 2; x += 1) {
      const i = (y * w + x) * 4
      if ((pixels[i] ?? 255) > 160) continue
      const left = pixels[(y * w + x - 2) * 4] ?? 255
      const right = pixels[(y * w + x + 2) * 4] ?? 255
      if (left > 180 && right > 180) {
        pixels[i] = 255
        pixels[i + 1] = 255
        pixels[i + 2] = 255
      }
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function lineText(worker: SnapWorker, canvas: HTMLCanvasElement) {
  const result = await worker.recognize(canvas)
  return (result.data.text ?? '').replace(/\s+/g, '')
}

async function bitmapCanvas(blob: Blob) {
  const img = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0)
  img.close()
  return canvas
}

async function readRuledTable(
  worker: SnapWorker,
  blob: Blob,
  onProgress?: (p: OcrProgress) => void,
): Promise<SnapTable | null> {
  const canvas = await bitmapCanvas(blob)
  const ctx = canvas?.getContext('2d', { willReadFrequently: true })
  if (!canvas || !ctx) return null
  const width = canvas.width
  const height = canvas.height
  const data = ctx.getImageData(0, 0, width, height).data
  const band = emptyGridBand(data, width, height)
  const gridYs = band ? horizontalRules(rowDarkness(data, width, height, band.x0, band.x1)) : []
  if (!band || gridYs.length < 8) return null
  const ys = gridYs
  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE,
    user_defined_dpi: '300',
  })
  const rows: SnapCell[][] = []
  const readBand = async (top: number, bottom: number) => {
    if (bottom - top < 16 || top < 0 || bottom > height) return null
    const span = contentSpan(data, width, top + 8, bottom - 8, band.x0 - 6)
    if (!span?.name) return null
    const nameText = await lineText(worker, cellImage(canvas, span.name.x0, top + 6, span.name.x1, bottom - 6))
    const name = (nameText.match(/[\u4e00-\u9fff]{2,4}/) ?? [])[0] ?? ''
    if (!name || /座號|姓名|備註|成績|分數|點名|名單/.test(name) || !likelyName(name)) return null
    let seat = ''
    if (span.seat) {
      const seatText = await lineText(worker, cellImage(canvas, span.seat.x0, top + 6, span.seat.x1, bottom - 6))
      const seatNum = Number((seatText.match(/\d{1,2}/) ?? [])[0])
      if (seatNum >= 1 && seatNum <= 60) seat = String(seatNum)
    }
    let score = ''
    if (span.score) {
      const scoreText = await lineText(worker, cellImage(canvas, span.score.x0, top + 6, span.score.x1, bottom - 6))
      const digits = scoreText.match(/\d{1,3}/)
      if (digits && Number(digits[0]) <= 100) score = String(Number(digits[0]))
      else if (/[xX×✗✘ㄨ乂]/.test(scoreText)) score = 'X'
    }
    if (!score) {
      const trailing = nameText.match(/(\d{2,3})\D*$/)
      if (trailing && Number(trailing[1]) <= 100) score = String(Number(trailing[1]))
      else if (/[xX×✗✘]/.test(nameText)) score = 'X'
    }
    return { seat, name, score, x0: span.name.x0, x1: span.name.x1, width: span.name.x1 - span.name.x0 }
  }
  const found: ({ seat: string; name: string; score: string; x0: number; x1: number; width: number } | null)[] = []
  for (let i = 0; i < ys.length - 1; i += 1) {
    const y0 = ys[i]
    const y1 = ys[i + 1]
    onProgress?.({ status: `讀取第 ${i + 1} 列`, progress: (i + 1) / (ys.length - 1) })
    let hit = await readBand(y0, y1)
    if (!hit || hit.width > 260) {
      const nudged = await readBand(y0 - 12, y1 - 12)
      if (nudged && (!hit || nudged.width < hit.width)) hit = nudged
    }
    if (!hit || hit.width > 260) {
      const nudged = await readBand(y0 + 12, y1 + 12)
      if (nudged && (!hit || nudged.width < hit.width)) hit = nudged
    }
    found.push(hit && hit.width <= 280 ? hit : null)
  }
  const tight = found.filter((hit) => hit != null)
  if (tight.length >= 3) {
    const lefts = tight.map((hit) => hit.x0).sort((a, b) => a - b)
    const rights = tight.map((hit) => hit.x1).sort((a, b) => a - b)
    const mid = Math.floor(tight.length / 2)
    const x0 = lefts[mid] ?? 0
    const x1 = rights[mid] ?? 0
    for (let i = 0; i < found.length; i += 1) {
      if (found[i]) continue
      const y0 = ys[i]
      const y1 = ys[i + 1]
      if (y1 - y0 < 16) continue
      const nameText = await lineText(worker, cellImage(canvas, x0 - 8, y0 + 6, x1 + 8, y1 - 6))
      const name = (nameText.match(/[\u4e00-\u9fff]{2,4}/) ?? [])[0] ?? ''
      if (!name || /座號|姓名|備註|成績|分數|點名|名單/.test(name) || !likelyName(name)) continue
      const seatText = await lineText(worker, cellImage(canvas, Math.max(0, x0 - 90), y0 + 6, x0 - 4, y1 - 6))
      const seatNum = Number((seatText.match(/\d{1,2}/) ?? [])[0])
      const seat = seatNum >= 1 && seatNum <= 60 ? String(seatNum) : ''
      const scoreText = await lineText(worker, cellImage(canvas, x1 + 2, y0 + 6, x1 + 90, y1 - 6))
      const digits = scoreText.match(/\d{1,3}/)
      let score = ''
      if (digits && Number(digits[0]) <= 100) score = String(Number(digits[0]))
      else if (/[xX×✗✘ㄨ乂]/.test(scoreText)) score = 'X'
      found[i] = { seat, name, score, x0, x1, width: x1 - x0 }
    }
  }
  for (const hit of found) {
    if (!hit) continue
    rows.push([hit.seat, hit.name, hit.score])
  }
  if (rows.length < 4) return null
  return { headers: ['座號', '姓名', '成績'], rows }
}

export async function ocrImageToTable(
  source: File | Blob | string,
  onProgress?: (p: OcrProgress) => void,
): Promise<SnapTable> {
  onProgress?.({ status: '整理照片…', progress: 0 })
  let image: Blob | string = source
  if (typeof source !== 'string') {
    try {
      image = await prepareSnapImage(source)
    } catch (err) {
      console.error(err)
    }
  }
  const worker = await Tesseract.createWorker('chi_tra+eng', 1, {
    logger: (m) => {
      if (m.status && typeof m.progress === 'number') {
        onProgress?.({ status: m.status, progress: m.progress })
      }
    },
  })
  try {
    if (typeof image !== 'string') {
      try {
        const ruled = await readRuledTable(worker, image, onProgress)
        if (ruled) return ruled
      } catch (err) {
        console.error(err)
      }
    }
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: '300',
    })
    const targets: (Blob | string)[] = [image]
    if (typeof image !== 'string') {
      try {
        targets.push(await clipSnapImage(image, 0, 0.46))
      } catch (err) {
        console.error(err)
      }
    }
    const texts: string[] = []
    let best: SnapTable | null = null
    let bestScore = -1
    for (const target of targets) {
      try {
        const result = await worker.recognize(target)
        texts.push(result.data.text ?? '')
        const words: { text: string; confidence?: number; bbox: { x0: number; y0: number; x1: number; y1: number } }[] = []
        for (const block of result.data.blocks ?? []) {
          for (const para of block.paragraphs ?? []) {
            for (const line of para.lines ?? []) {
              for (const word of line.words ?? []) {
                words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox })
              }
            }
          }
        }
        const fromWords = words.length > 0 ? tableFromWords(words) : null
        const fromText = tableFromPlainText(result.data.text ?? '')
        const wordScore = fromWords ? nameHits(fromWords) : 0
        const textScore = nameHits(fromText)
        const table = textScore > wordScore ? fromText : fromWords
        const score = Math.max(wordScore, textScore)
        if (table && score > bestScore) {
          best = table
          bestScore = score
        }
      } catch (err) {
        console.error(err)
      }
    }
    const roster = rosterFromOcrText(texts)
    if (roster && (!best || noiseRatio(best) > 0.4)) return roster
    if (best && (bestScore > 0 || best.rows.some((row) => (row ?? []).some((cell) => cell.trim())))) return best
  } finally {
    await worker.terminate()
  }

  return {
    headers: ['座號', '姓名', '成績'],
    rows: Array.from({ length: 5 }, () => ['', '', '']),
  }
}

export function emptySnapTable(cols = 3, rows = 8): SnapTable {
  return {
    headers: Array.from({ length: cols }, (_, i) => (i === 0 ? '座號' : i === 1 ? '姓名' : `欄${i + 1}`)),
    rows: Array.from({ length: rows }, () => Array.from({ length: cols }, () => '')),
  }
}
