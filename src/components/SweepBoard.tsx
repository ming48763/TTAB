import { useState, type DragEvent } from 'react'
import { BrandMark } from './BrandMark'
import { studentCardLines, studentKey } from '../lib/seating'
import type { ColumnMapping, StudentRow } from '../types'
import { uid } from '../types'

export type SweepDutyTab = 'inner' | 'outer'
export type SweepFolderHome = 'pool' | 'inner' | 'outer'

export interface SweepFolder {
  id: string
  title: string
  members: string[]
}

export interface SweepAssignments {
  pool: SweepFolder[]
  inner: SweepFolder[]
  outer: SweepFolder[]
}

const TASK_MIME = 'application/x-ttab-sweep-task'
const FOLDER_MIME = 'application/x-ttab-sweep-folder'
const TASK_PREFIX = 'sweep-task:'
const FOLDER_PREFIX = 'sweep-folder:'

const FLOOR_SPOTS = ['講台', '第幾排', '前後', '走廊', '閱讀角'] as const
const TRASH_KINDS = ['一般', '回收', '紙類', '塑膠'] as const
const WINDOW_SPOTS = ['左右', '前後', '窗台', '落地窗'] as const

interface TaskGroup {
  id: string
  label: string
  items: readonly string[]
}

const TASK_GROUPS: TaskGroup[] = [
  { id: 'sweep', label: '掃地', items: FLOOR_SPOTS },
  { id: 'mop', label: '拖地', items: FLOOR_SPOTS },
  { id: 'trash', label: '倒垃圾', items: TRASH_KINDS },
  { id: 'window', label: '窗戶', items: WINDOW_SPOTS },
]

function taskTitle(groupLabel: string, item: string) {
  return `${groupLabel}·${item}`
}

const DUP_SUFFIX = /(（重複）|\(重複\))(\d*)$/

function baseTaskTitle(title: string) {
  return title.replace(DUP_SUFFIX, '').trim()
}

function hasSameTask(folders: SweepFolder[], title: string) {
  const base = baseTaskTitle(title)
  return folders.some((f) => baseTaskTitle(f.title) === base)
}

function uniqueTaskTitle(folders: SweepFolder[], title: string) {
  const base = baseTaskTitle(title)
  if (!hasSameTask(folders, base)) return base
  let n = 1
  let next = `${base}(重複)`
  while (folders.some((f) => f.title === next)) {
    n += 1
    next = `${base}(重複${n})`
  }
  return next
}

function duplicateFolderIds(folders: SweepFolder[]) {
  const counts = new Map<string, number>()
  for (const f of folders) {
    const base = baseTaskTitle(f.title)
    counts.set(base, (counts.get(base) ?? 0) + 1)
  }
  const dups = new Set<string>()
  for (const f of folders) {
    if ((counts.get(baseTaskTitle(f.title)) ?? 0) > 1) dups.add(f.id)
  }
  return dups
}

const DEFAULT_RANDOM_TITLES = [
  taskTitle('掃地', '講台'),
  taskTitle('掃地', '第幾排'),
  taskTitle('拖地', '走廊'),
  taskTitle('倒垃圾', '一般'),
  taskTitle('窗戶', '窗台'),
]

interface Props {
  rows: StudentRow[]
  mappings: ColumnMapping[]
  assignments: SweepAssignments
  onAssign: (next: SweepAssignments) => void
  onBack: () => void
  onHome: () => void
}

function folderStudentCount(folders: SweepFolder[]) {
  return folders.reduce((n, f) => n + f.members.length, 0)
}

function allFolders(a: SweepAssignments) {
  return [...a.pool, ...a.inner, ...a.outer]
}

function allTaken(assignments: SweepAssignments) {
  const keys = new Set<string>()
  for (const folder of allFolders(assignments)) {
    for (const m of folder.members) keys.add(m)
  }
  return keys
}

function stripStudentEverywhere(a: SweepAssignments, student: string): SweepAssignments {
  const clean = (folders: SweepFolder[]) =>
    folders.map((f) => ({ ...f, members: f.members.filter((m) => m !== student) }))
  return { pool: clean(a.pool), inner: clean(a.inner), outer: clean(a.outer) }
}

function findFolderHome(a: SweepAssignments, folderId: string): SweepFolderHome | null {
  if (a.pool.some((f) => f.id === folderId)) return 'pool'
  if (a.inner.some((f) => f.id === folderId)) return 'inner'
  if (a.outer.some((f) => f.id === folderId)) return 'outer'
  return null
}

function takeFolder(a: SweepAssignments, folderId: string): { next: SweepAssignments; folder: SweepFolder | null } {
  const home = findFolderHome(a, folderId)
  if (!home) return { next: a, folder: null }
  const folder = a[home].find((f) => f.id === folderId) ?? null
  return {
    folder,
    next: {
      ...a,
      [home]: a[home].filter((f) => f.id !== folderId),
    },
  }
}

function updateFolder(a: SweepAssignments, folderId: string, patch: Partial<SweepFolder>): SweepAssignments {
  const map = (folders: SweepFolder[]) =>
    folders.map((f) => (f.id === folderId ? { ...f, ...patch, members: patch.members ?? f.members } : f))
  return { pool: map(a.pool), inner: map(a.inner), outer: map(a.outer) }
}

export function SweepBoard({ rows, mappings, assignments, onAssign, onBack, onHome }: Props) {
  const [dragStudent, setDragStudent] = useState<string | null>(null)
  const [dragTask, setDragTask] = useState<string | null>(null)
  const [dragFolder, setDragFolder] = useState<string | null>(null)
  const [hotTarget, setHotTarget] = useState<string | null>(null)
  const [dutyTab, setDutyTab] = useState<SweepDutyTab>('inner')
  const [poolTab, setPoolTab] = useState<'students' | 'tasks'>('students')
  const [customTitle, setCustomTitle] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [shownFields, setShownFields] = useState<string[]>(() => {
    const names = mappings.filter((m) => m.role === 'name').map((m) => m.header)
    if (names.length) return names
    const named = mappings.find((m) => /姓名|名字/.test(m.header) || /姓名|名字/.test(m.label))
    return named ? [named.header] : mappings[0] ? [mappings[0].header] : []
  })

  const byKey = new Map(rows.map((row) => [studentKey(row), row]))
  const taken = allTaken(assignments)
  const poolStudents = rows.filter((row) => !taken.has(studentKey(row)))
  const dutyFolders = assignments[dutyTab]
  const dutyDupIds = duplicateFolderIds(dutyFolders)
  const poolDupIds = duplicateFolderIds(assignments.pool)

  type Payload =
    | { kind: 'task'; value: string }
    | { kind: 'student'; value: string }
    | { kind: 'folder'; value: string }

  function readPayload(e: { dataTransfer: DataTransfer }): Payload | null {
    const folderTyped = e.dataTransfer.getData(FOLDER_MIME) || dragFolder
    if (folderTyped) return { kind: 'folder', value: folderTyped }

    const taskTyped = e.dataTransfer.getData(TASK_MIME)
    if (taskTyped) return { kind: 'task', value: taskTyped }

    const plain = e.dataTransfer.getData('text/plain') || dragTask || dragStudent || dragFolder
    if (!plain) return null
    if (plain.startsWith(FOLDER_PREFIX)) return { kind: 'folder', value: plain.slice(FOLDER_PREFIX.length) }
    if (plain.startsWith(TASK_PREFIX) || dragTask) {
      return {
        kind: 'task',
        value: plain.startsWith(TASK_PREFIX) ? plain.slice(TASK_PREFIX.length) : dragTask!,
      }
    }
    return { kind: 'student', value: plain }
  }

  function endDrag() {
    setDragStudent(null)
    setDragTask(null)
    setDragFolder(null)
    setHotTarget(null)
  }

  function addFolderToDuty(title: string) {
    const nextTitle = uniqueTaskTitle(assignments[dutyTab], title)
    const nextFolder: SweepFolder = { id: uid('sweep'), title: nextTitle, members: [] }
    onAssign({
      ...assignments,
      [dutyTab]: [...assignments[dutyTab], nextFolder],
    })
  }

  function addCustomFolder() {
    const title = customTitle.trim() || '自定義'
    addFolderToDuty(title)
    setCustomTitle('')
  }

  function setFolderTitle(folderId: string, title: string) {
    onAssign(updateFolder(assignments, folderId, { title }))
  }

  function removeFolder(folderId: string) {
    const { next } = takeFolder(assignments, folderId)
    onAssign(next)
  }

  function moveStudentToFolder(student: string, folderId: string) {
    const cleaned = stripStudentEverywhere(assignments, student)
    onAssign(
      updateFolder(cleaned, folderId, {
        members: [
          ...(allFolders(cleaned).find((f) => f.id === folderId)?.members ?? []),
          student,
        ],
      }),
    )
  }

  function returnStudentToPool(student: string) {
    onAssign(stripStudentEverywhere(assignments, student))
  }

  function moveFolderTo(home: SweepFolderHome, folderId: string) {
    const { next, folder } = takeFolder(assignments, folderId)
    if (!folder) return
    onAssign({ ...next, [home]: [...next[home], folder] })
  }

  function fillRandom() {
    if (poolStudents.length === 0) return
    let next: SweepAssignments = {
      pool: [...assignments.pool],
      inner: [...assignments.inner],
      outer: [...assignments.outer],
    }
    const ensure = (tab: SweepDutyTab) => {
      if (next[tab].length > 0) return
      next = {
        ...next,
        [tab]: DEFAULT_RANDOM_TITLES.slice(0, 4).map((title) => ({
          id: uid('sweep'),
          title,
          members: [] as string[],
        })),
      }
    }
    ensure('inner')
    ensure('outer')

    const waiting = [...poolStudents]
    for (let i = waiting.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[waiting[i], waiting[j]] = [waiting[j], waiting[i]]
    }
    const mid = Math.ceil(waiting.length / 2)
    const place = (tab: SweepDutyTab, people: StudentRow[]) => {
      const folders = next[tab].map((f) => ({ ...f, members: [...f.members] }))
      if (folders.length === 0) return
      people.forEach((row, i) => {
        folders[i % folders.length].members.push(studentKey(row))
      })
      next = { ...next, [tab]: folders }
    }
    place('inner', waiting.slice(0, mid))
    place('outer', waiting.slice(mid))
    onAssign(next)
  }

  function startStudentDrag(key: string, e: DragEvent) {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', key)
    setDragStudent(key)
    setDragTask(null)
    setDragFolder(null)
  }

  function startTaskDrag(title: string, e: DragEvent) {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData(TASK_MIME, title)
    e.dataTransfer.setData('text/plain', `${TASK_PREFIX}${title}`)
    setDragTask(title)
    setDragStudent(null)
    setDragFolder(null)
  }

  function startFolderDrag(folderId: string, e: DragEvent) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(FOLDER_MIME, folderId)
    e.dataTransfer.setData('text/plain', `${FOLDER_PREFIX}${folderId}`)
    setDragFolder(folderId)
    setDragStudent(null)
    setDragTask(null)
  }

  function onPoolDrop(e: DragEvent) {
    e.preventDefault()
    const payload = readPayload(e)
    if (payload?.kind === 'student') returnStudentToPool(payload.value)
    if (payload?.kind === 'folder') moveFolderTo('pool', payload.value)
    endDrag()
  }

  function onDutyDrop(e: DragEvent) {
    e.preventDefault()
    const payload = readPayload(e)
    if (payload?.kind === 'task') addFolderToDuty(payload.value)
    if (payload?.kind === 'folder') moveFolderTo(dutyTab, payload.value)
    endDrag()
  }

  function onFolderDrop(folderId: string, e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const payload = readPayload(e)
    if (payload?.kind === 'student') moveStudentToFolder(payload.value, folderId)
    endDrag()
  }

  function renderStudentCard(key: string) {
    const row = byKey.get(key)
    if (!row) return null
    const lines = studentCardLines(row, mappings, shownFields)
    return (
      <div
        key={key}
        className="booth-drag-card seat-pool-card"
        draggable
        onDragStart={(e) => startStudentDrag(key, e)}
        onDragEnd={endDrag}
      >
        <span className="seat-name-stack">
          {lines.map((line, i) => (
            <span
              key={`${key}-${i}`}
              className={line.isName ? 'seat-name' : 'seat-card-meta'}
              style={line.isName ? { ['--name-scale' as string]: String(line.scale) } : undefined}
            >
              {line.text}
            </span>
          ))}
        </span>
      </div>
    )
  }

  function renderFolder(folder: SweepFolder, home: SweepFolderHome) {
    const dupSet = home === 'pool' ? poolDupIds : home === dutyTab ? dutyDupIds : duplicateFolderIds(assignments[home])
    const isDup = dupSet.has(folder.id)

    return (
      <article
        key={folder.id}
        className={`sweep-folder ${hotTarget === `folder:${folder.id}` ? 'is-hot' : ''} ${isDup ? 'is-dup' : ''}`}
        draggable
        onDragStart={(e) => startFolderDrag(folder.id, e)}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (dragFolder) return
          e.dataTransfer.dropEffect = 'move'
          setHotTarget(`folder:${folder.id}`)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setHotTarget((cur) => (cur === `folder:${folder.id}` ? null : cur))
          }
        }}
        onDrop={(e) => onFolderDrop(folder.id, e)}
      >
        <header className="sweep-folder-head">
          <input
            className="sweep-folder-title"
            value={folder.title}
            onChange={(e) => setFolderTitle(folder.id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            aria-label="資料夾標題"
          />
          {isDup ? <span className="sweep-folder-dup">重複</span> : null}
          <span className="sweep-folder-count">{folder.members.length}</span>
          {home === 'pool' ? (
            <span className="sweep-folder-home">未分區</span>
          ) : (
            <span className="sweep-folder-home">{home === 'inner' ? '內掃' : '外掃'}</span>
          )}
          <button
            type="button"
            className="sweep-folder-del"
            aria-label={`刪除${folder.title}`}
            onClick={() => removeFolder(folder.id)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            ×
          </button>
        </header>
        <div className="sweep-folder-body">
          {folder.members.length === 0 ? (
            <p className="muted">拖入學生</p>
          ) : (
            folder.members.map((key) => renderStudentCard(key))
          )}
        </div>
      </article>
    )
  }

  return (
    <div className="sweep-board">
      <header className="site-header no-print seat-work-head">
        <div className="brand">
          <BrandMark size="sm" onHome={onHome} />
          <div>
            <h1>排掃地大師</h1>
          </div>
        </div>
        <ol className="step-rail" aria-label="進度">
          <li className="is-done">匯入</li>
          <li className="is-done">欄位</li>
          <li className="is-current">排掃地</li>
        </ol>
      </header>

      <div className="sweep-toolbar no-print">
        <p className="muted">
          右側切換「工作模塊」頁籤，拖到左側編輯區建立資料夾；再切回學生頁籤，把人拖進資料夾。標題可改。
        </p>
        <div className="sweep-toolbar-actions">
          <div className="seat-info-hover">
            <button type="button" className="seat-info-trigger">
              新增資訊
            </button>
            <div className="seat-info-pop" role="group" aria-label="顯示資訊">
              {mappings.length === 0 ? (
                <p className="muted">沒有匯入欄位</p>
              ) : (
                mappings.map((m) => (
                  <label key={m.header} className="seat-info-option">
                    <input
                      type="checkbox"
                      checked={shownFields.includes(m.header)}
                      onChange={() => {
                        setShownFields((prev) =>
                          prev.includes(m.header)
                            ? prev.filter((h) => h !== m.header)
                            : [...prev, m.header],
                        )
                      }}
                    />
                    <span>{m.label || m.header}</span>
                  </label>
                ))
              )}
            </div>
          </div>
          <button type="button" className="seat-random-btn" onClick={fillRandom}>
            一鍵隨機
          </button>
          <button
            type="button"
            className="seat-random-btn"
            onClick={() => {
              if (allFolders(assignments).length === 0) return
              setConfirmClear(true)
            }}
          >
            清空
          </button>
          <button type="button" className="btn" onClick={onBack}>
            返回欄位
          </button>
        </div>
      </div>

      <div className="sweep-body">
        <section
          className={`sweep-zone is-duty is-${dutyTab} ${hotTarget === `zone:${dutyTab}` ? 'is-hot' : ''}`}
          aria-label={dutyTab === 'inner' ? '內掃區' : '外掃區'}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = dragTask ? 'copy' : 'move'
            setHotTarget(`zone:${dutyTab}`)
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            setHotTarget(`zone:${dutyTab}`)
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setHotTarget(null)
          }}
          onDrop={onDutyDrop}
        >
          <div className="sweep-tabs" role="tablist" aria-label="掃地區域">
            <button
              type="button"
              role="tab"
              className={`sweep-tab ${dutyTab === 'inner' ? 'is-current' : ''}`}
              aria-selected={dutyTab === 'inner'}
              onClick={() => setDutyTab('inner')}
            >
              內掃區
              <span className="sweep-tab-count">{folderStudentCount(assignments.inner)}</span>
            </button>
            <button
              type="button"
              role="tab"
              className={`sweep-tab ${dutyTab === 'outer' ? 'is-current' : ''}`}
              aria-selected={dutyTab === 'outer'}
              onClick={() => setDutyTab('outer')}
            >
              外掃區
              <span className="sweep-tab-count">{folderStudentCount(assignments.outer)}</span>
            </button>
          </div>

          <div className="sweep-folder-board" role="tabpanel">
            {dutyFolders.length === 0 ? (
              <p className="muted">從右側「工作模塊」拖入此區，建立掃地資料夾</p>
            ) : (
              dutyFolders.map((folder) => renderFolder(folder, dutyTab))
            )}
          </div>
        </section>

        <aside
          className={`sweep-zone is-pool ${hotTarget === 'zone:pool' ? 'is-hot' : ''}`}
          aria-label="卡片區"
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = dragTask ? 'none' : 'move'
            setHotTarget('zone:pool')
          }}
          onDragEnter={(e) => {
            e.preventDefault()
            setHotTarget('zone:pool')
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setHotTarget(null)
          }}
          onDrop={onPoolDrop}
        >
          <div className="sweep-tabs" role="tablist" aria-label="卡片區內容">
            <button
              type="button"
              role="tab"
              className={`sweep-tab ${poolTab === 'students' ? 'is-current' : ''}`}
              aria-selected={poolTab === 'students'}
              onClick={() => setPoolTab('students')}
            >
              學生
              <span className="sweep-tab-count">{poolStudents.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              className={`sweep-tab ${poolTab === 'tasks' ? 'is-current' : ''}`}
              aria-selected={poolTab === 'tasks'}
              onClick={() => setPoolTab('tasks')}
            >
              工作模塊
            </button>
          </div>

          {poolTab === 'tasks' ? (
            <div className="sweep-task-panel" role="tabpanel" aria-label="工作模塊">
              <p className="sweep-task-panel-hint">
                目前對應左側「{dutyTab === 'inner' ? '內掃區' : '外掃區'}」· 拖分類細項到左側建立資料夾
              </p>
              <div className="sweep-task-groups">
                {TASK_GROUPS.map((group) => (
                  <section key={group.id} className="sweep-task-group" aria-label={group.label}>
                    <h3 className="sweep-task-group-title">{group.label}</h3>
                    <div className="sweep-task-panel-list">
                      {group.items.map((item) => {
                        const title = taskTitle(group.label, item)
                        const isDup = hasSameTask(dutyFolders, title)
                        return (
                          <div
                            key={title}
                            className={`sweep-task-chip ${isDup ? 'is-dup' : ''}`}
                            draggable
                            onDragStart={(e) => startTaskDrag(title, e)}
                            onDragEnd={endDrag}
                            title={isDup ? `${title}（已在編輯區）` : title}
                          >
                            {isDup ? `${item}(重複)` : item}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                ))}
                <section className="sweep-task-group" aria-label="自定義">
                  <h3 className="sweep-task-group-title">自定義</h3>
                  <div className="sweep-task-panel-list">
                    {(() => {
                      const title = customTitle.trim() || '自定義'
                      const isDup = hasSameTask(dutyFolders, title)
                      return (
                        <div
                          className={`sweep-task-chip is-custom ${isDup ? 'is-dup' : ''}`}
                          draggable
                          onDragStart={(e) => startTaskDrag(title, e)}
                          onDragEnd={endDrag}
                          title={isDup ? `${title}（已在編輯區）` : '拖到左側建立自訂資料夾'}
                        >
                          {isDup ? `${title}(重複)` : '自定義'}
                        </div>
                      )
                    })()}
                  </div>
                  <div className="sweep-task-custom">
                    <label className="visually-hidden" htmlFor="sweep-custom-title">
                      自訂工作名稱
                    </label>
                    <input
                      id="sweep-custom-title"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      placeholder="輸入自訂名稱"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addCustomFolder()
                        }
                      }}
                    />
                    <button type="button" className="btn ghost" onClick={addCustomFolder}>
                      加入編輯區
                    </button>
                  </div>
                </section>
              </div>
            </div>
          ) : (
            <div className="sweep-pool-panel" role="tabpanel">
              {assignments.pool.length > 0 ? (
                <div className="sweep-pool-folders">
                  {assignments.pool.map((folder) => renderFolder(folder, 'pool'))}
                </div>
              ) : null}
              <div className="sweep-zone-list">
                {poolStudents.length === 0 ? (
                  <p className="muted">
                    {allFolders(assignments).some((f) => f.members.length > 0)
                      ? '學生都已進資料夾。'
                      : '將學生拖進左側資料夾。'}
                  </p>
                ) : (
                  poolStudents.map((row) => renderStudentCard(studentKey(row)))
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {confirmClear ? (
        <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="sweep-clear-title">
          <div className="seat-notice-card">
            <h3 id="sweep-clear-title">清空所有工作資料夾？</h3>
            <p>資料夾會刪除，學生會回到卡片區，此動作無法復原。</p>
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  onAssign({ pool: [], inner: [], outer: [] })
                  setConfirmClear(false)
                }}
              >
                確定清空
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
