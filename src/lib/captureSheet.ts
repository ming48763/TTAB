const MODERN_COLOR = /color-mix\(|\bcolor\(|oklch\(|oklab\(|\blab\(|\blch\(/

function hasModernColor(raw: string) {
  MODERN_COLOR.lastIndex = 0
  return MODERN_COLOR.test(raw)
}

function channelByte(raw: string) {
  if (raw.endsWith('%')) return Math.round((Number.parseFloat(raw) / 100) * 255)
  const n = Number.parseFloat(raw)
  return Math.round(n <= 1 ? n * 255 : n)
}

function parseSrgb(raw: string) {
  const match = /^color\(\s*srgb\s+([0-9.]+%?)\s+([0-9.]+%?)\s+([0-9.]+%?)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i.exec(raw.trim())
  if (!match) return ''
  const r = channelByte(match[1])
  const g = channelByte(match[2])
  const b = channelByte(match[3])
  if (!match[4]) return `rgb(${r}, ${g}, ${b})`
  const alpha = match[4].endsWith('%') ? Number.parseFloat(match[4]) / 100 : Number.parseFloat(match[4])
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 1000) / 1000})`
}

function sampleRgba(ctx: CanvasRenderingContext2D, raw: string) {
  const parsed = parseSrgb(raw)
  if (parsed) return parsed
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

function bakedValue(ctx: CanvasRenderingContext2D, raw: string) {
  if (!raw || !hasModernColor(raw)) return ''
  return replaceModernColor(ctx, raw)
}

function bakeDeclaration(ctx: CanvasRenderingContext2D, style: CSSStyleDeclaration, set: (name: string, value: string) => void) {
  for (let i = 0; i < style.length; i += 1) {
    const name = style.item(i)
    const next = bakedValue(ctx, style.getPropertyValue(name))
    if (next) set(name, next)
  }
}

/** html2canvas 1.4 cannot parse color() / color-mix() from computed styles. */
function bakePaint(root: HTMLElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const marked: HTMLElement[] = []
  const rules: string[] = []
  if (!ctx) return () => undefined
  const nodes = [root, ...root.querySelectorAll<HTMLElement>('*')]
  let serial = 0
  for (const el of nodes) {
    bakeDeclaration(ctx, getComputedStyle(el), (name, value) => {
      el.style.setProperty(name, value)
    })
    for (const pseudo of [':before', ':after'] as const) {
      const style = getComputedStyle(el, pseudo)
      if (!style.content || style.content === 'none' || style.content === 'normal') continue
      const decls: string[] = []
      bakeDeclaration(ctx, style, (name, value) => {
        decls.push(`${name}: ${value} !important`)
      })
      if (!decls.length) continue
      const attr = pseudo === ':before' ? 'data-pdf-bake-before' : 'data-pdf-bake-after'
      const id = String(serial)
      serial += 1
      el.setAttribute(attr, id)
      marked.push(el)
      const selector = pseudo === ':before' ? '::before' : '::after'
      rules.push(`[${attr}="${id}"]${selector}{${decls.join(';')}}`)
    }
  }
  const sheet = rules.length ? document.createElement('style') : null
  if (sheet) {
    sheet.textContent = rules.join('\n')
    document.head.appendChild(sheet)
  }
  return () => {
    sheet?.remove()
    for (const el of marked) {
      el.removeAttribute('data-pdf-bake-before')
      el.removeAttribute('data-pdf-bake-after')
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

export async function captureSheet(root: HTMLElement, scaleOverride?: number) {
  const html2canvas = (await import('html2canvas')).default
  const draw = async (scale: number) => {
    const undoPaint = bakePaint(root)
    try {
      return await html2canvas(root, {
        scale,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
    } finally {
      undoPaint()
    }
  }
  const scale = scaleOverride && scaleOverride > 0 ? scaleOverride : pickScale(root)
  try {
    return await draw(scale)
  } catch {
    return await draw(Math.min(1, scale))
  }
}
