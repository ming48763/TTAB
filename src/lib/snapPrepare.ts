/** Crop a photographed sheet down to its ruled table and straighten it. */

function loadImage(source: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image'))
    }
    img.src = url
  })
}

function canvasOf(img: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('canvas')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas
}

function crop(source: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, box.w)
  canvas.height = Math.max(1, box.h)
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height)
  return canvas
}

function closeMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(height - 1, y + radius)
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)
      for (let ny = y0; ny <= y1; ny += 1) {
        const row = ny * width
        for (let nx = x0; nx <= x1; nx += 1) out[row + nx] = 1
      }
    }
  }
  return out
}

function largestMask(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length)
  const stack: number[] = []
  let bestArea = 0
  let bestId = 0
  const owner = new Int32Array(mask.length)
  let nextId = 0
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue
    nextId += 1
    let area = 0
    stack.push(start)
    seen[start] = 1
    while (stack.length) {
      const p = stack.pop() as number
      owner[p] = nextId
      area += 1
      const x = p % width
      const y = (p - x) / width
      const tryPush = (nx: number, ny: number) => {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) return
        const np = ny * width + nx
        if (seen[np] || !mask[np]) return
        seen[np] = 1
        stack.push(np)
      }
      tryPush(x - 1, y)
      tryPush(x + 1, y)
      tryPush(x, y - 1)
      tryPush(x, y + 1)
    }
    if (area > bestArea) {
      bestArea = area
      bestId = nextId
    }
  }
  if (bestArea < width * height * 0.12) return null
  const kept = new Uint8Array(mask.length)
  for (let p = 0; p < mask.length; p += 1) if (owner[p] === bestId) kept[p] = 1
  return kept
}

function isolatePaper(canvas: HTMLCanvasElement) {
  const width = canvas.width
  const height = canvas.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const page = width * height
  const raw = new Uint8Array(page)
  for (let p = 0; p < page; p += 1) {
    const i = p * 4
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    if (luma > 168 && Math.max(r, g, b) - Math.min(r, g, b) < 64) raw[p] = 1
  }
  const paper = largestMask(closeMask(raw, width, height, 5), width, height)
  if (!paper) return canvas
  for (let p = 0; p < page; p += 1) {
    if (paper[p]) continue
    const i = p * 4
    data[i] = 255
    data[i + 1] = 255
    data[i + 2] = 255
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function skewAngle(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return 0
  const width = canvas.width
  const height = canvas.height
  const data = ctx.getImageData(0, 0, width, height).data
  const points: [number, number][] = []
  const y0 = Math.floor(height * 0.18)
  const y1 = Math.floor(height * 0.92)
  const step = 2
  const onPaper = (x: number, y: number) => {
    let bright = 0
    for (const dy of [-8, 0, 8]) {
      for (const dx of [-8, 0, 8]) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const i = (ny * width + nx) * 4
        if (Math.min(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0) > 165) bright += 1
      }
    }
    return bright >= 5
  }
  for (let y = y0; y < y1; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4
      const v = Math.min(data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255)
      if (v >= 110 || !onPaper(x, y)) continue
      points.push([x - width / 2, y - height / 2])
    }
  }
  if (points.length < 40) return 0
  let best = 0
  let bestScore = -1
  for (let deg = -20; deg <= 20; deg += 0.5) {
    const rad = (deg * Math.PI) / 180
    const s = Math.sin(rad)
    const c = Math.cos(rad)
    const hist = new Map<number, number>()
    for (const [x, y] of points) {
      const bin = Math.round((-x * s + y * c) / 2)
      hist.set(bin, (hist.get(bin) ?? 0) + 1)
    }
    let score = 0
    for (const count of hist.values()) score += count * count
    if (score > bestScore) {
      bestScore = score
      best = deg
    }
  }
  return best
}

function rotate(source: HTMLCanvasElement, deg: number) {
  if (Math.abs(deg) < 0.4) return source
  const rad = (deg * Math.PI) / 180
  const sin = Math.abs(Math.sin(rad))
  const cos = Math.abs(Math.cos(rad))
  const width = source.width
  const height = source.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(width * cos + height * sin)
  canvas.height = Math.ceil(width * sin + height * cos)
  const ctx = canvas.getContext('2d')
  if (!ctx) return source
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(source, -width / 2, -height / 2)
  return canvas
}

function cropInk(source: HTMLCanvasElement) {
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  const width = source.width
  const height = source.height
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4
      const v = Math.min(data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255)
      if (v > 185) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX <= minX || maxY <= minY) return source
  const pad = 14
  const x = Math.max(0, minX - pad)
  const y = Math.max(0, minY - pad)
  const right = Math.min(width, maxX + pad)
  const bottom = Math.min(height, maxY + pad)
  return crop(source, { x, y, w: right - x, h: bottom - y })
}

function scaleCanvas(source: HTMLCanvasElement) {
  const target = 1600
  if (source.width >= target - 40 && source.width <= 2200) return source
  const scale = source.width < target ? Math.min(3, target / source.width) : 2000 / source.width
  return canvasOf(source, source.width * scale, source.height * scale)
}

function enhance(source: HTMLCanvasElement) {
  const ctx = source.getContext('2d', { willReadFrequently: true })
  if (!ctx) return source
  const width = source.width
  const height = source.height
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const sample: number[] = []
  for (let i = 0; i < data.length; i += 19 * 4) {
    sample.push(Math.min(data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255))
  }
  sample.sort((a, b) => a - b)
  const lo = Math.min(42, sample[Math.floor(sample.length * 0.04)] ?? 0)
  const hi = Math.max(220, sample[Math.floor(sample.length * 0.98)] ?? 255)
  const span = Math.max(1, hi - lo)
  for (let p = 0; p < width * height; p += 1) {
    const i = p * 4
    const gray = Math.min(data[i] ?? 255, data[i + 1] ?? 255, data[i + 2] ?? 255)
    const v = Math.max(0, Math.min(255, Math.round(((gray - lo) / span) * 255)))
    data[i] = v
    data[i + 1] = v
    data[i + 2] = v
    data[i + 3] = 255
  }
  ctx.putImageData(image, 0, 0)
  return source
}

function toBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('blob'))
    }, 'image/png')
  })
}

export async function prepareSnapImage(source: Blob): Promise<Blob> {
  const img = await loadImage(source)
  const long = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height)
  const limit = long > 1800 ? 1800 / long : 1
  const base = canvasOf(img, (img.naturalWidth || img.width) * limit, (img.naturalHeight || img.height) * limit)
  isolatePaper(base)
  const straight = rotate(base, -skewAngle(base))
  const ink = cropInk(straight)
  const enhanced = enhance(scaleCanvas(ink))
  const blob = await toBlob(enhanced)
  return blob
}

export async function clipSnapImage(source: Blob, start: number, end: number): Promise<Blob> {
  const img = await loadImage(source)
  const width = img.naturalWidth || img.width
  const height = img.naturalHeight || img.height
  const canvas = canvasOf(img, width, height)
  const x = Math.max(0, Math.round(width * start))
  const right = Math.min(width, Math.round(width * end))
  return toBlob(crop(canvas, { x, y: 0, w: Math.max(1, right - x), h: height }))
}
