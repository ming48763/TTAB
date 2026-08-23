export type PlateMode = 'desk' | 'badge-single' | 'badge-double'

export type FieldRole = 'name' | 'seat' | 'studentId' | 'custom' | 'ignore'

export type AppStep = 'upload' | 'map' | 'choose' | 'edit' | 'booth'

export type PaperSizeId = 'A3' | 'A4' | 'B5'

export type PageOrientation = 'portrait' | 'landscape'

export const SEQUENCE_HEADER = '__sequence__'
/** @deprecated use SEQUENCE_HEADER */
export const ALPHABET_HEADER = SEQUENCE_HEADER

export type FoldLineStyle = 'dashed' | 'solid'
export type FoldLineWeight = 'thin' | 'regular' | 'bold'
export type FoldLineTone = 'light' | 'medium' | 'dark'

export type CardDecorKind =
  | 'none'
  | 'inset-fill'
  | 'inset-line'
  | 'band'
  | 'header'
  | 'bars'
  | 'double-frame'
  | 'oval'

export interface CardDecor {
  kind: CardDecorKind
  color: string
  lineStyle: FoldLineStyle
}

export const CARD_DECOR_CHOICES: { id: CardDecorKind; label: string }[] = [
  { id: 'none', label: '無' },
  { id: 'inset-fill', label: '白底圓角框' },
  { id: 'inset-line', label: '圓角線框' },
  { id: 'double-frame', label: '雙層線框' },
  { id: 'oval', label: '橢圓白底' },
  { id: 'band', label: '中間色帶' },
  { id: 'header', label: '頂部色條' },
  { id: 'bars', label: '上下色條' },
]

export const CARD_DECOR_COLORS = [
  '#0f6e56',
  '#0a4d3c',
  '#1a3a32',
  '#4a635c',
  '#2c6e7a',
  '#3d5a80',
  '#6b7c3e',
  '#c4a574',
  '#d4b896',
  '#b85c38',
  '#9b2c2c',
  '#8b3a4a',
  '#5c4a63',
  '#2f2a26',
  '#e8f2ee',
  '#dce8e3',
  '#f4efe6',
  '#f3e4c8',
  '#f6d9d4',
  '#d9e4f0',
  '#e8eedc',
  '#efe6f0',
] as const

export const DEFAULT_CARD_DECOR: CardDecor = {
  kind: 'none',
  color: '#0f6e56',
  lineStyle: 'dashed',
}

export type SequenceStyle = 'az' | 'stem' | 'number' | 'page' | 'chinese'

export interface StudentRow {
  rowIndex: number
  values: Record<string, string>
}

export interface ColumnMapping {
  header: string
  role: FieldRole
  label: string
  /** Whether this column is included on the plate */
  enabled: boolean
}

export interface ExtraStaticLabel {
  id: string
  text: string
}

export interface ExtraLabelOptions {
  /** Optional sequential labels (A–Z / 甲乙丙 / 123 / 01 02 03) */
  useSequence: boolean
  sequenceStyle: SequenceStyle
  /** Optional shared text for everyone (e.g. school name) */
  useStatic: boolean
  staticLabels: ExtraStaticLabel[]
  /** Optional shared image (logo / school emblem) */
  useImage: boolean
  imageSrc: string
}

export interface LayoutItem {
  id: string
  kind: 'field' | 'static' | 'image'
  /** Excel header key when kind === 'field' */
  fieldHeader?: string
  /** Fixed text when kind === 'static'; unused for images */
  text: string
  /** Data URL or path when kind === 'image' */
  imageSrc?: string
  /** Position as % of face width / face height (0–100) */
  x: number
  y: number
  fontSizeMm: number
  fontWeight: number
  align: 'left' | 'center' | 'right'
  color: string
  fontFamily?: string
  /** Shared id when items are grouped */
  groupId?: string | null
}

export interface LayoutSettings {
  mode: PlateMode
  /** Full card width in mm */
  widthMm: number
  /**
   * Visible face height in mm.
   * Desk (triangle): two large faces + two half-height flaps → total = faceHeightMm * 3
   * Double badge: left/right faces, height = faceHeightMm, width = widthMm * 2
   */
  faceHeightMm: number
  gapMm: number
  marginMm: number
  showCutMarks: boolean
  showFoldLine: boolean
  foldStyle: FoldLineStyle
  foldWeight: FoldLineWeight
  foldTone: FoldLineTone
  /** Card / page orientation for presets */
  orientation: PageOrientation
  /** Dashed photocopy paper guide behind the card */
  paperGuide: PaperSizeId | 'none'
  items: LayoutItem[]
  cardDecor: CardDecor
  /** One-shot: editor optically centers these items then clears the field */
  pendingCenterIds?: string[]
}

export const DEFAULT_DESK: LayoutSettings = {
  mode: 'desk',
  widthMm: 210,
  faceHeightMm: 99,
  gapMm: 4,
  marginMm: 8,
  showCutMarks: true,
  showFoldLine: true,
  foldStyle: 'dashed',
  foldWeight: 'regular',
  foldTone: 'medium',
  orientation: 'portrait',
  paperGuide: 'A4',
  items: [],
  cardDecor: DEFAULT_CARD_DECOR,
}

export const DEFAULT_BADGE: LayoutSettings = {
  mode: 'badge-single',
  widthMm: 90,
  faceHeightMm: 55,
  gapMm: 4,
  marginMm: 8,
  showCutMarks: true,
  showFoldLine: false,
  foldStyle: 'dashed',
  foldWeight: 'regular',
  foldTone: 'medium',
  orientation: 'portrait',
  paperGuide: 'A4',
  items: [],
  cardDecor: DEFAULT_CARD_DECOR,
}

export const FONT_WEIGHT_LABELS: Record<number, string> = {
  100: '極細',
  200: '特細',
  300: '細',
  400: '常',
  500: '中',
  600: '半粗',
  700: '粗',
  800: '特粗',
  900: '最粗',
}

export const FONT_CHOICES = [
  {
    id: 'Noto Sans TC',
    label: '黑體',
    stack: 'Noto Sans TC, sans-serif',
    weights: [100, 200, 300, 400, 500, 700, 900],
  },
  {
    id: 'Shippori Mincho',
    label: '明體',
    stack: 'Shippori Mincho, Noto Sans TC, serif',
    weights: [400, 500, 600, 700, 800],
  },
  {
    id: 'LXGW WenKai TC',
    label: '標楷體',
    stack: 'LXGW WenKai TC, DFKai-SB, 標楷體, KaiTi, serif',
    weights: [300, 400, 700],
  },
  {
    id: 'Bpmf Huninn',
    label: '注音體',
    stack: 'Bpmf Huninn, Noto Sans TC, sans-serif',
    weights: [400],
  },
] as const

export function fontChoice(id?: string) {
  return FONT_CHOICES.find((f) => f.id === id) ?? FONT_CHOICES[0]
}

export function clampFontWeight(family: string | undefined, weight: number) {
  const weights = [...fontChoice(family).weights]
  if (weights.includes(weight as (typeof weights)[number])) return weight
  return weights.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best))
}

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const

/** Excel-style letters: 0→A … 25→Z, 26→AA */
export function toAlphabetLabel(index: number): string {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

export function toStemLabel(index: number): string {
  if (index < STEMS.length) return STEMS[index]
  return String(index + 1)
}

export function toChineseNumeral(n: number): string {
  const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']
  if (n <= 0) return String(n)
  if (n < 10) return CN[n]
  if (n === 10) return '十'
  if (n < 20) return `十${CN[n - 10]}`
  if (n < 100) {
    const ones = n % 10
    return `${CN[Math.floor(n / 10)]}十${ones ? CN[ones] : ''}`
  }
  if (n < 1000) {
    const rest = n % 100
    const head = `${CN[Math.floor(n / 100)]}百`
    if (rest === 0) return head
    if (rest < 10) return `${head}零${CN[rest]}`
    return head + toChineseNumeral(rest)
  }
  return String(n)
}

export function toSequenceLabel(index: number, style: SequenceStyle): string {
  switch (style) {
    case 'az':
      return toAlphabetLabel(index)
    case 'stem':
      return toStemLabel(index)
    case 'number':
      return String(index + 1)
    case 'page':
      return `第${index + 1}頁`
    case 'chinese':
      return toChineseNumeral(index + 1)
    default: {
      const _never: never = style
      return _never
    }
  }
}

export function sequenceStyleLabel(style: SequenceStyle): string {
  switch (style) {
    case 'az':
      return '英文序號'
    case 'stem':
      return '甲乙丙序號'
    case 'number':
      return '數字序號'
    case 'page':
      return '頁碼序號'
    case 'chinese':
      return '中文數字序號'
    default: {
      const _never: never = style
      return _never
    }
  }
}
