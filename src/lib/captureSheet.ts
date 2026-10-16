const PAINT_PROPS = [
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
  'webkitTextStrokeColor',
] as const

const MODERN_COLOR = /color-mix\(|\bcolor\(|oklch\(|oklab\(|\blab\(|\blch\(/

function hasModernColor(raw: string) {
  MODERN_COLOR.lastIndex = 0
  return MODERN_COLOR.test(raw)
}

function sampleRgba(ctx: CanvasRenderingContext2D, raw: string) {
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = '#000'
  ctx.fillStyle = raw
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  if (a >= 255) return `rgb(${r}, ${g}, ${b})`
  return `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`
}

function replaceModernColor(ctx: CanvasRenderingContext2D, value: string) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const head = /^(?:color-mix|color|oklch|oklab|lab|lch)\(/.exec(value.slice(i))
    if (!head) {
      out += value[i]
      continue
    }
    let depth = 0
    let j = i
    for (; j < value.length; j++) {
      if (value[j] === '(') depth++
      else if (value[j] === ')') {
        depth--
        if (depth === 0) {
          j++
          break
        }
      }
    }
    out += sampleRgba(ctx, value.slice(i, j))
    i = j - 1
  }
  return out
}

/** html2canvas 1.4 cannot parse color() / color-mix() from computed styles. */
function bakePaint(root: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  const nodes = [root, ...root.querySelectorAll<HTMLElement>('*')]
  for (const el of nodes) {
    const cs = getComputedStyle(el)
    for (const prop of PAINT_PROPS) {
      const raw = cs[prop]
      if (!raw || !hasModernColor(raw)) continue
      el.style[prop] = sampleRgba(ctx, raw)
    }
    for (const prop of ['boxShadow', 'textShadow', 'backgroundImage'] as const) {
      const raw = cs[prop]
      if (!raw || raw === 'none' || !hasModernColor(raw)) continue
      el.style[prop] = replaceModernColor(ctx, raw)
    }
  }
}

function pickScale(root: HTMLElement) {
  const w = Math.max(root.offsetWidth, 1)
  const h = Math.max(root.offsetHeight, 1)
  let scale = 2
  const maxSide = 4096
  const maxArea = 12_000_000
  while (scale > 1 && (w * scale > maxSide || h * scale > maxSide || w * h * scale * scale > maxArea)) {
    scale /= 2
  }
  return scale
}

export async function captureSheet(root: HTMLElement) {
  const html2canvas = (await import('html2canvas')).default
  const draw = async (scale: number) => {
    bakePaint(root)
    return html2canvas(root, {
      scale,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })
  }
  const scale = pickScale(root)
  try {
    return await draw(scale)
  } catch {
    return await draw(Math.min(1, scale))
  }
}
