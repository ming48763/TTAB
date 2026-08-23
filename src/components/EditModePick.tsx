interface Props {
  onPickBooth: () => void
  onPickEditor: () => void
  onBack: () => void
}

export function EditModePick({ onPickBooth, onPickEditor, onBack }: Props) {
  return (
    <div className="edit-mode-pick">
      <p className="edit-mode-pick-lead">選擇接下來的製作方式</p>
      <div className="edit-mode-grid">
        <button type="button" className="tool-tile is-ready" onClick={onPickBooth}>
          <strong>拍貼機模式</strong>
          <span>
            跟著步驟一步一步點選，適合<s>懶惰</s>缺乏時間的你。
          </span>
        </button>
        <button type="button" className="tool-tile is-ready" onClick={onPickEditor}>
          <strong>編輯器模式</strong>
          <span>自定義性高，適合喜歡自己動手布局的你。</span>
        </button>
      </div>
      <div className="confirm-footer">
        <button type="button" className="btn" onClick={onBack}>
          返回欄位設定
        </button>
      </div>
    </div>
  )
}
