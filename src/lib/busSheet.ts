import { busPlan, type BusDoor, type BusPlan, type BusSeat } from './busLayout'

export type BusCellKind = 'title' | 'info' | 'label' | 'seat' | 'door' | 'aisle' | 'empty'

export interface BusCellMerge {
  r1: number
  c1: number
  r2: number
  c2: number
}

export interface BusSheetGrid {
  columns: number
  cells: string[][]
  kinds: BusCellKind[][]
  merges: BusCellMerge[]
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function clusterCenters(values: number[], tolerance: number) {
  const sorted = [...values].sort((a, b) => a - b)
  const groups: number[][] = []
  for (const value of sorted) {
    const last = groups.at(-1)
    if (!last || value - last[last.length - 1] > tolerance) groups.push([value])
    else last.push(value)
  }
  return groups.map(mean)
}

function nearest(centers: number[], value: number) {
  let best = 0
  let dist = Infinity
  centers.forEach((center, index) => {
    const next = Math.abs(center - value)
    if (next < dist) {
      dist = next
      best = index
    }
  })
  return best
}

function doorSpan(door: BusDoor) {
  return { top: door.y - door.h / 2, bottom: door.y + door.h / 2 }
}

function covers(door: BusDoor, y: number) {
  const span = doorSpan(door)
  return y >= span.top - 0.05 && y <= span.bottom + 0.05
}

function aisleX(plan: BusPlan) {
  const marked = plan.aisle.find((mark) => mark.x != null)
  return marked?.x ?? 50
}

function bodyColumns(plan: BusPlan) {
  const xs = plan.seats.map((seat) => seat.x)
  xs.push(aisleX(plan))
  return clusterCenters(xs, plan.seatW * 0.45)
}

function bodyRows(plan: BusPlan) {
  const ys = [...plan.seats.map((seat) => seat.y), ...plan.rowLabels.map((label) => label.y)]
  const rows = clusterCenters(ys, Math.max(plan.seatH * 0.55, 0.5))
  for (const door of plan.doors) {
    if (rows.some((y) => covers(door, y))) continue
    rows.push(door.y)
    rows.sort((a, b) => a - b)
  }
  return rows
}

function placeSeats(plan: BusPlan, rows: number[], cols: number[]) {
  const placed = new Map<string, BusSeat>()
  for (const seat of plan.seats) {
    const key = `${nearest(rows, seat.y)}:${nearest(cols, seat.x)}`
    const current = placed.get(key)
    if (!current) {
      placed.set(key, seat)
      continue
    }
    const better =
      Math.abs(seat.y - rows[nearest(rows, seat.y)]) + Math.abs(seat.x - cols[nearest(cols, seat.x)]) <
      Math.abs(current.y - rows[nearest(rows, current.y)]) + Math.abs(current.x - cols[nearest(cols, current.x)])
    if (better) placed.set(key, seat)
  }
  return placed
}

function placeDoors(plan: BusPlan, rows: number[], cols: number[], seats: Map<string, BusSeat>) {
  const walk = nearest(cols, aisleX(plan))
  const placed = new Map<string, string>()
  for (const door of plan.doors) {
    rows.forEach((y, row) => {
      if (!covers(door, y)) return
      cols.forEach((x, col) => {
        if (col === walk) return
        const onSide = door.x < aisleX(plan) ? x < aisleX(plan) : x > aisleX(plan)
        if (!onSide || seats.has(`${row}:${col}`)) return
        placed.set(`${row}:${col}`, door.name)
      })
    })
  }
  return { placed, walk }
}

function labelText(plan: BusPlan, rows: number[], row: number, side: 'left' | 'right') {
  const labels = plan.rowLabels.filter((label) => label.side === side && nearest(rows, label.y) === row)
  return labels[0]?.text ?? ''
}

function maskMerges(mask: boolean[][]) {
  const merges: BusCellMerge[] = []
  if (!mask.length || !mask[0]?.length) return merges
  const used = mask.map((row) => row.map(() => false))
  const rows = mask.length
  const cols = mask[0].length
  function rowFits(row: number, c1: number, c2: number) {
    for (let col = c1; col <= c2; col++) {
      if (!mask[row][col] || used[row][col]) return false
    }
    return true
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!mask[row][col] || used[row][col]) continue
      let c2 = col
      while (c2 + 1 < cols && mask[row][c2 + 1] && !used[row][c2 + 1]) c2++
      let r2 = row
      while (r2 + 1 < rows && rowFits(r2 + 1, col, c2)) r2++
      for (let r = row; r <= r2; r++) {
        for (let c = col; c <= c2; c++) used[r][c] = true
      }
      if (r2 > row || c2 > col) merges.push({ r1: row, c1: col, r2, c2 })
    }
  }
  return merges
}

function splitSpans(columns: number) {
  const first = Math.ceil(columns / 3)
  const second = Math.round(columns / 3)
  const third = columns - first - second
  return [first, second, third]
}

export function buildBusSheet(
  model: string | undefined,
  names: Record<string, string>,
  info: { busName: string; plateNo: string },
): BusSheetGrid {
  const plan = busPlan(model)
  const cols = bodyColumns(plan)
  const rows = bodyRows(plan)
  const seats = placeSeats(plan, rows, cols)
  const { placed: doors, walk } = placeDoors(plan, rows, cols, seats)
  const bodyCount = cols.length
  const columns = bodyCount + 2
  const body: string[][] = []
  const bodyKinds: BusCellKind[][] = []

  for (let row = 0; row < rows.length; row++) {
    const line = Array<string>(columns).fill('')
    const kinds = Array<BusCellKind>(columns).fill('empty')
    const left = labelText(plan, rows, row, 'left')
    const right = labelText(plan, rows, row, 'right')
    line[0] = left
    kinds[0] = left ? 'label' : 'empty'
    line[columns - 1] = right
    kinds[columns - 1] = right ? 'label' : 'empty'
    for (let col = 0; col < bodyCount; col++) {
      const seat = seats.get(`${row}:${col}`)
      const at = col + 1
      if (seat) {
        line[at] = names[seat.id]?.trim() ?? ''
        kinds[at] = 'seat'
        continue
      }
      const door = doors.get(`${row}:${col}`)
      if (door) {
        line[at] = door
        kinds[at] = 'door'
        continue
      }
      if (col === walk) {
        line[at] = '走道'
        kinds[at] = 'aisle'
      }
    }
    body.push(line)
    bodyKinds.push(kinds)
  }

  const doorNames = [...new Set([...doors.values()])]
  const bodyMerges: BusCellMerge[] = []
  for (const name of doorNames) {
    const mask = bodyKinds.map((kinds, row) => kinds.map((kind, col) => kind === 'door' && body[row][col] === name))
    for (const merge of maskMerges(mask)) bodyMerges.push(merge)
  }
  const aisleMask = bodyKinds.map((kinds) => kinds.map((kind) => kind === 'aisle'))
  for (const merge of maskMerges(aisleMask)) bodyMerges.push(merge)

  const headerKinds: BusCellKind[][] = [
    Array<BusCellKind>(columns).fill('title'),
    Array<BusCellKind>(columns).fill('info'),
  ]
  const header: string[][] = [Array<string>(columns).fill(''), Array<string>(columns).fill('')]
  header[0][0] = '遊覽車座位表'
  const count = Object.values(names).filter((name) => name.trim()).length
  const infoText = [`車輛名稱：${info.busName}`, `車牌：${info.plateNo}`, `人數：${count}`]
  const headerMerges: BusCellMerge[] = [{ r1: 0, c1: 0, r2: 0, c2: columns - 1 }]
  let cursor = 0
  splitSpans(columns).forEach((span, index) => {
    header[1][cursor] = infoText[index]
    if (span > 1) headerMerges.push({ r1: 1, c1: cursor, r2: 1, c2: cursor + span - 1 })
    cursor += span
  })

  const shifted = [
    ...headerMerges,
    ...bodyMerges.map((merge) => ({ ...merge, r1: merge.r1 + 2, r2: merge.r2 + 2 })),
  ]

  return {
    columns,
    cells: [...header, ...body],
    kinds: [...headerKinds, ...bodyKinds],
    merges: shifted,
  }
}
