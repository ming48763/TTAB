import { useEffect, useState } from 'react'
import { HomeIndex } from './home/HomeIndex'
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
    return <HomeIndex onOpenTool={openTool} stats={stats} />
  }

  if (tool === 'plates') {
    return <PlateNameTool family="desk" onHome={goHome} />
  }

  if (tool === 'badges') {
    return <PlateNameTool family="badge" onHome={goHome} />
  }

  if (tool === 'seats') {
    return <SeatingTool onHome={goHome} />
  }

  if (tool === 'attendance') {
    return <AttendanceTool onHome={goHome} />
  }

  if (tool === 'snap-sheet') {
    return <SnapSheetTool onHome={goHome} />
  }

  if (tool === 'sweep') {
    return <SweepTool onHome={goHome} />
  }

  if (tool === 'bus') {
    return <BusTool onHome={goHome} />
  }

  if (tool === 'rooms') {
    return <RoomTool onHome={goHome} />
  }

  return <HomeIndex onOpenTool={openTool} stats={stats} />
}
