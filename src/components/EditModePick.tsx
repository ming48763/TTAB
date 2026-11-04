import { matchesPhoneScreen } from '../lib/screenLayout'
import { PoolScroller } from './PoolScroller'

interface Props {
  onPickBooth: () => void
  onPickEditor: () => void
  onBack: () => void
}

const EDITOR_PHONE_HINT =
  '本模式需要較大的畫面空間，建議使用電腦或平板以獲得更佳體驗。'

export function EditModePick({ onPickBooth, onPickEditor, onBack }: Props) {
  function pickEditor() {
    if (matchesPhoneScreen()) window.alert(EDITOR_PHONE_HINT)
    onPickEditor()
  }

  return (
    <PoolScroller when="tablet-landscape" hideRailWhenFit bodyClassName="edit-mode-pick">
      <div className="edit-mode-grid">
        <button type="button" className="tool-tile is-ready" onClick={onPickBooth}>
          <strong>拍貼機模式</strong>
          <span>
            跟著步驟一步一步點選，適合<s>懶惰</s>缺乏時間的你。
          </span>
        </button>
        <button type="button" className="tool-tile is-ready" onClick={pickEditor}>
          <strong>編輯器模式</strong>
          <span>自定義性高，適合喜歡自己動手布局的你。</span>
        </button>
      </div>
      <div className="confirm-footer is-start">
        <button type="button" className="btn" onClick={onBack}>
          返回欄位設定
        </button>
      </div>
    </PoolScroller>
  )
}
