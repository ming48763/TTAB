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
}: Props) {
  function update(index: number, patch: Partial<ColumnMapping>) {
    onChangeMappings(mappings.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

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

  const preview = rows.slice(0, 3)
  const importCount = rows.reduce((max, row) => Math.max(max, row.rowIndex), 0)
  const activeCount = mappings.filter((m) => m.enabled).length
  const hasStatic =
    extras.useStatic && extras.staticLabels.some((s) => s.text.trim().length > 0)
  const hasImage = extras.useImage && extras.imageSrc.length > 0
  const canConfirm = showExtras
    ? activeCount > 0 || extras.useSequence || hasStatic || hasImage
    : activeCount > 0

  return (
    <div className="step-page">
      <div className="panel confirm-panel">
        <div className="panel-head">
          <h2>{showExtras ? '確認欄位與標籤' : '確認欄位'}</h2>
        </div>

        <section className="confirm-section">
          <div className="section-head">
            <h3>匯入欄位</h3>
            <p className="muted">已讀取{importCount}筆資料</p>
          </div>
          <div className="table-wrap">
            <table className="map-table">
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
                      <div className="preview-cells">
                      {preview.map((row) => (
                        <span key={row.rowIndex}>{row.values[m.header] || '—'}</span>
                      ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {showExtras && (
        <section className="confirm-section">
          <div className="section-head">
            <h3>額外標籤（選配）</h3>
            <p className="muted">三類皆可獨立勾選，不是必填。</p>
          </div>

          <div className="extra-grid">
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
                  disabled={!extras.useStatic}
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
