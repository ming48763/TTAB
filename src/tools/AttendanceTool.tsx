import { useMemo, useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { AttendanceBoard, type ChainBlock, type PackedCard } from '../components/AttendanceBoard'
import {
  periodCards,
  reasonCards,
  seatCards,
  speakChain,
  type AttendanceCard,
  type PeriodLevel,
} from '../lib/attendance'
import {
  exportAttendanceExcel,
  importAttendanceExcel,
  mergeImportedPacks,
  mergeNames,
  todayIso,
  weekdayMon0FromIso,
  type AttDateMode,
} from '../lib/attendanceExport'
import { uid } from '../types'

interface Props {
  onHome: () => void
}

function asBlock(card: AttendanceCard): ChainBlock {
  return { ...card, runId: uid() }
}

function withoutEmpty(rows: ChainBlock[][]) {
  return rows.filter((row) => row.length > 0)
}

function hasOtherReason(line: ChainBlock[], runId?: string) {
  return line.some((b) => b.kind === 'reason' && b.runId !== runId)
}

function findBlock(rows: ChainBlock[][], runId: string) {
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i].findIndex((b) => b.runId === runId)
    if (j >= 0) return { row: i, idx: j }
  }
  return null
}

function insertInto(
  cur: ChainBlock[][],
  row: number,
  afterIndex: number,
  block: ChainBlock,
  from: { row: number; idx: number } | null,
) {
  const next = cur.map((line) => [...line])
  if (from) {
    if (from.row === row && (from.idx === afterIndex || from.idx === afterIndex + 1)) return cur
    next[from.row].splice(from.idx, 1)
  }
  const dest = next[row]
  if (!dest) return withoutEmpty([...next, [block]])
  if (block.kind === 'reason' && hasOtherReason(dest, block.runId)) {
    next.splice(row + 1, 0, [block])
    return withoutEmpty(next)
  }
  let at = afterIndex
  if (from && from.row === row && from.idx <= afterIndex) at -= 1
  dest.splice(at + 1, 0, block)
  return withoutEmpty(next)
}

export function AttendanceTool({ onHome }: Props) {
  const seats = useMemo(() => seatCards(), [])
  const reasons = useMemo(() => reasonCards(), [])
  const [periodLevel, setPeriodLevel] = useState<PeriodLevel>('above')
  const periods = useMemo(() => periodCards(periodLevel), [periodLevel])
  const [chains, setChains] = useState<ChainBlock[][]>([])
  const [packs, setPacks] = useState<PackedCard[]>([])
  const [names] = useState<string[]>(() => Array.from({ length: 30 }, () => ''))
  const [dateMode, setDateMode] = useState<AttDateMode>('today')
  const [pickedDate, setPickedDate] = useState(todayIso)
  const [exportOpen, setExportOpen] = useState(false)

  function packStamp() {
    const date = dateMode === 'fixed' ? pickedDate : todayIso()
    return { dateMode, date, weekday: weekdayMon0FromIso(date) }
  }

  function insertAt(row: number, afterIndex: number, card: AttendanceCard, runId?: string) {
    setChains((cur) => {
      if (runId) {
        const from = findBlock(cur, runId)
        if (!from) return cur
        return insertInto(cur, row, afterIndex, cur[from.row][from.idx], from)
      }
      return insertInto(cur, row, afterIndex, asBlock(card), null)
    })
  }

  function appendRow(row: number, card: AttendanceCard, runId?: string) {
    setChains((cur) => {
      const after = (cur[row]?.length ?? 1) - 1
      if (runId) {
        const from = findBlock(cur, runId)
        if (!from) return cur
        return insertInto(cur, row, after, cur[from.row][from.idx], from)
      }
      return insertInto(cur, row, after, asBlock(card), null)
    })
  }

  function newRow(card: AttendanceCard) {
    setChains((cur) => [...cur, [asBlock(card)]])
  }

  function removeBlock(runId: string) {
    setChains((cur) => withoutEmpty(cur.map((row) => row.filter((b) => b.runId !== runId))))
  }

  function saveReady() {
    const ready = chains.filter((row) => speakChain(row, periodLevel))
    if (ready.length === 0) return
    setPacks((cur) => [
      ...cur,
      ...ready.map((row) => ({
        id: uid(),
        text: speakChain(row, periodLevel) as string,
        blocks: row.map(({ runId: _id, ...card }) => card),
        ...packStamp(),
      })),
    ])
    setChains((cur) => cur.filter((row) => !speakChain(row, periodLevel)))
  }

  function packRow(fromRunId: string) {
    const row = chains.find((line) => line[0]?.runId === fromRunId)
    const text = row ? speakChain(row, periodLevel) : null
    if (!row || !text) return
    setPacks((cur) => [
      ...cur,
      {
        id: uid(),
        text,
        blocks: row.map(({ runId: _id, ...card }) => card),
        ...packStamp(),
      },
    ])
    setChains((cur) => cur.filter((line) => line[0]?.runId !== fromRunId))
  }

  function unpack(id: string) {
    const pack = packs.find((p) => p.id === id)
    if (!pack) return
    setPacks((cur) => cur.filter((p) => p.id !== id))
    setChains((cur) => [...cur, pack.blocks.map(asBlock)])
  }

  return (
    <div className="app step-att">
      <header className="site-header att-header no-print">
        <div className="brand">
          <BrandMark onHome={onHome} />
          <div>
            <h1>出缺席快拉</h1>
          </div>
        </div>
        <div className="att-tools">
          <div className="att-level" role="group" aria-label="節次學段">
            <button
              type="button"
              className={periodLevel === 'elementary' ? 'is-on' : ''}
              onClick={() => setPeriodLevel('elementary')}
            >
              國小
            </button>
            <button
              type="button"
              className={periodLevel === 'above' ? 'is-on' : ''}
              onClick={() => setPeriodLevel('above')}
            >
              國小以上
            </button>
          </div>
          <div className="att-head-actions">
            <div className="toolbar-drop att-date-drop">
              <button type="button" className="toolbar-drop-btn">
                {dateMode === 'fixed' ? '擇日' : '今天'}
              </button>
              <div className="toolbar-drop-menu att-date-menu">
                <div className="att-date-card">
                  <button
                    type="button"
                    className={dateMode === 'today' ? 'is-on' : ''}
                    onClick={() => setDateMode('today')}
                  >
                    今天
                  </button>
                  <button
                    type="button"
                    className={dateMode === 'fixed' ? 'is-on' : ''}
                    onClick={() => setDateMode('fixed')}
                  >
                    擇日
                  </button>
                  {dateMode === 'fixed' ? (
                    <label className="att-date-pick">
                      <input
                        type="date"
                        value={pickedDate}
                        onChange={(e) => setPickedDate(e.target.value || todayIso())}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            </div>
            <button type="button" className="toolbar-drop-btn" onClick={() => setExportOpen(true)}>
              匯出
            </button>
          </div>
        </div>
      </header>
      {exportOpen ? (
        <div className="att-export-mask" onClick={() => setExportOpen(false)}>
          <div
            className="att-export-dialog"
            role="dialog"
            aria-labelledby="att-export-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="att-export-title">本週紀錄</h2>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setExportOpen(false)
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.xlsx,.xls'
                input.onchange = async () => {
                  const file = input.files?.[0]
                  if (!file) return
                  const incoming = await importAttendanceExcel(await file.arrayBuffer(), periodLevel)
                  const stamped = packs.map((pack) =>
                    pack.dateMode === 'standing'
                      ? pack
                      : { ...pack, ...packStamp(), dateMode: packStamp().dateMode },
                  )
                  const mergedPacks = mergeImportedPacks(incoming.packs, stamped, periodLevel)
                  const mergedNames = mergeNames(incoming.names, names)
                  await exportAttendanceExcel(mergedPacks, mergedNames, periodLevel, packStamp(), {
                    restamp: false,
                    presentDays: incoming.presentDays,
                  })
                }
                input.click()
              }}
            >
              本周已有紀錄，匯入舊檔
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setExportOpen(false)
                void exportAttendanceExcel(packs, names, periodLevel, packStamp())
              }}
            >
              本周未有紀錄，匯出新檔
            </button>
            <button type="button" className="btn ghost" onClick={() => setExportOpen(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
      <main className="att-main">
        <AttendanceBoard
          seats={seats}
          reasons={reasons}
          periods={periods}
          periodLevel={periodLevel}
          chains={chains}
          packs={packs}
          onInsert={insertAt}
          onAppendRow={appendRow}
          onNewRow={newRow}
          onMoveChain={(fromRunId, toRow) => {
            setChains((cur) => {
              const from = cur.findIndex((line) => line[0]?.runId === fromRunId)
              if (from < 0 || from === toRow) return cur
              const next = cur.map((line) => [...line])
              const [line] = next.splice(from, 1)
              const dest = Math.max(0, Math.min(toRow > from ? toRow - 1 : toRow, next.length))
              next.splice(dest, 0, line)
              return next
            })
          }}
          onRemove={removeBlock}
          onRemoveChain={(fromRunId) => {
            setChains((cur) => cur.filter((line) => line[0]?.runId !== fromRunId))
          }}
          onCommitCards={(cards) => {
            setChains((cur) => {
              const blocks = cards.map(asBlock)
              if (blocks.length === 0) return cur
              if (cur.length === 0) return [blocks]
              const last = cur[cur.length - 1]
              const kind = cards[0]?.kind
              const occupied =
                kind === 'seat'
                  ? last.some((b) => b.kind === 'seat')
                  : kind === 'period'
                    ? last.some((b) => b.kind === 'period')
                    : false
              if (occupied) return [...cur, blocks]
              return [...cur.slice(0, -1), [...last, ...blocks]]
            })
          }}
          onAddSeats={(runId, cards) => {
            setChains((cur) => {
              const loc = findBlock(cur, runId)
              if (!loc) return cur
              const next = cur.map((line) => [...line])
              const line = next[loc.row]
              const have = new Set(line.filter((b) => b.kind === 'seat').map((b) => b.id))
              const add = cards.filter((c) => c.kind === 'seat' && !have.has(c.id)).map(asBlock)
              if (add.length > 0) {
                const lastSeat = line.reduce((acc, b, i) => (b.kind === 'seat' ? i : acc), -1)
                const at = lastSeat >= 0 ? lastSeat + 1 : loc.idx + 1
                line.splice(at, 0, ...add)
              }
              const toolAt = line.findIndex((b) => b.runId === runId)
              if (toolAt >= 0) line.splice(toolAt, 1)
              return withoutEmpty(next)
            })
          }}
          onSave={saveReady}
          onPackChain={packRow}
          onUnpack={unpack}
          onDeletePack={(id) => setPacks((cur) => cur.filter((p) => p.id !== id))}
          onClearPacks={() => setPacks([])}
        />
      </main>
    </div>
  )
}
