import { useEffect } from 'react'
import type { ToolId } from '../home/tools'

const WORK_KEY = 'ttab-work'
const ROTATE_KEY = 'ttab-rotating'

const TOOLS: ToolId[] = ['plates', 'badges', 'seats', 'attendance', 'snap-sheet', 'sweep', 'bus', 'rooms']

type WorkFile = { tool: ToolId; data: unknown }

let started = false
let pageRestore = false

/** 這次載入是不是旋轉造成的重新整理。只判斷一次。 */
export function beginPage() {
  if (started) return pageRestore
  started = true
  try {
    pageRestore = sessionStorage.getItem(ROTATE_KEY) === '1'
    sessionStorage.removeItem(ROTATE_KEY)
  } catch {
    pageRestore = false
  }
  return pageRestore
}

export function restoringWork() {
  return pageRestore
}

/** 旋轉重載進行中。離開提示要略過。 */
export function isRotateReload() {
  try {
    return sessionStorage.getItem(ROTATE_KEY) === '1'
  } catch {
    return false
  }
}

export function markRotateReload() {
  try {
    sessionStorage.setItem(ROTATE_KEY, '1')
  } catch {
    /* 沒有暫存時仍允許旋轉重載 */
  }
}

function stripLarge(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 50000 ? '' : value
  if (Array.isArray(value)) return value.map(stripLarge)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = stripLarge(item)
    return out
  }
  return value
}

export function saveWork(tool: ToolId, data: unknown) {
  const file: WorkFile = { tool, data }
  try {
    sessionStorage.setItem(WORK_KEY, JSON.stringify(file))
  } catch {
    try {
      sessionStorage.setItem(WORK_KEY, JSON.stringify({ tool, data: stripLarge(data) }))
    } catch {
      /* 容量不足時至少不要擋住旋轉 */
    }
  }
}

export function readWork(): WorkFile | null {
  try {
    const raw = sessionStorage.getItem(WORK_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { tool?: string; data?: unknown }
    if (!parsed?.tool || !TOOLS.includes(parsed.tool as ToolId)) return null
    return { tool: parsed.tool as ToolId, data: parsed.data }
  } catch {
    return null
  }
}

export function savedData<T>(tool: ToolId): T | null {
  if (!restoringWork()) return null
  const saved = readWork()
  if (!saved || saved.tool !== tool) return null
  return saved.data as T
}

export function clearWork() {
  try {
    sessionStorage.removeItem(WORK_KEY)
  } catch {
    /* ignore */
  }
}

/** 工具狀態一變就寫進這次分頁的暫存，旋轉重載後可以接回。 */
export function usePersistWork(tool: ToolId, data: unknown) {
  useEffect(() => {
    saveWork(tool, data)
  }, [tool, data])
}
