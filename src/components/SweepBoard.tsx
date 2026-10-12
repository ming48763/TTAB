import { useEffect, useRef, useState, type DragEvent } from 'react'
import { BrandMark } from './BrandMark'
import { studentCardLines, studentKey } from '../lib/seating'
import {
  buildSweepPages,
  exportSweepExcel,
  SWEEP_SHEET_SUFFIX,
  sweepFileBase,
  sweepSheetTitle,
} from '../lib/sweepExport'
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

const FLOOR_SPOTS = ['講台', '排數', '前後', '走廊', '閱讀角'] as const
const TRASH_KINDS = ['一般', '回收', '紙類', '塑膠'] as const
const WINDOW_SPOTS = ['左右', '前後', '窗台', '落地窗'] as const
const OTHER_SPOTS = ['整理掃具', '黑板', '櫃子整理', '餐桌整理'] as const
const CLASSROOM_TASKS = ['掃地', '拖地', '倒垃圾', '擦桌子', '窗戶'] as const
const HALL_TASKS = ['掃地', '拖地', '倒垃圾'] as const
const RESTROOM_TASKS = ['男廁', '女廁', '洗手台', '地板', '倒垃圾'] as const
const YARD_TASKS = ['掃地', '倒垃圾', '撿垃圾'] as const
const DUMP_TASKS = ['鑰匙保管', '協助分類'] as const

interface OuterPlace {
  name: string
  tasks: readonly string[]
}

const INDOOR_PLACES: OuterPlace[] = [
  { name: '科任教室', tasks: CLASSROOM_TASKS },
  { name: '辦公室', tasks: CLASSROOM_TASKS },
  { name: '圖書館', tasks: CLASSROOM_TASKS },
  { name: '活動中心', tasks: HALL_TASKS },
  { name: '廁所', tasks: RESTROOM_TASKS },
]

const OUTDOOR_PLACES: OuterPlace[] = [
  { name: '操場', tasks: YARD_TASKS },
  { name: '籃球場', tasks: YARD_TASKS },
  { name: '草皮', tasks: YARD_TASKS },
  { name: '遊樂區', tasks: YARD_TASKS },
  { name: '垃圾場', tasks: DUMP_TASKS },
]

interface TaskGroup {
  id: string
  label: string
  items: readonly string[]
}

const INNER_TASK_GROUPS: TaskGroup[] = [
  { id: 'sweep', label: '掃地', items: FLOOR_SPOTS },
  { id: 'mop', label: '拖地', items: FLOOR_SPOTS },
  { id: 'trash', label: '倒垃圾', items: TRASH_KINDS },
  { id: 'window', label: '窗戶', items: WINDOW_SPOTS },
  { id: 'other', label: '其他', items: OTHER_SPOTS },
]

const UNGROUPED_TITLE = '【未分組】'

function taskTitle(groupLabel: string, item: string) {
  return `${groupLabel}·${item}`
}

const DUP_SUFFIX = /(（重複）|\(重複\))(\d*)$/

function nextGroupRowTitle(group: string, folders: SweepFolder[]) {
  const used = new Set<number>()
  const pattern = new RegExp(`^${group}·第(\\d+)排$`)
  for (const folder of folders) {
    const match = baseTaskTitle(folder.title).match(pattern)
    if (match) used.add(Number(match[1]))
  }
  let n = 1
  while (used.has(n)) n += 1
  return `${group}·第${n}排`
}

function baseTaskTitle(title: string) {
  return title.replace(DUP_SUFFIX, '').trim()
}

const INNER_TONE: Record<string, string> = {
  掃地: 'green',
  拖地: 'red',
  倒垃圾: 'blue',
  窗戶: 'white',
  其他: 'purple',
  自定義: 'purple',
}

const OUTER_PLACE_TONE: Record<string, string> = {
  科任教室: 'green',
  辦公室: 'red',
  圖書館: 'blue',
  活動中心: 'white',
  廁所: 'purple',
}

const OUTDOOR_PLACE_NAMES = new Set(OUTDOOR_PLACES.map((place) => place.name))

function folderTone(title: string, home: SweepFolderHome) {
  if (home === 'pool') return null
  const head = baseTaskTitle(title).split('·')[0]
  if (home === 'inner') return INNER_TONE[head] ?? null
  if (OUTDOOR_PLACE_NAMES.has(head)) return 'brown'
  return OUTER_PLACE_TONE[head] ?? null
}

function droppedTitles(title: string, folders: SweepFolder[]) {
  const base = baseTaskTitle(title)
  const mark = base.lastIndexOf('·')
  if (mark > 0) {
    const group = base.slice(0, mark)
    const item = base.slice(mark + 1)
    if ((group === '掃地' || group === '拖地') && item === '排數') return [nextGroupRowTitle(group, folders)]
    if (item === '前後') return [`${group}·前`, `${group}·後`]
    if (item === '左右') return [`${group}·左`, `${group}·右`]
  }
  return [base]
}

function dropEmptyUngrouped(folders: SweepFolder[]) {
  return folders.filter((folder) => folder.title !== UNGROUPED_TITLE || folder.members.length > 0)
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
  return {
    pool: clean(a.pool),
    inner: dropEmptyUngrouped(clean(a.inner)),
    outer: dropEmptyUngrouped(clean(a.outer)),
  }
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
  const [placeTab, setPlaceTab] = useState<'indoor' | 'outdoor'>('indoor')
  const [indoorPick, setIndoorPick] = useState(INDOOR_PLACES[0].name)
  const [outdoorPick, setOutdoorPick] = useState(OUTDOOR_PLACES[0].name)
  const [confirmClear, setConfirmClear] = useState(false)
  const [needModule, setNeedModule] = useState(false)
  const [randomOpen, setRandomOpen] = useState(false)
  const [innerCount, setInnerCount] = useState('0')
  const [outerCount, setOuterCount] = useState('0')
  const [randomError, setRandomError] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exportPrefix, setExportPrefix] = useState('')
  const [exportBusy, setExportBusy] = useState<'xlsx' | 'pdf' | null>(null)
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const editingTitleRef = useRef<string | null>(null)
  const [pdfJob, setPdfJob] = useState<string | null>(null)
  const pdfHostRef = useRef<HTMLDivElement>(null)
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
  const outerPlaces = placeTab === 'indoor' ? INDOOR_PLACES : OUTDOOR_PLACES
  const outerPlaceName = placeTab === 'indoor' ? indoorPick : outdoorPick
  const outerPlace = outerPlaces.find((place) => place.name === outerPlaceName) ?? outerPlaces[0]
  const exportTitle = sweepSheetTitle(exportPrefix)
  const exportPages = buildSweepPages(assignments, (key) => {
    const row = byKey.get(key)
    if (!row) return ''
    return studentCardLines(row, mappings, shownFields).map((line) => line.text).join(' ')
  })

  useEffect(() => {
    if (!pdfJob) return
    const host = pdfHostRef.current
    if (!host) return
    let cancelled = false
    const run = async () => {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))))
      if (cancelled) return
      try {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
        const sheets = Array.from(host.querySelectorAll<HTMLElement>('.sweep-export-page'))
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        for (let i = 0; i < sheets.length; i += 1) {
          if (cancelled) return
          const canvas = await html2canvas(sheets[i], {
            scale: 2,
            backgroundColor: '#ffffff',
            logging: false,
          })
          const img = canvas.toDataURL('image/jpeg', 0.93)
          if (i > 0) pdf.addPage('a4', 'portrait')
          const pageW = 210
          const pageH = 297
          const imgH = (canvas.height / canvas.width) * pageW
          if (imgH <= pageH) pdf.addImage(img, 'JPEG', 0, 0, pageW, imgH)
          else {
            const fit = pageH / imgH
            pdf.addImage(img, 'JPEG', (pageW - pageW * fit) / 2, 0, pageW * fit, pageH)
          }
        }
        pdf.save(`${sweepFileBase(pdfJob)}.pdf`)
        if (!cancelled) {
          setPdfJob(null)
          setExportBusy(null)
          setExportOpen(false)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setPdfJob(null)
          setExportBusy(null)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [pdfJob])

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
    const titles = droppedTitles(title, allFolders(assignments))
    let duty = assignments[dutyTab]
    for (const raw of titles) {
      const nextTitle = uniqueTaskTitle(duty, raw)
      duty = [...duty, { id: uid('sweep'), title: nextTitle, members: [] }]
    }
    onAssign({
      ...assignments,
      [dutyTab]: duty,
    })
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

  function openRandom() {
    const total = poolStudents.length
    const innerN = Math.ceil(total / 2)
    setInnerCount(String(innerN))
    setOuterCount(String(total - innerN))
    setRandomError('')
    setRandomOpen(true)
  }

  function applyRandom() {
    const innerN = Number(innerCount)
    const outerN = Number(outerCount)
    if (!Number.isInteger(innerN) || !Number.isInteger(outerN) || innerN < 0 || outerN < 0) {
      setRandomError('請填入 0 以上的整數')
      return
    }
    if (innerN + outerN === 0) {
      setRandomError('請至少分配 1 人')
      return
    }
    if (innerN + outerN > poolStudents.length) {
      setRandomError(`未分配只有 ${poolStudents.length} 人`)
      return
    }
    const waiting = [...poolStudents]
    for (let i = waiting.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[waiting[i], waiting[j]] = [waiting[j], waiting[i]]
    }
    const folderFor = (people: StudentRow[]): SweepFolder[] =>
      people.length === 0
        ? []
        : [
            {
              id: uid('sweep'),
              title: UNGROUPED_TITLE,
              members: people.map((row) => studentKey(row)),
            },
          ]
    onAssign({
      ...assignments,
      inner: [...assignments.inner, ...folderFor(waiting.slice(0, innerN))],
      outer: [...assignments.outer, ...folderFor(waiting.slice(innerN, innerN + outerN))],
    })
    setRandomOpen(false)
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

  function beginTitleEdit(folderId: string) {
    editingTitleRef.current = folderId
    setEditingTitleId(folderId)
  }

  function endTitleEdit(folderId: string, next: EventTarget | null) {
    if (next instanceof HTMLElement && next.classList.contains('sweep-folder-title')) return
    if (editingTitleRef.current !== folderId) return
    editingTitleRef.current = null
    setEditingTitleId((cur) => (cur === folderId ? null : cur))
  }

  function startFolderDrag(folderId: string, e: DragEvent) {
    const active = document.activeElement
    if (
      editingTitleRef.current === folderId ||
      (active instanceof HTMLInputElement && e.currentTarget.contains(active))
    ) {
      e.preventDefault()
      return
    }
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
    if (payload?.kind === 'student' && dutyTab === 'inner' && assignments.inner.length === 0) {
      setNeedModule(true)
      endDrag()
      return
    }
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
    const digitsOnly = lines.length > 0 && lines.every((line) => /^\d+$/.test(line.text.replace(/\s/g, '')))
    return (
      <div
        key={key}
        className="booth-drag-card seat-pool-card"
        draggable
        onDragStart={(e) => startStudentDrag(key, e)}
        onDragEnd={endDrag}
      >
        <span className="seat-name-stack">
          {lines.map((line, i) => {
            const asName = line.isName || digitsOnly
            return (
              <span
                key={`${key}-${i}`}
                className={asName ? 'seat-name' : 'seat-card-meta'}
                style={asName ? { ['--name-scale' as string]: String(line.isName ? line.scale : 1) } : undefined}
              >
                {line.text}
              </span>
            )
          })}
        </span>
      </div>
    )
  }

  function renderFolder(folder: SweepFolder, home: SweepFolderHome) {
    const dupSet = home === 'pool' ? poolDupIds : home === dutyTab ? dutyDupIds : duplicateFolderIds(assignments[home])
    const isDup = dupSet.has(folder.id)

    const tone = folderTone(folder.title, home)
    return (
      <article
        key={folder.id}
        className={`sweep-folder ${hotTarget === `folder:${folder.id}` ? 'is-hot' : ''} ${isDup ? 'is-dup' : ''} ${tone ? `is-tone-${tone}` : ''} ${editingTitleId === folder.id ? 'is-editing' : ''}`}
        draggable={editingTitleId !== folder.id}
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
            onPointerDown={(e) => {
              e.stopPropagation()
              beginTitleEdit(folder.id)
            }}
            onFocus={() => beginTitleEdit(folder.id)}
            onBlur={(e) => endTitleEdit(folder.id, e.relatedTarget)}
            onClick={(e) => e.stopPropagation()}
            aria-label="資料夾標題"
          />
          {isDup ? <span className="sweep-folder-dup">重複</span> : null}
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

  async function downloadExcel() {
    if (exportBusy) return
    setExportBusy('xlsx')
    try {
      await exportSweepExcel(exportPages, exportTitle)
      setExportOpen(false)
    } catch (err) {
      console.error(err)
    } finally {
      setExportBusy(null)
    }
  }

  function downloadPdf() {
    if (exportBusy) return
    setExportBusy('pdf')
    setPdfJob(exportTitle)
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
        <div className="sweep-head-actions">
          <button type="button" className="btn" onClick={onBack}>
            返回欄位
          </button>
          <button type="button" className="btn primary" onClick={() => setExportOpen(true)} disabled={exportBusy !== null}>
            匯出
          </button>
        </div>
      </header>

      <div className="sweep-toolbar no-print">
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
          <button type="button" className="seat-random-btn" onClick={openRandom}>
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
            {dutyFolders.map((folder) => renderFolder(folder, dutyTab))}
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
              <div className="sweep-task-groups">
                {dutyTab === 'inner' ? (
                  <>
                    {INNER_TASK_GROUPS.map((group) => (
                      <section key={group.id} className="sweep-task-group" aria-label={group.label}>
                        <h3 className="sweep-task-group-title">{group.label}</h3>
                        <div className="sweep-task-panel-list">
                          {group.items.map((item) => {
                            const title = taskTitle(group.label, item)
                            return (
                              <div
                                key={title}
                                className="sweep-task-chip"
                                draggable
                                onDragStart={(e) => startTaskDrag(title, e)}
                                onDragEnd={endDrag}
                                title={title}
                              >
                                {item}
                              </div>
                            )
                          })}
                        </div>
                      </section>
                    ))}
                    <section className="sweep-task-group" aria-label="自定義">
                      <h3 className="sweep-task-group-title">自定義</h3>
                      <div className="sweep-task-panel-list">
                        <div
                          className="sweep-task-chip is-custom"
                          draggable
                          onDragStart={(e) => startTaskDrag('自定義', e)}
                          onDragEnd={endDrag}
                          title="拖到左側建立自訂資料夾"
                        >
                          自定義
                        </div>
                      </div>
                    </section>
                  </>
                ) : (
                  <section className="sweep-task-group sweep-outer-tasks" aria-label="外掃工作模塊">
                    <div className="sweep-place-tabs" role="tablist" aria-label="室內或室外">
                      <button
                        type="button"
                        role="tab"
                        className={`sweep-place-tab ${placeTab === 'indoor' ? 'is-current' : ''}`}
                        aria-selected={placeTab === 'indoor'}
                        onClick={() => setPlaceTab('indoor')}
                      >
                        室內
                      </button>
                      <button
                        type="button"
                        role="tab"
                        className={`sweep-place-tab ${placeTab === 'outdoor' ? 'is-current' : ''}`}
                        aria-selected={placeTab === 'outdoor'}
                        onClick={() => setPlaceTab('outdoor')}
                      >
                        室外
                      </button>
                    </div>
                    <label className="visually-hidden" htmlFor="sweep-place-select">
                      場域
                    </label>
                    <select
                      id="sweep-place-select"
                      className="sweep-place-select"
                      value={outerPlace.name}
                      onChange={(e) => {
                        if (placeTab === 'indoor') setIndoorPick(e.target.value)
                        else setOutdoorPick(e.target.value)
                      }}
                    >
                      {outerPlaces.map((place) => (
                        <option key={place.name} value={place.name}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                    <div className="sweep-task-panel-list">
                      {outerPlace.tasks.map((item) => {
                        const title = taskTitle(outerPlace.name, item)
                        return (
                          <div
                            key={title}
                            className="sweep-task-chip"
                            draggable
                            onDragStart={(e) => startTaskDrag(title, e)}
                            onDragEnd={endDrag}
                            title={title}
                          >
                            {item}
                          </div>
                        )
                      })}
                      <div
                        className="sweep-task-chip is-custom"
                        draggable
                        onDragStart={(e) => startTaskDrag('自定義', e)}
                        onDragEnd={endDrag}
                        title="拖到左側建立自訂資料夾"
                      >
                        自定義
                      </div>
                    </div>
                  </section>
                )}
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

      {randomOpen ? (
        <div className="seat-notice" role="dialog" aria-modal="true" aria-labelledby="sweep-random-title">
          <div className="seat-notice-card">
            <h3 id="sweep-random-title">一鍵隨機</h3>
            <p className="sweep-random-note">未分配 {poolStudents.length} 人。填入內掃、外掃的人數後，會隨機放進掃地區。</p>
            <div className="sweep-random-fields">
              <label>
                內掃人數
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={innerCount}
                  onChange={(e) => setInnerCount(e.target.value)}
                />
              </label>
              <label>
                外掃人數
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={outerCount}
                  onChange={(e) => setOuterCount(e.target.value)}
                />
              </label>
            </div>
            {randomError ? <p className="sweep-random-error">{randomError}</p> : null}
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setRandomOpen(false)}>
                取消
              </button>
              <button type="button" className="btn primary" onClick={applyRandom}>
                開始分配
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {needModule ? (
        <div className="seat-notice" role="alertdialog" aria-modal="true" aria-labelledby="sweep-module-title">
          <div className="seat-notice-card">
            <h3 id="sweep-module-title">請先新增工作模塊</h3>
            <div className="seat-notice-actions">
              <button type="button" className="btn primary" onClick={() => setNeedModule(false)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}

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

      {exportOpen ? (
        <div className="seat-notice" role="dialog" aria-modal="true" aria-labelledby="sweep-export-title">
          <div className="seat-notice-card sweep-export-card">
            <h3 id="sweep-export-title">匯出掃地工作表</h3>
            <label className="sweep-export-field">
              標題
              <span className="sweep-export-name">
                <input
                  value={exportPrefix}
                  onChange={(e) => setExportPrefix(e.target.value)}
                  placeholder="例如四年三班"
                  aria-label="標題前綴"
                />
                <span>{SWEEP_SHEET_SUFFIX}</span>
              </span>
            </label>
            <p className="sweep-export-preview">{exportTitle}</p>
            <div className="seat-notice-actions">
              <button type="button" className="btn" onClick={() => setExportOpen(false)} disabled={exportBusy !== null}>
                取消
              </button>
              <button type="button" className="btn" onClick={() => void downloadExcel()} disabled={exportBusy !== null}>
                {exportBusy === 'xlsx' ? '匯出中…' : 'Excel'}
              </button>
              <button type="button" className="btn primary" onClick={downloadPdf} disabled={exportBusy !== null}>
                {exportBusy === 'pdf' ? '匯出中…' : 'PDF'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div ref={pdfHostRef} className="sweep-export-host" aria-hidden="true">
        {pdfJob
          ? exportPages.map((page) => (
              <section key={page.id} className="sweep-export-page">
                <h1>{pdfJob}</h1>
                <h2>{page.heading}</h2>
                <table>
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col style={{ width: '40%' }} />
                    <col style={{ width: '40%' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{page.groupLabel}</th>
                      <th>工作</th>
                      <th>學生</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.length === 0 ? (
                      <tr>
                        <td colSpan={3}>尚未安排</td>
                      </tr>
                    ) : (
                      page.rows.map((row, index) => (
                        <tr key={`${page.id}-${index}`}>
                          {row.groupRowSpan > 0 ? <td rowSpan={row.groupRowSpan}>{row.group}</td> : null}
                          {row.taskRowSpan > 0 ? <td rowSpan={row.taskRowSpan}>{row.task}</td> : null}
                          <td>{row.name}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            ))
          : null}
      </div>
    </div>
  )
}
