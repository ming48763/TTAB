import type { ToolId } from '../home/tools'

const STORAGE_KEY = 'ttab-usage-stats-v1'
const SESSION_VISIT_KEY = 'ttab-visit-counted'

export interface UsageStats {
  visits: number
  uses: number
  byTool: Partial<Record<ToolId, number>>
}

const EMPTY: UsageStats = {
  visits: 0,
  uses: 0,
  byTool: {},
}

function canUseStorage(store: Storage | undefined) {
  return typeof store !== 'undefined'
}

export function readUsageStats(): UsageStats {
  if (!canUseStorage(globalThis.localStorage)) return { ...EMPTY, byTool: {} }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY, byTool: {} }
    const parsed = JSON.parse(raw) as Partial<UsageStats>
    return {
      visits: Math.max(0, Number(parsed.visits) || 0),
      uses: Math.max(0, Number(parsed.uses) || 0),
      byTool: parsed.byTool && typeof parsed.byTool === 'object' ? { ...parsed.byTool } : {},
    }
  } catch {
    return { ...EMPTY, byTool: {} }
  }
}

function writeUsageStats(stats: UsageStats) {
  if (!canUseStorage(globalThis.localStorage)) return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    /* ignore quota / private mode */
  }
}

/** 同一次瀏覽器工作階段只計一次瀏覽 */
export function recordVisit(): UsageStats {
  const stats = readUsageStats()
  if (!canUseStorage(globalThis.sessionStorage)) {
    stats.visits += 1
    writeUsageStats(stats)
    return stats
  }
  try {
    if (sessionStorage.getItem(SESSION_VISIT_KEY)) return stats
    sessionStorage.setItem(SESSION_VISIT_KEY, '1')
  } catch {
    /* continue and count */
  }
  stats.visits += 1
  writeUsageStats(stats)
  return stats
}

export function recordToolUse(toolId: ToolId): UsageStats {
  const stats = readUsageStats()
  stats.uses += 1
  stats.byTool[toolId] = (stats.byTool[toolId] ?? 0) + 1
  writeUsageStats(stats)
  return stats
}

export function formatCount(n: number) {
  return n.toLocaleString('zh-TW')
}
