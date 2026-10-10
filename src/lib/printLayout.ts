import type { PaperSizeId } from '../types'

export type PrintImposition = '1x1' | '2x1' | '2x2'

export function impositionGrid(
  kind: PrintImposition,
  paperWidthMm?: number,
  paperHeightMm?: number,
): { cols: number; rows: number } {
  if (kind === '1x1') return { cols: 1, rows: 1 }
  if (kind === '2x2') return { cols: 2, rows: 2 }
  if (paperWidthMm != null && paperHeightMm != null && paperHeightMm >= paperWidthMm) {
    return { cols: 1, rows: 2 }
  }
  return { cols: 2, rows: 1 }
}

export function impositionHint(
  kind: PrintImposition,
  paperSize: PaperSizeId,
  printOrientation?: 'portrait' | 'landscape',
): string {
  if (kind === '1x1') return `整張${paperSize}`
  if (kind === '2x1') {
    const dir = printOrientation === 'portrait' ? '直向' : '橫向'
    if (paperSize === 'A3') return `${dir}兩張A4`
    if (paperSize === 'A4') return `${dir}兩張A5`
    return `${dir}兩張對開`
  }
  if (paperSize === 'A3') return '四張A5'
  if (paperSize === 'A4') return '四張A6'
  return '四張'
}

const SPLIT_HALF: Record<PaperSizeId, string> = {
  A3: 'A4',
  A4: 'A5',
  B5: 'B6',
}

const SPLIT_QUARTER: Record<PaperSizeId, string> = {
  A3: 'A5',
  A4: 'A6',
  B5: 'B7',
}

export function impositionSplitLabel(kind: PrintImposition, paperSize: PaperSizeId): string {
  if (kind === '1x1') return paperSize
  if (kind === '2x1') return `${paperSize} 分割 2張 ${SPLIT_HALF[paperSize]}`
  return `${paperSize} 分割 4張 ${SPLIT_QUARTER[paperSize]}`
}
