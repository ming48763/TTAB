interface Props {
  message: string
  title?: string
  onClose: () => void
}

export function UploadLimitNotice({ message, title = '上傳失敗', onClose }: Props) {
  return (
    <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="upload-limit-title">
      <div className="seat-notice-card">
        <h3 id="upload-limit-title">{title}</h3>
        {message.split('\n').map((line) => (
          <p key={line}>{line}</p>
        ))}
        <button type="button" className="btn primary" onClick={onClose}>
          知道了
        </button>
      </div>
    </div>
  )
}
