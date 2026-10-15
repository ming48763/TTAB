export interface BusSeat {
  id: string
  /** Percent across the body, from the left. */
  x: number
  /** Percent down the body. Row 1 is at the top. */
  y: number
  code: string
  label: string
}

export interface BusDoor {
  x: number
  y: number
  w: number
  h: number
  name: string
}

export interface BusAisleMark {
  text: string
  y: number
  /** Percent across the body. Omitted marks stay in the center aisle. */
  x?: number
}

export interface BusRowLabel {
  side: 'left' | 'right'
  y: number
  text: string
}

/** Window and aisle columns, as a percent of the reference body. */
const LEFT_WINDOW = 12.6
const LEFT_AISLE = 31.3
const RIGHT_AISLE = 68.7
const RIGHT_WINDOW = 87.4
const SEAT_W = 16.5
const SEAT_H = 6.15
const DOOR_W = 6.2
const LEFT_DOOR_X = LEFT_WINDOW - SEAT_W / 2 + DOOR_W / 2
const RIGHT_DOOR_X = RIGHT_WINDOW + SEAT_W / 2 - DOOR_W / 2

function pair(side: '左' | '右', row: number, y: number): BusSeat[] {
  const windowX = side === '左' ? LEFT_WINDOW : RIGHT_WINDOW
  const aisleX = side === '左' ? LEFT_AISLE : RIGHT_AISLE
  const label = String(row)
  return [
    { id: `${side}${row}窗`, x: windowX, y, code: `${side}${row}窗`, label },
    { id: `${side}${row}道`, x: aisleX, y, code: `${side}${row}道`, label },
  ]
}

/**
 * Portrait coach from the reference sheet.
 * Left has 12 rows, numbered from the top. The right side is numbered 二排 through 六排, then 九排 through 十二排.
 */
export const BUS_SEATS: BusSeat[] = [
  { id: '領隊', x: 50, y: 92.8, code: '領隊', label: '領隊' },
  ...pair('左', 1, 5.6),
  ...pair('左', 2, 12.8),
  ...pair('左', 3, 20.1),
  ...pair('左', 4, 27.2),
  ...pair('左', 5, 34.4),
  ...pair('左', 6, 41.6),
  ...pair('左', 7, 49.1),
  ...pair('左', 8, 63.9),
  ...pair('左', 9, 71.1),
  ...pair('左', 10, 78.4),
  ...pair('左', 11, 85.6),
  ...pair('左', 12, 92.8),
  ...pair('右', 2, 20.1),
  ...pair('右', 3, 27.2),
  ...pair('右', 4, 34.4),
  ...pair('右', 5, 41.6),
  ...pair('右', 6, 49.1),
  ...pair('右', 9, 71.1),
  ...pair('右', 10, 78.4),
  ...pair('右', 11, 85.6),
  ...pair('右', 12, 92.8),
]

export const BUS_DOORS: BusDoor[] = [
  { x: RIGHT_DOOR_X, y: 9.2, w: DOOR_W, h: SEAT_H * 2, name: '前門' },
  { x: RIGHT_DOOR_X, y: 60.3, w: DOOR_W, h: SEAT_H * 2, name: '後門' },
  { x: LEFT_DOOR_X, y: 56.7, w: DOOR_W, h: 7.6, name: '安全門' },
]

export const BUS_AISLE: BusAisleMark[] = [
  { text: '走', y: 40.9 },
  { text: '道', y: 58.8 },
]

const ROW_DIGIT = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

function rowTitle(row: number) {
  if (row < 10) return `${ROW_DIGIT[row]}排`
  if (row === 10) return '十排'
  if (row < 20) return `十${ROW_DIGIT[row - 10]}排`
  return `${row}排`
}

function rowLabels(seats: BusSeat[], side: '左' | '右', rail: BusRowLabel['side']): BusRowLabel[] {
  const rows = new Map<number, number>()
  for (const seat of seats) {
    if (!seat.id.startsWith(`${side}`)) continue
    const row = Number(seat.id.slice(1).replace(/[窗道]/, ''))
    if (!rows.has(row)) rows.set(row, seat.y)
  }
  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([row, y]) => ({ side: rail, y, text: rowTitle(row) }))
}

export const BUS_ROW_LABELS: BusRowLabel[] = [...rowLabels(BUS_SEATS, '左', 'left'), ...rowLabels(BUS_SEATS, '右', 'right')]

/**
 * 19人中巴. Left rows 1–3 sit forward of the right rows. A safety door is on the
 * left, between rows 3 and 4. The front door stays on the right.
 */
const MID_SEAT_H = 10.5
const MID_RIGHT_Y = [8, 32, 45, 58, 71, 84]
const MID_DOOR_Y = (MID_RIGHT_Y[0] + MID_RIGHT_Y[1]) / 2
const MID_DOOR_H = 9
const MID_LEFT_Y = [8, 20, 33, 58, 71, 84]
const MID_SAFE_Y = (MID_LEFT_Y[2] + MID_LEFT_Y[3]) / 2
const MID_SAFE_H = 10
const MID_PITCH = LEFT_AISLE - LEFT_WINDOW
const MID_WALK_X = LEFT_AISLE + MID_PITCH
const MID_RIGHT_X = MID_WALK_X + MID_PITCH
const MID_DOOR_X = MID_RIGHT_X + SEAT_W / 2 - DOOR_W / 2
const MID_PAD_X = LEFT_WINDOW - SEAT_W / 2
const MID_PAD_Y = MID_RIGHT_Y[0] - MID_SEAT_H / 2
const MID_RIGHT_EDGE = MID_RIGHT_X + SEAT_W / 2
const MID_BOTTOM_EDGE = MID_RIGHT_Y[MID_RIGHT_Y.length - 1] + MID_SEAT_H / 2
const MID_SCALE_X = (100 - MID_PAD_X * 2) / (MID_RIGHT_EDGE - MID_PAD_X)
const MID_SCALE_Y = (100 - MID_PAD_Y * 2) / (MID_BOTTOM_EDGE - MID_PAD_Y)
const COACH_ASPECT = 832 / 1000
const MID_ASPECT = COACH_ASPECT * (MID_SCALE_Y / MID_SCALE_X)

function midX(x: number) {
  return MID_PAD_X + (x - MID_PAD_X) * MID_SCALE_X
}

function midY(y: number) {
  return MID_PAD_Y + (y - MID_PAD_Y) * MID_SCALE_Y
}

function midSeat(side: '左' | '右', row: number, kind: '窗' | '道', x: number, y: number): BusSeat {
  const id = `${side}${row}${kind}`
  return { id, x, y, code: id, label: String(row) }
}

const MID_SEATS: BusSeat[] = MID_RIGHT_Y.flatMap((y, index) => {
  const row = index + 1
  const leftY = midY(MID_LEFT_Y[index])
  const rightY = midY(y)
  if (row === MID_RIGHT_Y.length) {
    return [
      midSeat('左', row, '窗', midX(LEFT_WINDOW), rightY),
      midSeat('左', row, '道', midX(LEFT_AISLE), rightY),
      midSeat('右', row, '道', midX(MID_WALK_X), rightY),
      midSeat('右', row, '窗', midX(MID_RIGHT_X), rightY),
    ]
  }
  return [
    midSeat('左', row, '窗', midX(LEFT_WINDOW), leftY),
    midSeat('左', row, '道', midX(LEFT_AISLE), leftY),
    midSeat('右', row, '窗', midX(MID_RIGHT_X), rightY),
  ]
})

const MID_DOORS: BusDoor[] = [
  {
    x: midX(MID_DOOR_X),
    y: midY(MID_DOOR_Y),
    w: DOOR_W * MID_SCALE_X,
    h: MID_DOOR_H * MID_SCALE_Y,
    name: '前門',
  },
  {
    x: midX(LEFT_DOOR_X),
    y: midY(MID_SAFE_Y),
    w: DOOR_W * MID_SCALE_X,
    h: MID_SAFE_H * MID_SCALE_Y,
    name: '安全門',
  },
]

const MID_AISLE: BusAisleMark[] = [
  { text: '走', y: midY(38), x: midX(MID_WALK_X) },
  { text: '道', y: midY(51), x: midX(MID_WALK_X) },
]

/**
 * 20人中巴. The right-side front door swaps places with right row 2.
 * Row 7 has only the outer seats. Row 6 drops the seat under the aisle.
 */
const MID2_RIGHT_Y = [8, MID_DOOR_Y, 45, 58, 71, 84, 97]
const MID2_LEFT_Y = [MID_DOOR_Y, 32, 45, 58, 71, 84, 97]
const MID2_DOOR_Y = 32
const MID2_BOTTOM_EDGE = MID2_RIGHT_Y[MID2_RIGHT_Y.length - 1] + MID_SEAT_H / 2
const MID2_SCALE_Y = (100 - MID_PAD_Y * 2) / (MID2_BOTTOM_EDGE - MID_PAD_Y)
const MID2_ASPECT = COACH_ASPECT * (MID2_SCALE_Y / MID_SCALE_X)

function mid2Y(y: number) {
  return MID_PAD_Y + (y - MID_PAD_Y) * MID2_SCALE_Y
}

const MID2_SEATS: BusSeat[] = MID2_RIGHT_Y.flatMap((y, index) => {
  const row = index + 1
  const leftY = mid2Y(MID2_LEFT_Y[index])
  const rightY = mid2Y(y)
  if (row === MID2_RIGHT_Y.length) {
    return [
      midSeat('左', row, '窗', midX(LEFT_WINDOW), rightY),
      midSeat('右', row, '窗', midX(MID_RIGHT_X), rightY),
    ]
  }
  return [
    midSeat('左', row, '窗', midX(LEFT_WINDOW), leftY),
    midSeat('左', row, '道', midX(LEFT_AISLE), leftY),
    midSeat('右', row, '窗', midX(MID_RIGHT_X), rightY),
  ]
})

const MID2_DOORS: BusDoor[] = [
  {
    x: midX(MID_DOOR_X),
    y: mid2Y(MID2_DOOR_Y),
    w: DOOR_W * MID_SCALE_X,
    h: MID_DOOR_H * MID2_SCALE_Y,
    name: '前門',
  },
]

const MID2_AISLE: BusAisleMark[] = [
  { text: '走', y: mid2Y(38), x: midX(MID_WALK_X) },
  { text: '道', y: mid2Y(51), x: midX(MID_WALK_X) },
]

/**
 * 18人中巴. 20人中巴 without the right seats in rows 1 and 2.
 * The front edge hugs the highest remaining content (left row 1 or the front door),
 * with the same pad as the other midibus edges. The bottom still hugs row 7.
 */
const MID18_TOP_EDGE = Math.min(MID2_LEFT_Y[0] - MID_SEAT_H / 2, MID2_DOOR_Y - MID_DOOR_H / 2)
const MID18_SCALE_Y = (100 - MID_PAD_Y * 2) / (MID2_BOTTOM_EDGE - MID18_TOP_EDGE)
const MID18_ASPECT = COACH_ASPECT * (MID18_SCALE_Y / MID_SCALE_X)

function mid18Y(y: number) {
  return MID_PAD_Y + (y - MID18_TOP_EDGE) * MID18_SCALE_Y
}

const MID18_SEATS: BusSeat[] = MID2_RIGHT_Y.flatMap((y, index) => {
  const row = index + 1
  const leftY = mid18Y(MID2_LEFT_Y[index])
  const rightY = mid18Y(y)
  if (row === MID2_RIGHT_Y.length) {
    return [
      midSeat('左', row, '窗', midX(LEFT_WINDOW), rightY),
      midSeat('右', row, '窗', midX(MID_RIGHT_X), rightY),
    ]
  }
  const left = [
    midSeat('左', row, '窗', midX(LEFT_WINDOW), leftY),
    midSeat('左', row, '道', midX(LEFT_AISLE), leftY),
  ]
  if (row <= 2) return left
  return [...left, midSeat('右', row, '窗', midX(MID_RIGHT_X), rightY)]
})

const MID18_DOORS: BusDoor[] = [
  {
    x: midX(MID_DOOR_X),
    y: mid18Y(MID2_DOOR_Y),
    w: DOOR_W * MID_SCALE_X,
    h: MID_DOOR_H * MID18_SCALE_Y,
    name: '前門',
  },
]

const MID18_AISLE: BusAisleMark[] = [
  { text: '走', y: mid18Y(38), x: midX(MID_WALK_X) },
  { text: '道', y: mid18Y(51), x: midX(MID_WALK_X) },
]

/** Top row first, then left to right. */
export function busSeatOrder(seat: BusSeat) {
  return seat.y * 1000 + seat.x
}

export interface BusCoach {
  id: string
  name: string
  plate: string
  /** Id from BUS_MODELS. */
  model: string
  assignments: Record<string, string>
}

export interface BusPlan {
  id: string
  label: string
  /** Chart width divided by height. */
  aspect: number
  seatW: number
  seatH: number
  seats: BusSeat[]
  doors: BusDoor[]
  aisle: BusAisleMark[]
  rowLabels: BusRowLabel[]
}

export const BUS_PLANS: BusPlan[] = [
  {
    id: 'coach-43',
    label: '43人大巴',
    aspect: COACH_ASPECT,
    seatW: SEAT_W,
    seatH: SEAT_H,
    seats: BUS_SEATS,
    doors: BUS_DOORS,
    aisle: BUS_AISLE,
    rowLabels: BUS_ROW_LABELS,
  },
  {
    id: 'coach-19',
    label: '19人中巴',
    aspect: MID_ASPECT,
    seatW: SEAT_W * MID_SCALE_X,
    seatH: MID_SEAT_H * MID_SCALE_Y,
    seats: MID_SEATS,
    doors: MID_DOORS,
    aisle: MID_AISLE,
    rowLabels: [...rowLabels(MID_SEATS, '左', 'left'), ...rowLabels(MID_SEATS, '右', 'right')],
  },
  {
    id: 'coach-20',
    label: '20人中巴',
    aspect: MID2_ASPECT,
    seatW: SEAT_W * MID_SCALE_X,
    seatH: MID_SEAT_H * MID2_SCALE_Y,
    seats: MID2_SEATS,
    doors: MID2_DOORS,
    aisle: MID2_AISLE,
    rowLabels: [...rowLabels(MID2_SEATS, '左', 'left'), ...rowLabels(MID2_SEATS, '右', 'right')],
  },
  {
    id: 'coach-18',
    label: '18人中巴',
    aspect: MID18_ASPECT,
    seatW: SEAT_W * MID_SCALE_X,
    seatH: MID_SEAT_H * MID18_SCALE_Y,
    seats: MID18_SEATS,
    doors: MID18_DOORS,
    aisle: MID18_AISLE,
    rowLabels: [...rowLabels(MID18_SEATS, '左', 'left'), ...rowLabels(MID18_SEATS, '右', 'right')],
  },
]

export function busPlan(id: string | undefined) {
  return BUS_PLANS.find((plan) => plan.id === id) ?? BUS_PLANS[0]
}

export const BUS_MODELS = BUS_PLANS.map((plan) => ({ id: plan.id, label: plan.label, seats: plan.seats.length }))

export function busModel(id: string | undefined) {
  const plan = busPlan(id)
  return { id: plan.id, label: plan.label, seats: plan.seats.length }
}

/** How many coaches of this seat count are needed for the imported roster. */
export function coachCountForRoster(people: number, seats: number) {
  const capacity = Math.max(1, seats)
  return Math.max(1, Math.ceil(Math.max(0, people) / capacity))
}
