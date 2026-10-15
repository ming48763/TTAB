import { useRef, useState } from 'react'
import { ExcelLimitError, assertXlsxSize, fileUploadDialogMessage, parseExcelFile } from '../lib/excel'
import type { ColumnMapping, StudentRow } from '../types'
import { UploadLimitNotice } from './UploadLimitNotice'

interface Props {
  lead?: string
  dropHint?: string | null
  centerHead?: boolean
  onLoaded: (payload: {
    fileName: string
    headers: string[]
    rows: StudentRow[]
    mappings: ColumnMapping[]
  }) => void
}

export function ExcelUpload({
  onLoaded,
  lead = '上傳 Excel（.xlsx / .xls / .csv）',
  dropHint = null,
  centerHead = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitMessage, setLimitMessage] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    setLimitMessage(null)
    setBusy(true)
    try {
      assertXlsxSize(file)
      const buffer = await file.arrayBuffer()
      const parsed = await parseExcelFile(buffer)
      onLoaded({
        fileName: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
        mappings: parsed.mappings,
      })
    } catch (e) {
      const dialog = e instanceof ExcelLimitError ? e.message : fileUploadDialogMessage(e)
      if (dialog) setLimitMessage(dialog)
      else setError(e instanceof Error ? e.message : '讀取失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="step-page">
      <div className="panel upload-panel">
        <div className={`panel-head${centerHead ? ' is-center' : ''}`}>
          <h2>匯入名冊</h2>
          <p>{lead}</p>
        </div>

        <div
          className={`dropzone ${dragging ? 'is-drag' : ''} ${busy ? 'is-busy' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const file = e.dataTransfer.files?.[0]
            if (file) void handleFile(file)
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleFile(file)
              e.target.value = ''
            }}
          />
          <span className="dropzone-title">{busy ? '讀取中…' : '拖曳檔案到這裡，或點擊選擇'}</span>
          {dropHint ? <span className="dropzone-hint">{dropHint}</span> : null}
        </div>

        {error && <p className="form-error">{error}</p>}
      </div>
      {limitMessage ? <UploadLimitNotice message={limitMessage} onClose={() => setLimitMessage(null)} /> : null}
    </div>
  )
}
