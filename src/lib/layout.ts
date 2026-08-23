import { paperDimensions } from './paper'
import type { PrintImposition } from './printLayout'
import type { LayoutSettings, PaperSizeId } from '../types'

export interface PaperLayout {
  paperWidthMm: number
  paperHeightMm: number
  cols: number
  rows: number
  marginMm: number
}

export function resolvePrintPaper(
  settings: LayoutSettings,
  imposition?: PrintImposition,
): {
  size: PaperSizeId
  orientation: LayoutSettings['orientation']
  paperWidthMm: number
  paperHeightMm: number
} {
  const size = settings.paperGuide === 'none' ? 'A4' : settings.paperGuide
  const orientation =
    imposition === '2x1'
      ? settings.orientation === 'portrait'
        ? 'landscape'
        : 'portrait'
      : settings.orientation
  const { widthMm, heightMm } = paperDimensions(size, orientation)
  return {
    size,
    orientation,
    paperWidthMm: widthMm,
    paperHeightMm: heightMm,
  }
}

/** How many cards fit on the chosen print paper */
export function fitOnPaper(
  paperWidthMm: number,
  paperHeightMm: number,
  cardWidthMm: number,
  cardHeightMm: number,
  gapMm: number,
  marginMm: number,
): PaperLayout {
  const maxMarginW = Math.max(0, (paperWidthMm - cardWidthMm) / 2)
  const maxMarginH = Math.max(0, (paperHeightMm - cardHeightMm) / 2)
  const margin = Math.min(marginMm, maxMarginW, maxMarginH)
  const usableW = paperWidthMm - margin * 2
  const usableH = paperHeightMm - margin * 2
  const cols = Math.max(1, Math.floor((usableW + gapMm) / (cardWidthMm + gapMm)))
  const rows = Math.max(1, Math.floor((usableH + gapMm) / (cardHeightMm + gapMm)))
  return { paperWidthMm, paperHeightMm, cols, rows, marginMm: margin }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size))
  }
  return out
}
