import type { BadgeLook, BadgeTextPlace } from '../types'

export interface BadgeStyleChoice {
  id: string
  label: string
}

/** Styles differ by where the text sits, because the decoration occupies the leftover band. */
export const BADGE_STYLE_CHOICES: Record<BadgeTextPlace, BadgeStyleChoice[]> = {
  top: [
    { id: 'solid', label: '色塊' },
    { id: 'stripe', label: '色條' },
    { id: 'slant', label: '斜角' },
    { id: 'wave', label: '波浪' },
    { id: 'none', label: '無' },
  ],
  mid: [
    { id: 'caps', label: '上下色塊' },
    { id: 'bars', label: '上下色條' },
    { id: 'rules', label: '雙線' },
    { id: 'frame', label: '文字框' },
    { id: 'none', label: '無' },
  ],
  bot: [
    { id: 'solid', label: '色塊' },
    { id: 'stripe', label: '色條' },
    { id: 'arc', label: '弧形' },
    { id: 'steps', label: '階梯' },
    { id: 'none', label: '無' },
  ],
}

/** One fixed set. Marks stay on the card while the text slider moves. */
export const BADGE_FIXED_STYLES: BadgeStyleChoice[] = [
  { id: 'none', label: '無' },
  { id: 'rules', label: '雙線' },
  { id: 'frame', label: '文字框' },
  { id: 'solid', label: '矩形' },
  { id: 'wave', label: '波浪' },
  { id: 'slant', label: '斜角' },
]

export function fixedBadgeLook(look: BadgeLook): BadgeLook {
  const style = BADGE_FIXED_STYLES.some((choice) => choice.id === look.style) ? look.style : 'none'
  return { ...look, place: 'mid', style }
}
