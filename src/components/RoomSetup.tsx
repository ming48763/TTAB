import { useState } from 'react'

export interface RoomSpecDraft {
  id: string
  capacity: string
  count: string
  enabled: boolean
}

interface Props {
  drafts: RoomSpecDraft[]
  studentCount: number
  onChange: (next: RoomSpecDraft[]) => void
  onBack: () => void
  onConfirm: () => void
}

const ROOM_NUMBERS = Array.from({ length: 10 }, (_, index) => String(index + 1))

function parsed(draft: RoomSpecDraft) {
  const capacity = Number(draft.capacity)
  const count = Number(draft.count)
  if (!Number.isInteger(capacity) || capacity < 1) return null
  if (!Number.isInteger(count) || count < 1) return null
  return { capacity, count }
}

export function RoomSetup({ drafts, studentCount, onChange, onBack, onConfirm }: Props) {
  const [notice, setNotice] = useState<string | null>(null)
  const specs = drafts.filter((draft) => draft.enabled).map(parsed)
  const ready = specs.length > 0 && specs.every((spec) => spec)
  const beds = specs.reduce((sum, spec) => sum + (spec ? spec.capacity * spec.count : 0), 0)
  const formula = specs
    .flatMap((spec) => (spec ? [`${spec.capacity} 人 × ${spec.count} 間`] : []))
    .join(' ＋ ')

  function patch(id: string, field: 'capacity' | 'count', value: string) {
    onChange(drafts.map((draft) => (draft.id === id ? { ...draft, [field]: value } : draft)))
  }

  function confirm() {
    if (!ready) return
    if (studentCount > beds) {
      setNotice(`目前有 ${beds} 個床位，名單有 ${studentCount} 人，床位不夠。請勾選更多房型，或增加房型人數與房間數量。`)
      return
    }
    onConfirm()
  }

  return (
    <div className="step-page">
      <div className="panel room-setup">
        <p className="muted room-setup-summary">
          <span>
            {formula ? `${formula} ＝ ` : ''}
            {beds} 個床位
          </span>
          <span>{studentCount > beds ? `${studentCount} 人，目前床位不夠` : '床位已足夠'}</span>
        </p>
        <div className="room-setup-list">
          {drafts.map((draft, index) => (
            <div key={draft.id} className={`room-setup-row${draft.enabled ? '' : ' is-off'}`}>
              <label className="room-setup-check">
                <input
                  type="checkbox"
                  aria-label={`啟用第${index + 1}列`}
                  checked={draft.enabled}
                  onChange={() =>
                    onChange(drafts.map((item) => (item.id === draft.id ? { ...item, enabled: !item.enabled } : item)))
                  }
                />
              </label>
              <label>
                <span>房型</span>
                <select
                  aria-label={`第${index + 1}列房型`}
                  value={draft.capacity}
                  disabled={!draft.enabled}
                  onChange={(event) => patch(draft.id, 'capacity', event.target.value)}
                >
                  {ROOM_NUMBERS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>房間數量</span>
                <select
                  aria-label={`第${index + 1}列房間數量`}
                  value={draft.count}
                  disabled={!draft.enabled}
                  onChange={(event) => patch(draft.id, 'count', event.target.value)}
                >
                  {ROOM_NUMBERS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
        <div className="room-setup-actions">
          <button type="button" className="btn" onClick={onBack}>
            返回匯入
          </button>
          <button type="button" className="btn primary" disabled={!ready} onClick={confirm}>
            確認，開始排房間
          </button>
        </div>
      </div>
      {notice && (
        <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="room-notice-title">
          <div className="seat-notice-card">
            <h3 id="room-notice-title">床位不夠</h3>
            <p>{notice}</p>
            <button type="button" className="btn primary" onClick={() => setNotice(null)}>
              知道了
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
