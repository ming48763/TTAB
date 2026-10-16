import { useEffect, useLayoutEffect, useRef } from 'react'
import type {
  ColumnMapping,
  ExtraLabelOptions,
  ExtraStaticLabel,
  SequenceStyle,
  StudentRow,
} from '../types'
import { uid } from '../types'

interface Props {
  mappings: ColumnMapping[]
  rows: StudentRow[]
  extras: ExtraLabelOptions
  onChangeMappings: (mappings: ColumnMapping[]) => void
  onChangeExtras: (extras: ExtraLabelOptions) => void
  onBack: () => void
  onConfirm: () => void
  showExtras?: boolean
  confirmLabel?: string
  showExtrasNote?: boolean
}

function FitPreviewTag({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const max = 15.68
    const fits = () => el.scrollWidth <= el.clientWidth + 0.5
    el.style.fontSize = `${max}px`
    if (fits()) return
    let lo = 6
    let hi = max
    for (let i = 0; i < 12; i += 1) {
      const mid = (lo + hi) / 2
      el.style.fontSize = `${mid}px`
      if (fits()) lo = mid
      else hi = mid
    }
    el.style.fontSize = `${lo}px`
  }, [text])
  return <span ref={ref}>{text || '—'}</span>
}

function PreviewCells({ values }: { values: string[] }) {
  return (
    <div className="preview-cells is-scroll">
      {values.map((value, index) => (
        <FitPreviewTag key={index} text={value} />
      ))}
    </div>
  )
}

const SEQUENCE_OPTIONS: { id: SequenceStyle; label: string; hint: string }[] = [
  { id: 'az', label: '英文序號', hint: 'A、B、C…' },
  { id: 'stem', label: '甲乙丙序號', hint: '甲、乙、丙…' },
  { id: 'number', label: '數字序號', hint: '1、2、3…' },
  { id: 'page', label: '頁碼序號', hint: '第1頁、第2頁…' },
  { id: 'chinese', label: '中文數字序號', hint: '一、二、三…' },
]

export function ConfirmFields({
  mappings,
  rows,
  extras,
  onChangeMappings,
  onChangeExtras,
  onBack,
  onConfirm,
  showExtras = true,
  confirmLabel = '確認，開始編輯',
  showExtrasNote = true,
}: Props) {
  function update(index: number, patch: Partial<ColumnMapping>) {
    onChangeMappings(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  const STATIC_LABEL_MAX = 3

  function updateStatic(id: string, text: string) {
    onChangeExtras({
      ...extras,
      staticLabels: extras.staticLabels.map((s) => (s.id === id ? { ...s, text } : s)),
    })
  }

  function enableStatic(checked: boolean) {
    if (checked && extras.staticLabels.length === 0) {
      onChangeExtras({
        ...extras,
        useStatic: true,
        staticLabels: [{ id: uid('static'), text: '' }],
      })
      return
    }
    onChangeExtras({ ...extras, useStatic: checked })
  }

  function addStatic() {
    if (extras.staticLabels.length >= STATIC_LABEL_MAX) return
    const next: ExtraStaticLabel = { id: uid('extra'), text: '' }
    onChangeExtras({
      ...extras,
      useStatic: true,
      staticLabels: [...extras.staticLabels, next],
    })
  }

  function removeStatic(id: string) {
    const next = extras.staticLabels.filter((s) => s.id !== id)
    onChangeExtras({
      ...extras,
      staticLabels: next,
      useStatic: next.length > 0 ? extras.useStatic : false,
    })
  }

  function onPickImage(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      onChangeExtras({
        ...extras,
        useImage: true,
        imageSrc: typeof reader.result === 'string' ? reader.result : '',
      })
    }
    reader.readAsDataURL(file)
  }

  const preview = rows
  const activeCount = mappings.filter((m) => m.enabled).length
  const hasStatic =
    extras.useStatic && extras.staticLabels.some((s) => s.text.trim().length > 0)
  const hasImage = extras.useImage && extras.imageSrc.length > 0
  const canConfirm = showExtras
    ? activeCount > 0 || extras.useSequence || hasStatic || hasImage
    : activeCount > 0
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const previewBarRef = useRef<HTMLDivElement>(null)
  const extraGridRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const grid = extraGridRef.current
    if (!grid) return
    const phone = window.matchMedia(
      '(max-width: 640px), ((orientation: landscape) and (max-height: 500px) and (max-width: 899px))',
    )
    const cards = () => [...grid.querySelectorAll<HTMLElement>(':scope > .extra-card')]
    const contentBox = (el: HTMLElement): number => {
      const style = getComputedStyle(el)
      const gap = Number.parseFloat(style.rowGap || '0') || 0
      const pad = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
      const kids = [...el.children] as HTMLElement[]
      let sum = pad
      kids.forEach((kid, index) => {
        const grow = Number.parseFloat(getComputedStyle(kid).flexGrow) || 0
        sum += grow > 0 ? contentBox(kid) : kid.offsetHeight
        if (index > 0) sum += gap
      })
      return sum
    }
    let width = -1
    const sync = () => {
      const list = cards()
      const clear = (card: HTMLElement) => {
        card.style.height = ''
        card.style.minHeight = ''
        card.style.maxHeight = ''
      }
      if (!phone.matches) {
        width = -1
        for (const card of list) clear(card)
        return
      }
      const nextWidth = grid.clientWidth
      if (nextWidth < 1 || nextWidth === width) return
      width = nextWidth
      const sequence = list.find((card) => card.querySelector('.seq-option'))
      const head = sequence?.querySelector<HTMLElement>('.extra-card-head')
      const body = sequence?.querySelector<HTMLElement>('.extra-card-body')
      if (!sequence || !head || !body) return
      const height = `${Math.ceil(head.offsetHeight + contentBox(body) + (sequence.offsetHeight - sequence.clientHeight))}px`
      for (const card of list) {
        if (card.style.height === height && card.style.maxHeight === height) continue
        card.style.height = height
        card.style.minHeight = height
        card.style.maxHeight = height
      }
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(grid)
    phone.addEventListener('change', sync)
    return () => {
      observer.disconnect()
      phone.removeEventListener('change', sync)
      for (const card of cards()) {
        card.style.height = ''
        card.style.minHeight = ''
        card.style.maxHeight = ''
      }
    }
  }, [showExtras])

  useEffect(() => {
    const root = previewWrapRef.current
    const bar = previewBarRef.current
    if (!root || !bar) return
    const spacer = bar.firstElementChild as HTMLElement | null
    let lock = false
    const strips = () => [...root.querySelectorAll<HTMLDivElement>('.preview-cells.is-scroll')]
    const apply = (left: number) => {
      if (lock) return
      lock = true
      for (const node of strips()) node.scrollLeft = left
      bar.scrollLeft = left
      lock = false
    }
    const range = root.querySelector<HTMLInputElement>('.preview-range')
    const usingRange = () => Boolean(range && !range.hidden && getComputedStyle(range).display !== 'none')
    const maxScroll = () => Math.max(0, ...strips().map((node) => node.scrollWidth - node.clientWidth))
    const fit = () => {
      if (!spacer) return
      const nodes = strips()
      const max = Math.max(0, ...nodes.map((node) => node.scrollWidth))
      spacer.style.width = `${max}px`
      const view = nodes[0]?.clientWidth || bar.clientWidth
      const overflow = max > view + 1
      bar.hidden = !overflow
      if (range) {
        range.hidden = !overflow
        const limit = maxScroll()
        const left = nodes[0]?.scrollLeft ?? 0
        range.value = limit > 0 ? String(Math.round((left / limit) * 1000)) : '0'
      }
      if (!overflow) apply(0)
    }
    const onBarScroll = () => {
      if (usingRange()) return
      apply(bar.scrollLeft)
    }
    const onRange = () => {
      if (!range) return
      apply((Number(range.value) / 1000) * maxScroll())
    }
    const onWheel = (event: WheelEvent) => {
      if (bar.hidden && !usingRange()) return
      const phone = window.matchMedia(
        '(max-width: 640px), ((orientation: landscape) and (max-height: 500px) and (max-width: 899px))',
      ).matches
      if (phone && Math.abs(event.deltaY) >= Math.abs(event.deltaX)) return
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (delta === 0) return
      if (usingRange()) {
        const node = strips()[0]
        const limit = maxScroll()
        if (!node || limit <= 0) return
        const next = Math.min(limit, Math.max(0, node.scrollLeft + delta))
        apply(next)
        if (range) range.value = String(Math.round((next / limit) * 1000))
      } else {
        bar.scrollLeft += delta
      }
      event.preventDefault()
    }
    fit()
    bar.addEventListener('scroll', onBarScroll)
    range?.addEventListener('input', onRange)
    root.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      bar.removeEventListener('scroll', onBarScroll)
      range?.removeEventListener('input', onRange)
      root.removeEventListener('wheel', onWheel)
    }
  }, [rows, mappings])

  return (
    <div className="step-page">
      <div className="panel confirm-panel">
        <div className={`panel-head${showExtras ? ' is-extras' : ''}`}>
          <h2>{showExtras ? '確認欄位與標籤' : '確認欄位'}</h2>
        </div>

        <section className="confirm-section">
          <div className="section-head">
            <h3>匯入欄位</h3>
          </div>
          <div className="table-wrap" ref={previewWrapRef}>
            <table className="map-table is-preview-scroll">
              <thead>
                <tr>
                  <th className="col-check">使用</th>
                  <th>欄位</th>
                  <th>預覽</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((m, i) => (
                  <tr key={m.header} className={!m.enabled ? 'is-ignored' : ''}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        checked={m.enabled}
                        aria-label={`使用欄位 ${m.header}`}
                        onChange={(e) => update(i, { enabled: e.target.checked })}
                      />
                    </td>
                    <td>
                      <code>{m.header}</code>
                    </td>
                    <td>
                      <PreviewCells values={preview.map((row) => row.values[m.header] || '')} />
                    </td>
                  </tr>
                ))}
                <tr className="preview-caption-row">
                  <td>標籤預覽</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td className="col-check" />
                  <td />
                  <td>
                    <div className="preview-sync" ref={previewBarRef}>
                      <div />
                    </div>
                    <input className="preview-range" type="range" min={0} max={1000} defaultValue={0} hidden aria-label="左右移動預覽" />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {showExtras && (
        <section className="confirm-section">
          <div className="section-head">
            <h3>額外標籤（選配）</h3>
            {showExtrasNote ? <p className="muted">三類皆可獨立勾選，不是必填。</p> : null}
          </div>

          <div className="extra-grid" ref={extraGridRef}>
            <article className="extra-card">
              <label className="extra-card-head">
                <input
                  type="checkbox"
                  checked={extras.useSequence}
                  onChange={(e) => onChangeExtras({ ...extras, useSequence: e.target.checked })}
                />
                <span>
                  <strong>順序標籤</strong>
                  <em>依名冊列順序自動編號</em>
                </span>
              </label>
              <div className={`extra-card-body ${extras.useSequence ? '' : 'is-disabled'}`}>
                {SEQUENCE_OPTIONS.map((opt) => (
                  <label key={opt.id} className="seq-option">
                    <input
                      type="radio"
                      name="sequence-style"
                      value={opt.id}
                      disabled={!extras.useSequence}
                      checked={extras.sequenceStyle === opt.id}
                      onChange={() => onChangeExtras({ ...extras, sequenceStyle: opt.id })}
                    />
                    <span>
                      <strong>{opt.label}</strong>
                      <em>{opt.hint}</em>
                    </span>
                  </label>
                ))}
              </div>
            </article>

            <article className="extra-card">
              <label className="extra-card-head">
                <input
                  type="checkbox"
                  checked={extras.useStatic}
                  onChange={(e) => enableStatic(e.target.checked)}
                />
                <span>
                  <strong>全員標籤</strong>
                  <em>每位學生相同的文字</em>
                </span>
              </label>
              <div className={`extra-card-body ${extras.useStatic ? '' : 'is-disabled'}`}>
                <div className="extra-card-main">
                  {extras.useStatic ? (
                    extras.staticLabels.map((s, i) => (
                      <div key={s.id} className="static-row">
                        <input
                          type="text"
                          placeholder={i === 0 ? '例如：○○國小' : '例如：三年二班'}
                          value={s.text}
                          onChange={(e) => updateStatic(s.id, e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn text"
                          onClick={() => removeStatic(s.id)}
                          disabled={extras.staticLabels.length <= 1}
                        >
                          移除
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="extra-placeholder">勾選後可輸入校名、班級等</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn ghost extra-card-foot"
                  onClick={addStatic}
                  disabled={!extras.useStatic || extras.staticLabels.length >= STATIC_LABEL_MAX}
                >
                  ＋ 新增文字
                </button>
              </div>
            </article>

            <article className="extra-card">
              <label className="extra-card-head">
                <input
                  type="checkbox"
                  checked={extras.useImage}
                  onChange={(e) =>
                    onChangeExtras({
                      ...extras,
                      useImage: e.target.checked,
                      imageSrc: e.target.checked ? extras.imageSrc : '',
                    })
                  }
                />
                <span>
                  <strong>圖片</strong>
                  <em>校徽、班徽等共用圖</em>
                </span>
              </label>
              <div className={`extra-card-body ${extras.useImage ? '' : 'is-disabled'}`}>
                <div className="extra-card-main">
                  {extras.useImage && extras.imageSrc ? (
                    <div className="image-preview-wrap">
                      <img className="image-preview" src={extras.imageSrc} alt="全員圖片預覽" />
                      <button
                        type="button"
                        className="image-preview-del"
                        title="刪除圖片"
                        aria-label="刪除圖片"
                        onClick={() => onChangeExtras({ ...extras, imageSrc: '' })}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <p className="extra-placeholder">
                      {extras.useImage ? '尚未選擇圖片' : '勾選後可上傳圖片'}
                    </p>
                  )}
                </div>
                {!(extras.useImage && extras.imageSrc) && (
                  <label className="image-pick extra-card-foot">
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={!extras.useImage}
                      onChange={(e) => {
                        onPickImage(e.target.files?.[0])
                        e.target.value = ''
                      }}
                    />
                    選擇圖片
                  </label>
                )}
              </div>
            </article>
          </div>
        </section>
        )}

        <div className="confirm-footer">
          <button type="button" className="btn" onClick={onBack}>
            重新上傳
          </button>
          <button type="button" className="btn primary" onClick={onConfirm} disabled={!canConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
