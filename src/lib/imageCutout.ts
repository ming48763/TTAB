function dist(r: number, g: number, b: number, bg: [number, number, number]) {
  const dr = r - bg[0]
  const dg = g - bg[1]
  const db = b - bg[2]
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function edgeColor(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const bins = new Map<string, { n: number; r: number; g: number; b: number }>()
  const stepX = Math.max(1, Math.floor(width / 32))
  const stepY = Math.max(1, Math.floor(height / 32))
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 4
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0
    const key = `${r >> 4},${g >> 4},${b >> 4}`
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n += 1
    bin.r += r
    bin.g += g
    bin.b += b
    bins.set(key, bin)
  }
  for (let x = 0; x < width; x += stepX) {
    take(x, 0)
    take(x, height - 1)
  }
  for (let y = 0; y < height; y += stepY) {
    take(0, y)
    take(width - 1, y)
  }
  let best: { n: number; r: number; g: number; b: number } | null = null
  for (const bin of bins.values()) {
    if (!best || bin.n > best.n) best = bin
  }
  if (!best || best.n === 0) return [255, 255, 255]
  return [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)]
}

export function removeImageBackground(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const maxSide = 1200
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
      const width = Math.max(1, Math.round(img.naturalWidth * scale))
      const height = Math.max(1, Math.round(img.naturalHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        reject(new Error('canvas'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      const image = ctx.getImageData(0, 0, width, height)
      const data = image.data
      const bg = edgeColor(data, width, height)
      const threshold = 42
      const seen = new Uint8Array(width * height)
      const stack: number[] = []
      const consider = (x: number, y: number) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return
        const p = y * width + x
        if (seen[p]) return
        const i = p * 4
        if ((data[i + 3] ?? 255) < 16 || dist(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, bg) <= threshold) {
          seen[p] = 1
          stack.push(p)
        }
      }
      for (let x = 0; x < width; x += 1) {
        consider(x, 0)
        consider(x, height - 1)
      }
      for (let y = 0; y < height; y += 1) {
        consider(0, y)
        consider(width - 1, y)
      }
      while (stack.length) {
        const p = stack.pop() as number
        const x = p % width
        const y = (p - x) / width
        const i = p * 4
        const d = dist(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0, bg)
        const alpha = data[i + 3] ?? 255
        data[i + 3] = d <= 12 ? 0 : Math.round(alpha * (d / threshold))
        consider(x + 1, y)
        consider(x - 1, y)
        consider(x, y + 1)
        consider(x, y - 1)
      }
      ctx.putImageData(image, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('image'))
    img.src = src
  })
}
