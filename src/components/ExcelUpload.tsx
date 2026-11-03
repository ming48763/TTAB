import { useRef, useState } from 'react'
import {
  ExcelLimitError,
  assertXlsxSize,
  fileUploadDialogMessage,
  parseExcelFile,
  sensitiveColumnsMessage,
} from '../lib/excel'
import { swallowFollowingClick } from '../lib/swallowClick'
import type { ColumnMapping, StudentRow } from '../types'
import { UploadLimitNotice } from './UploadLimitNotice'

type LoadedPayload = {
  fileName: string
  headers: string[]
  rows: StudentRow[]
  mappings: ColumnMapping[]
}

interface Props {
  lead?: string
  dropHint?: string | null
  centerHead?: boolean
  onLoaded: (payload: LoadedPayload) => void
}

export function ExcelUpload({
  onLoaded,
  lead = '上傳 Excel（.xlsx / .xls / .csv）',
  dropHint = null,
  centerHead = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingLoad = useRef<LoadedPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitMessage, setLimitMessage] = useState<string | null>(null)
  const [limitTitle, setLimitTitle] = useState('上傳失敗')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  function pickFile() {
    const input = inputRef.current
    if (!input) return
    input.addEventListener('change', () => swallowFollowingClick(), { once: true })
    input.addEventListener('cancel', () => swallowFollowingClick(), { once: true })
    input.click()
  }

  function finishNotice() {
    setLimitMessage(null)
    setLimitTitle('上傳失敗')
    const pending = pendingLoad.current
    pendingLoad.current = null
    if (pending) onLoaded(pending)
  }

  async function handleFile(file: File) {
    setError(null)
    setLimitMessage(null)
    setLimitTitle('上傳失敗')
    pendingLoad.current = null
    setBusy(true)
    try {
      assertXlsxSize(file)
      const buffer = await file.arrayBuffer()
      const parsed = await parseExcelFile(buffer)
      const payload: LoadedPayload = {
        fileName: file.name,
        headers: parsed.headers,
        rows: parsed.rows,
        mappings: parsed.mappings,
      }
      if (parsed.skippedSensitive?.length) {
        pendingLoad.current = payload
        setLimitTitle('注意')
        setLimitMessage(sensitiveColumnsMessage(parsed.skippedSensitive))
      } else {
        onLoaded(payload)
      }
    } catch (e) {
      const dialog = e instanceof ExcelLimitError ? e.message : fileUploadDialogMessage(e)
      if (dialog) {
        setLimitTitle('上傳失敗')
        setLimitMessage(dialog)
      } else setError(e instanceof Error ? e.message : '讀取失敗')
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
            if (!file) return
            void handleFile(file)
          }}
          onClick={() => pickFile()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              pickFile()
            }
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
      {limitMessage ? <UploadLimitNotice title={limitTitle} message={limitMessage} onClose={finishNotice} /> : null}
    </div>
  )
}
