import { useEffect, useState, type ReactNode } from 'react'
import { HomeIndex } from './home/HomeIndex'
import { PhonePortraitLock } from './components/PhonePortraitLock'
import type { ToolId } from './home/tools'
import { beginPage, clearWork, isRotateReload, readWork, restoringWork } from './lib/workSession'
import { recordToolUse, recordVisit, readUsageStats, type UsageStats } from './lib/usageStats'
import { AttendanceTool } from './tools/AttendanceTool'
import { PlateNameTool } from './tools/PlateNameTool'
import { SeatingTool } from './tools/SeatingTool'
import { SnapSheetTool } from './tools/SnapSheetTool'
import { BusTool } from './tools/BusTool'
import { RoomTool } from './tools/RoomTool'
import { SweepTool } from './tools/SweepTool'

function withPhoneLock(node: ReactNode) {
  return (
    <>
      <PhonePortraitLock />
      {node}
    </>
  )
}

export default function App() {
  beginPage()
  const [tool, setTool] = useState<ToolId | null>(() => (restoringWork() ? readWork()?.tool ?? null : null))
  const [stats, setStats] = useState<UsageStats>(() => readUsageStats())

  useEffect(() => {
    setStats(recordVisit())
  }, [])

  useEffect(() => {
    if (!tool) return
    let armed = true
    history.pushState({ ttabGuard: true }, '')
    const onPop = () => {
      if (!armed) return
      const ok = window.confirm('確定要離開嗎？離開後目前的內容不會保留。')
      if (ok) {
        armed = false
        history.back()
        return
      }
      history.pushState({ ttabGuard: true }, '')
    }
    const onUnload = (event: BeforeUnloadEvent) => {
      if (isRotateReload()) return
      event.preventDefault()
      event.returnValue = ''
    }
    document.documentElement.classList.add('is-leave-guard')
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onUnload)

    return () => {
      armed = false
      document.documentElement.classList.remove('is-leave-guard')
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onUnload)
    }
  }, [tool])

  function goHome() {
    clearWork()
    setTool(null)
  }

  function openTool(id: ToolId) {
    setStats(recordToolUse(id))
    setTool(id)
  }

  if (!tool) {
    return withPhoneLock(<HomeIndex onOpenTool={openTool} stats={stats} />)
  }

  if (tool === 'plates') {
    return withPhoneLock(<PlateNameTool family="desk" onHome={goHome} />)
  }

  if (tool === 'badges') {
    return withPhoneLock(<PlateNameTool family="badge" onHome={goHome} />)
  }

  if (tool === 'seats') {
    return withPhoneLock(<SeatingTool onHome={goHome} />)
  }

  if (tool === 'attendance') {
    return withPhoneLock(<AttendanceTool onHome={goHome} />)
  }

  if (tool === 'snap-sheet') {
    return withPhoneLock(<SnapSheetTool onHome={goHome} />)
  }

  if (tool === 'sweep') {
    return withPhoneLock(<SweepTool onHome={goHome} />)
  }

  if (tool === 'bus') {
    return withPhoneLock(<BusTool onHome={goHome} />)
  }

  if (tool === 'rooms') {
    return withPhoneLock(<RoomTool onHome={goHome} />)
  }

  return withPhoneLock(<HomeIndex onOpenTool={openTool} stats={stats} />)
}
