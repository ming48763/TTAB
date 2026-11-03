import type { LayoutSettings, StudentRow } from '../types'

type FieldPlan = {
  itemId: string
  x: number
  y: number
  maxWidth: number
  faceX: number
  faceY: number
  faceW: number
  faceH: number
  font: string
  color: string
  align: CanvasTextAlign
  flip: boolean
}

type SlotPlan = {
  x: number
  y: number
  w: number
  h: number
  fields: FieldPlan[]
}

export type SheetPlan = {
  slots: SlotPlan[]
}

function fieldText(item: { fieldHeader?: string; text: string }, student: StudentRow) {
  if (!item.fieldHeader) return item.text || '—'
  return student.values[item.fieldHeader] || '—'
}

function fitted(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (!(maxWidth > 0) || ctx.measureText(text).width <= maxWidth) return text
  const mark = '…'
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + mark).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return lo <= 0 ? '' : text.slice(0, lo) + mark
}

export function measureSheet(page: HTMLElement, canvas: HTMLCanvasElement, settings: LayoutSettings): SheetPlan {
  const pageBox = page.getBoundingClientRect()
  const kx = pageBox.width > 0 ? canvas.width / pageBox.width : 1
  const ky = pageBox.height > 0 ? canvas.height / pageBox.height : 1
  const items = new Map(settings.items.map((item) => [item.id, item]))
  const slots = [...page.querySelectorAll<HTMLElement>(':scope > .print-slot')]
  return {
    slots: slots.map((slot) => {
      const box = slot.getBoundingClientRect()
      const fields: FieldPlan[] = []
      for (const face of slot.querySelectorAll<HTMLElement>('.plate-face')) {
        const faceBox = face.getBoundingClientRect()
        const faceX = (faceBox.left - pageBox.left) * kx
        const faceY = (faceBox.top - pageBox.top) * ky
        const faceW = faceBox.width * kx
        const faceH = faceBox.height * ky
        const flip = (face.style.transform || '').includes('180')
        const zoom = face.offsetWidth > 0 ? faceBox.width / face.offsetWidth : 1
        for (const el of face.querySelectorAll<HTMLElement>('.plate-item.is-field')) {
          const item = items.get(el.dataset.itemId || '')
          if (!item || faceW < 1 || faceH < 1) continue
          const style = getComputedStyle(el)
          const fontPx = (Number.parseFloat(style.fontSize) || 12) * zoom * kx
          if (!(fontPx > 0)) continue
          const lx = (item.x / 100) * faceW
          const ly = (item.y / 100) * faceH
          fields.push({
            itemId: item.id,
            x: flip ? faceX + faceW - lx : faceX + lx,
            y: flip ? faceY + faceH - ly : faceY + ly,
            maxWidth: faceW * 0.92,
            faceX,
            faceY,
            faceW,
            faceH,
            font: `${style.fontWeight} ${fontPx}px ${style.fontFamily || 'sans-serif'}`,
            color: item.color || '#10241f',
            align: item.align,
            flip,
          })
        }
      }
      return {
        x: (box.left - pageBox.left) * kx,
        y: (box.top - pageBox.top) * ky,
        w: box.width * kx,
        h: box.height * ky,
        fields,
      }
    }),
  }
}

export async function prepareStampFonts(plan: SheetPlan, pages: StudentRow[][], settings: LayoutSettings) {
  const fonts = document.fonts
  if (!fonts) return
  const chars = new Map<string, Set<string>>()
  const items = new Map(settings.items.map((item) => [item.id, item]))
  for (const page of pages) {
    page.forEach((student, index) => {
      if (!student) return
      for (const field of plan.slots[index]?.fields ?? []) {
        const item = items.get(field.itemId)
        if (!item) continue
        let bucket = chars.get(field.font)
        if (!bucket) {
          bucket = new Set<string>()
          chars.set(field.font, bucket)
        }
        for (const ch of fieldText(item, student)) bucket.add(ch)
      }
    })
  }
  await Promise.all([...chars].map(([font, bucket]) => fonts.load(font, [...bucket].join(''))))
}

export function stampPage(base: HTMLCanvasElement, plan: SheetPlan, students: StudentRow[], settings: LayoutSettings) {
  const canvas = document.createElement('canvas')
  canvas.width = base.width
  canvas.height = base.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.drawImage(base, 0, 0)
  const items = new Map(settings.items.map((item) => [item.id, item]))
  plan.slots.forEach((slot, index) => {
    const student = students[index]
    if (!student) {
      ctx.fillStyle = '#ffffff'
      const inset = 1
      ctx.fillRect(slot.x + inset, slot.y + inset, Math.max(0, slot.w - inset * 2), Math.max(0, slot.h - inset * 2))
      return
    }
    for (const field of slot.fields) {
      const item = items.get(field.itemId)
      if (!item) continue
      ctx.save()
      ctx.beginPath()
      ctx.rect(field.faceX, field.faceY, field.faceW, field.faceH)
      ctx.clip()
      ctx.font = field.font
      ctx.fillStyle = field.color
      ctx.textAlign = field.align
      ctx.textBaseline = 'middle'
      const shown = fitted(ctx, fieldText(item, student), field.maxWidth)
      if (field.flip) {
        ctx.translate(field.x, field.y)
        ctx.rotate(Math.PI)
        ctx.fillText(shown, 0, 0)
      } else {
        ctx.fillText(shown, field.x, field.y)
      }
      ctx.restore()
    }
  })
  return canvas
}
