import type { BadgeLook } from '../types'

interface Props {
  look: BadgeLook
  className?: string
}

/** Decoration drawn in a 0–100 box. The text band stays empty so type sits on the paper. */
export function BadgeLookMark({ look, className }: Props) {
  const { place, style, color } = look
  if (style === 'none') return <svg className={className} viewBox="0 0 100 100" aria-hidden />
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      {(place === 'top' || place === 'mid') && style === 'solid' ? (
        <>
          <rect x="0" y="0" width="100" height="20" fill={color} />
          <rect x="0" y="90" width="100" height="10" fill={color} />
        </>
      ) : null}
      {place === 'top' && style === 'stripe' ? (
        <>
          <rect x="0" y="0" width="100" height="8" fill={color} />
          <rect x="0" y="94" width="100" height="6" fill={color} />
        </>
      ) : null}
      {(place === 'top' || place === 'mid') && style === 'slant' ? (
        <>
          <polygon points="0,0 100,0 100,12 0,20" fill={color} />
          <polygon points="0,94 100,90 100,100 0,100" fill={color} />
        </>
      ) : null}
      {(place === 'top' || place === 'mid') && style === 'wave' ? (
        <>
          <path d="M0 0 H100 V12 C78 20 28 20 0 14 Z" fill={color} />
          <path d="M0 94 C18 90 34 98 52 94 C70 90 84 96 100 92 V100 H0 Z" fill={color} />
        </>
      ) : null}
      {place === 'bot' && style === 'solid' ? (
        <>
          <rect x="0" y="0" width="100" height="10" fill={color} />
          <rect x="0" y="80" width="100" height="20" fill={color} />
        </>
      ) : null}
      {place === 'bot' && style === 'stripe' ? (
        <>
          <rect x="0" y="0" width="100" height="6" fill={color} />
          <rect x="0" y="92" width="100" height="8" fill={color} />
        </>
      ) : null}
      {place === 'bot' && style === 'arc' ? (
        <>
          <path d="M0 0 H100 V6 C72 12 28 12 0 6 Z" fill={color} />
          <path d="M0 86 C28 78 72 78 100 86 V100 H0 Z" fill={color} />
        </>
      ) : null}
      {place === 'bot' && style === 'steps' ? (
        <>
          <path d="M0 0 H100 V6 H74 V10 H26 V6 H0 Z" fill={color} />
          <path d="M0 80 H26 V88 H74 V80 H100 V100 H0 Z" fill={color} />
        </>
      ) : null}
      {place === 'mid' && style === 'rules' ? (
        <>
          <line x1="8" y1="20" x2="92" y2="20" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
          <line x1="8" y1="80" x2="92" y2="80" stroke={color} strokeWidth="2.4" vectorEffect="non-scaling-stroke" />
        </>
      ) : null}
      {place === 'mid' && style === 'frame' ? (
        <path fill={color} fillRule="evenodd" d="M0 0 H100 V100 H0 Z M6 22 H94 V78 H6 Z" />
      ) : null}
    </svg>
  )
}
