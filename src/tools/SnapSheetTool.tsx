import { useEffect, useMemo, useRef, useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { StepRail } from '../components/StepRail'
import { ExcelLimitError, assertXlsxSize, fileUploadDialogMessage, parseExcelFile, swallowFollowingClick } from '../lib/excel'
import { UploadLimitNotice } from '../components/UploadLimitNotice'
import {
  applyStats,
  bestNameMatch,
  emptySnapTable,
  guessNameCol,
  guessScoreCols,
  ocrImageToTable,
  rosterFromStudents,
  type RosterPerson,
  type SnapTable,
} from '../lib/snapSheet'
import { exportSnapSheetExcel } from '../lib/snapSheetExport'

interface Props {
  onHome: () => void
}

type Step = 'upload' | 'edit'

function stemName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || fileName
}

function withXlsx(name: string) {
  const trimmed = name.trim() || '拍拍成表'
  return /\.xlsx$/i.test(trimmed) ? trimmed : `${trimmed}.xlsx`
}

export function SnapSheetTool({ onHome }: Props) {
  const imgRef = useRef<HTMLInputElement>(null)
  const rosterRef = useRef<HTMLInputElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const hRailRef = useRef<HTMLDivElement>(null)
  const syncingScroll = useRef(false)

  const [step, setStep] = useState<Step>('upload')
  const [tableScrollWidth, setTableScrollWidth] = useState(0)
  const [preview, setPreview] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState('')
  const [sheetTitle, setSheetTitle] = useState('拍拍成表')
  const [table, setTable] = useState<SnapTable>(() => emptySnapTable())
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [limitMessage, setLimitMessage] = useState<string | null>(null)
  const [roster, setRoster] = useState<RosterPerson[]>([])
  const [rosterName, setRosterName] = useState('')
  const [wantTotal, setWantTotal] = useState(false)
  const [wantAvg, setWantAvg] = useState(false)
  const [wantRank, setWantRank] = useState(false)
  const [ocrReady, setOcrReady] = useState(false)

  const nameCol = useMemo(() => guessNameCol(table.headers, table.rows), [table])
  const scoreCols = useMemo(() => guessScoreCols(table.headers, table.rows), [table])

  const display = useMemo(
    () => applyStats(table, scoreCols, { total: wantTotal, average: wantAvg, rank: wantRank }),
    [table, scoreCols, wantTotal, wantAvg, wantRank],
  )

  const canEdit = ocrReady && !busy

  useEffect(() => {
    if (step !== 'edit') return
    const el = tableRef.current
    if (!el) return
    const update = () => setTableScrollWidth(el.scrollWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [table, step])

  function syncFromBody() {
    if (syncingScroll.current) return
    const body = bodyRef.current
    const rail = hRailRef.current
    if (!body || !rail) return
    syncingScroll.current = true
    rail.scrollLeft = body.scrollLeft
    syncingScroll.current = false
  }

  function syncFromRail() {
    if (syncingScroll.current) return
    const body = bodyRef.current
    const rail = hRailRef.current
    if (!body || !rail) return
    syncingScroll.current = true
    body.scrollLeft = rail.scrollLeft
    syncingScroll.current = false
  }

  async function runOcr(file: File) {
    setError(null)
    setOcrReady(false)
    setBusy(true)
    setProgress(0)
    setStatus('準備辨識…')
    const url = URL.createObjectURL(file)
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return url
    })
    setPhotoName(file.name)
    setSheetTitle(stemName(file.name))
    try {
      const next = await ocrImageToTable(file, (p) => {
        setStatus(p.status)
        setProgress(Math.round(p.progress * 100))
      })
      setTable(next)
      setOcrReady(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '辨識失敗')
      setOcrReady(false)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  async function onRosterFile(file: File) {
    setError(null)
    setLimitMessage(null)
    try {
      assertXlsxSize(file)
      const parsed = await parseExcelFile(await file.arrayBuffer())
      const people = rosterFromStudents(parsed.rows, parsed.mappings)
      setRoster(people)
      setRosterName(file.name)
    } catch (e) {
      const dialog = e instanceof ExcelLimitError ? e.message : fileUploadDialogMessage(e)
      if (dialog) setLimitMessage(dialog)
      else setError(e instanceof Error ? e.message : '名單讀取失敗')
    }
  }

  function goEdit() {
    if (!canEdit) return
    setError(null)
    setStep('edit')
  }

  function backToUpload() {
    setStep('upload')
  }

  function setHeader(col: number, value: string) {
    setTable((cur) => {
      const headers = [...cur.headers]
      headers[col] = value
      return { ...cur, headers }
    })
  }

  function setCell(row: number, col: number, value: string) {
    setTable((cur) => {
      const rows = cur.rows.map((r) => [...r])
      if (!rows[row]) return cur
      rows[row][col] = value
      return { ...cur, rows }
    })
  }

  function addRow() {
    setTable((cur) => ({
      ...cur,
      rows: [...cur.rows, Array.from({ length: cur.headers.length }, () => '')],
    }))
  }

  function addCol() {
    setTable((cur) => ({
      headers: [...cur.headers, `欄${cur.headers.length + 1}`],
      rows: cur.rows.map((r) => [...r, '']),
    }))
  }

  function removeRow(i: number) {
    setTable((cur) => ({ ...cur, rows: cur.rows.filter((_, idx) => idx !== i) }))
  }

  function removeCol(col: number) {
    setTable((cur) => {
      if (cur.headers.length <= 1) return cur
      return {
        headers: cur.headers.filter((_, i) => i !== col),
        rows: cur.rows.map((r) => r.filter((_, i) => i !== col)),
      }
    })
  }

  function applyNameFix(row: number, name: string) {
    if (nameCol < 0) return
    setCell(row, nameCol, name)
  }

  if (step === 'upload') {
    return (
      <div className="app">
        <header className="site-header no-print">
          <div className="brand">
            <BrandMark onHome={onHome} />
            <div>
              <h1>拍拍成表</h1>
            </div>
          </div>
          <StepRail
            steps={[
              { label: '上傳', state: 'is-current' },
              { label: '編輯' },
            ]}
          />
        </header>

        <main className="site-main">
          <div className="step-page">
            <div className="panel upload-panel snap-upload-panel">
              <div className="panel-head">
                <h2>上傳表格照片</h2>
                <p>先辨識照片，再進入編輯頁修改與匯出。名單為可選。</p>
              </div>

              <div className="snap-upload-grid">
                <div className="snap-upload-block">
                  <h3>表格照片</h3>
                  <div
                    className={`dropzone snap-dropzone ${busy ? 'is-busy' : ''}`}
                    onClick={() => !busy && imgRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (file && file.type.startsWith('image/')) void runOcr(file)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') imgRef.current?.click()
                    }}
                  >
                    <input
                      ref={imgRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) void runOcr(file)
                        e.target.value = ''
                      }}
                    />
                    {preview ? (
                      <img src={preview} alt="上傳預覽" className="snap-preview" />
                    ) : (
                      <>
                        <span className="dropzone-title">拖曳圖片到這裡，或點擊上傳／拍照</span>
                        <span className="dropzone-hint">辨識完成後即可進入編輯</span>
                      </>
                    )}
                  </div>
                  {busy ? (
                    <p className="snap-progress">
                      辨識中 {progress}% {status ? `· ${status}` : ''}
                    </p>
                  ) : null}
                  {preview && !busy ? (
                    <div className="snap-fold-actions">
                      <button type="button" className="btn ghost" onClick={() => imgRef.current?.click()}>
                        更換照片
                      </button>
                      {photoName ? <p className="snap-hint">已上傳：{photoName}</p> : null}
                    </div>
                  ) : null}
                </div>

                <div className="snap-upload-block">
                  <div className="panel-head is-center">
                    <h2>匯入名冊</h2>
                    <p>上傳 Excel（.xlsx / .xls / .csv）</p>
                  </div>
                  <div
                    className="dropzone snap-dropzone"
                    onClick={() => {
                      const input = rosterRef.current
                      if (!input) return
                      input.addEventListener('change', () => swallowFollowingClick(), { once: true })
                      input.addEventListener('cancel', () => swallowFollowingClick(), { once: true })
                      input.click()
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const file = e.dataTransfer.files?.[0]
                      if (file) void onRosterFile(file)
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        const input = rosterRef.current
                        if (!input) return
                        input.addEventListener('change', () => swallowFollowingClick(), { once: true })
                        input.addEventListener('cancel', () => swallowFollowingClick(), { once: true })
                        input.click()
                      }
                    }}
                  >
                    <span className="dropzone-title">拖曳檔案到這裡，或點擊選擇</span>
                  </div>
                  {roster.length > 0 ? (
                    <div className="snap-fold-actions">
                      <p className="snap-hint">已載入：{rosterName || '名冊'}（{roster.length} 人）</p>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setRoster([])
                          setRosterName('')
                        }}
                      >
                        清除名單
                      </button>
                    </div>
                  ) : null}
                  <input
                    ref={rosterRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void onRosterFile(file)
                      e.target.value = ''
                    }}
                  />
                </div>
              </div>

              {error ? <p className="form-error">{error}</p> : null}

              <div className="snap-upload-foot">
                <button type="button" className="btn primary" disabled={!canEdit} onClick={goEdit}>
                  進入編輯
                </button>
              </div>
            </div>
          </div>
        </main>
        {limitMessage ? <UploadLimitNotice message={limitMessage} onClose={() => setLimitMessage(null)} /> : null}
      </div>
    )
  }

  return (
    <div className="app step-snap">
      <header className="site-header seat-work-head no-print">
        <div className="brand">
          <BrandMark size="sm" onHome={onHome} />
          <div>
            <h1>拍拍成表</h1>
          </div>
        </div>
        <StepRail
          steps={[
            { label: '上傳', state: 'is-done' },
            { label: '編輯', state: 'is-current' },
          ]}
        />
      </header>

      <main className="snap-main">
        <div className="snap-table-chrome">
          <header className="snap-table-bar">
            <label className="snap-title-field">
              <span className="visually-hidden">檔案名稱</span>
              <input
                value={sheetTitle}
                onChange={(e) => setSheetTitle(e.target.value)}
                placeholder="檔案名稱"
                aria-label="檔案名稱"
              />
            </label>
            <div className="snap-table-actions">
              <button type="button" className="btn ghost" onClick={backToUpload}>
                重新上傳
              </button>
              <button type="button" className="btn ghost" onClick={addRow}>
                加列
              </button>
              <button type="button" className="btn ghost" onClick={addCol}>
                加欄
              </button>
              <button
                type="button"
                className="btn primary snap-export-btn"
                onClick={() => void exportSnapSheetExcel(display, withXlsx(sheetTitle))}
              >
                匯出
              </button>
            </div>
          </header>
          <div className="snap-table-bar-row2" role="group" aria-label="自動計算">
            <span className="snap-calc-label">自動計算</span>
            <label className="snap-check">
              <input type="checkbox" checked={wantTotal} onChange={(e) => setWantTotal(e.target.checked)} />
              總分
            </label>
            <label className="snap-check">
              <input type="checkbox" checked={wantAvg} onChange={(e) => setWantAvg(e.target.checked)} />
              平均
            </label>
            <label className="snap-check">
              <input type="checkbox" checked={wantRank} onChange={(e) => setWantRank(e.target.checked)} />
              排名
            </label>
            {(wantTotal || wantAvg || wantRank) && scoreCols.length === 0 ? (
              <span className="snap-chrome-hint">目前沒有可辨識的數字欄，請先在表格填入分數</span>
            ) : null}
          </div>
        </div>

        <section className="snap-table-wrap">
          <div
            className="snap-table-scroll"
            ref={bodyRef}
            onScroll={syncFromBody}
            onWheel={(e) => {
              if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
              const body = bodyRef.current
              const rail = hRailRef.current
              if (!body || !rail) return
              rail.scrollLeft += e.deltaX
              body.scrollLeft = rail.scrollLeft
            }}
          >
            <table className="snap-table" ref={tableRef}>
              <thead>
                <tr>
                  <th className="snap-row-num">#</th>
                  {table.headers.map((h, c) => (
                    <th key={c}>
                      <div className="snap-th-stack">
                        <input
                          className="snap-th-input"
                          value={h}
                          onChange={(e) => setHeader(c, e.target.value)}
                          aria-label={`欄位${c + 1}`}
                        />
                        <button
                          type="button"
                          className="snap-x"
                          onClick={() => removeCol(c)}
                          aria-label={`刪除欄${c + 1}`}
                          disabled={table.headers.length <= 1}
                        >
                          ×
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => {
                  const rawName = nameCol >= 0 ? row[nameCol] ?? '' : ''
                  const match = roster.length > 0 && rawName ? bestNameMatch(rawName, roster) : null
                  const warn = match && !match.exact
                  return (
                    <tr key={r} className={warn ? 'is-warn' : undefined}>
                      <td className="snap-row-num">
                        <div className="snap-row-id">
                          <span>{r + 1}</span>
                          <button type="button" className="snap-x" onClick={() => removeRow(r)} aria-label="刪列">
                            ×
                          </button>
                        </div>
                      </td>
                      {table.headers.map((_, c) => (
                        <td key={c}>
                          <input
                            value={row[c] ?? ''}
                            onChange={(e) => setCell(r, c, e.target.value)}
                            aria-label={`第${r + 1}列第${c + 1}欄`}
                          />
                          {c === nameCol && warn ? (
                            <button
                              type="button"
                              className="snap-fix"
                              onClick={() => applyNameFix(r, match.person.name)}
                              title="套用名單姓名"
                            >
                              → {match.person.name}
                              {match.person.seat ? `（${match.person.seat}）` : ''}
                            </button>
                          ) : null}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="snap-h-rail" ref={hRailRef} onScroll={syncFromRail} aria-label="左右捲動">
            <div className="snap-h-rail-spacer" style={{ width: Math.max(tableScrollWidth, 1) }} />
          </div>
        </section>
      </main>
    </div>
  )
}
