import type {
  ColumnMapping,
  ExtraLabelOptions,
  LayoutItem,
  LayoutSettings,
  StudentRow,
} from '../types'
import {
  DEFAULT_DESK,
  SEQUENCE_HEADER,
  sequenceStyleLabel,
  toSequenceLabel,
  uid,
} from '../types'

export function applySequenceToRows(
  rows: StudentRow[],
  extras: ExtraLabelOptions,
): StudentRow[] {
  if (!extras.useSequence) {
    return rows.map((row) => {
      if (!(SEQUENCE_HEADER in row.values)) return row
      const rest = { ...row.values }
      delete rest[SEQUENCE_HEADER]
      return { ...row, values: rest }
    })
  }
  return rows.map((row, i) => ({
    ...row,
    values: {
      ...row.values,
      [SEQUENCE_HEADER]: toSequenceLabel(i, extras.sequenceStyle),
    },
  }))
}

export function buildMappingsWithExtras(
  mappings: ColumnMapping[],
  extras: ExtraLabelOptions,
): ColumnMapping[] {
  const cleaned = mappings
    .filter((m) => m.header !== SEQUENCE_HEADER)
    .filter((m) => m.enabled && m.role !== 'ignore')
  if (!extras.useSequence) return cleaned
  return [
    ...cleaned,
    {
      header: SEQUENCE_HEADER,
      role: 'custom',
      label: sequenceStyleLabel(extras.sequenceStyle),
      enabled: true,
    },
  ]
}

const MAIN = {
  fontSizeMm: 30,
  fontWeight: 400,
  fontFamily: 'Noto Sans TC',
  color: '#0f241f',
  align: 'center' as const,
}

const PAIR_GAP_EM = 0.4

function baseItem(partial: Omit<LayoutItem, 'fontSizeMm' | 'fontWeight' | 'fontFamily' | 'color' | 'align'> & Partial<LayoutItem>): LayoutItem {
  return {
    fontSizeMm: MAIN.fontSizeMm,
    fontWeight: MAIN.fontWeight,
    fontFamily: MAIN.fontFamily,
    color: MAIN.color,
    align: MAIN.align,
    ...partial,
  }
}

function stackY(index: number, total: number): number {
  if (total <= 1) return 78
  const top = 72
  const bottom = 88
  return top + ((bottom - top) * index) / (total - 1)
}

function textWidthPct(text: string, fontMm: number, cardWidthMm: number) {
  let em = 0
  for (const ch of [...text]) {
    if (ch === ' ') em += 0.3
    else if (/[0-9]/.test(ch)) em += 0.62
    else if (/[A-Za-z]/.test(ch)) em += 0.62
    else em += 1
  }
  return (Math.max(em, 0.5) * fontMm / cardWidthMm) * 100
}

function fieldSample(row: StudentRow | undefined, header: string, fallback: string) {
  const v = row?.values[header]?.trim()
  return v || fallback
}

export function buildLayoutFromConfirm(
  mappings: ColumnMapping[],
  extras: ExtraLabelOptions,
  sample?: StudentRow,
): LayoutSettings {
  const cardWidthMm = DEFAULT_DESK.widthMm
  const active = mappings.filter((m) => m.enabled && m.role !== 'ignore')
  const nameMap = active.find((m) => m.role === 'name')
  const seatMap = active.find((m) => m.role === 'seat')
  const numberFromSequence = extras.useSequence
  const numberMap = numberFromSequence ? null : seatMap

  const items: LayoutItem[] = []
  let numberId: string | null = null
  let nameId: string | null = null
  let numberText = '1'
  let nameText = '某某某'

  if (numberFromSequence) {
    numberId = uid('field-seq')
    numberText = toSequenceLabel(0, extras.sequenceStyle)
    items.push(
      baseItem({
        id: numberId,
        kind: 'field',
        fieldHeader: SEQUENCE_HEADER,
        text: sequenceStyleLabel(extras.sequenceStyle),
        x: 50,
        y: 50,
      }),
    )
  } else if (numberMap) {
    numberId = uid(`field-${numberMap.role}`)
    numberText = fieldSample(sample, numberMap.header, '1')
    items.push(
      baseItem({
        id: numberId,
        kind: 'field',
        fieldHeader: numberMap.header,
        text: numberMap.header,
        x: 50,
        y: 50,
      }),
    )
  }

  if (nameMap) {
    nameId = uid('field-name')
    nameText = fieldSample(sample, nameMap.header, '某某某')
    items.push(
      baseItem({
        id: nameId,
        kind: 'field',
        fieldHeader: nameMap.header,
        text: nameMap.header,
        x: 50,
        y: 50,
      }),
    )
  }

  if (numberId && nameId) {
    const num = items.find((it) => it.id === numberId)!
    const name = items.find((it) => it.id === nameId)!
    const numW = textWidthPct(numberText, MAIN.fontSizeMm, cardWidthMm)
    const nameW = textWidthPct(nameText, MAIN.fontSizeMm, cardWidthMm)
    const gap = (PAIR_GAP_EM * MAIN.fontSizeMm / cardWidthMm) * 100
    const total = numW + gap + nameW
    num.x = Math.round((50 - total / 2 + numW / 2) * 10) / 10
    name.x = Math.round((50 + total / 2 - nameW / 2) * 10) / 10
    num.y = 50
    name.y = 50
  }

  if (extras.useImage && extras.imageSrc) {
    items.push(
      baseItem({
        id: uid('image'),
        kind: 'image',
        text: '圖片',
        imageSrc: extras.imageSrc,
        x: 50,
        y: 12,
        fontSizeMm: 12,
      }),
    )
  }

  const extrasRest: LayoutItem[] = []
  const statics = extras.useStatic ? extras.staticLabels.filter((s) => s.text.trim()) : []
  for (const s of statics) {
    extrasRest.push(
      baseItem({
        id: uid('static'),
        kind: 'static',
        text: s.text.trim(),
        x: 50,
        y: 0,
        fontSizeMm: 8,
      }),
    )
  }

  const usedHeaders = new Set(items.map((it) => it.fieldHeader).filter(Boolean))
  const restMaps = active.filter((m) => {
    if (usedHeaders.has(m.header)) return false
    if (m.role === 'name') return false
    if (!numberFromSequence && m.role === 'seat') return false
    return true
  })
  for (const m of restMaps) {
    extrasRest.push(
      baseItem({
        id: uid(`field-${m.role}`),
        kind: 'field',
        fieldHeader: m.header,
        text: m.header,
        x: 50,
        y: 0,
        fontSizeMm: 8,
      }),
    )
  }

  extrasRest.forEach((item, i) => {
    items.push({
      ...item,
      y: Math.round(stackY(i, extrasRest.length) * 10) / 10,
    })
  })

  return {
    ...DEFAULT_DESK,
    items,
    pendingCenterIds: numberId && nameId ? [numberId, nameId] : undefined,
  }
}
