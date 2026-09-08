import { useEffect, useState } from 'react'
import { HomeIndex } from './home/HomeIndex'
import type { ToolId } from './home/tools'
import { recordToolUse, recordVisit, readUsageStats, type UsageStats } from './lib/usageStats'
import { AttendanceTool } from './tools/AttendanceTool'
import { PlateNameTool } from './tools/PlateNameTool'
import { SeatingTool } from './tools/SeatingTool'
import { SnapSheetTool } from './tools/SnapSheetTool'

export default function App() {
  const [tool, setTool] = useState<ToolId | null>(null)
  const [stats, setStats] = useState<UsageStats>(() => readUsageStats())

  useEffect(() => {
    setStats(recordVisit())
  }, [])

  function openTool(id: ToolId) {
    setStats(recordToolUse(id))
    setTool(id)
  }

  if (!tool) {
    return <HomeIndex onOpenTool={openTool} stats={stats} />
  }

  if (tool === 'plates') {
    return <PlateNameTool family="desk" onHome={() => setTool(null)} />
  }

  if (tool === 'badges') {
    return <PlateNameTool family="badge" onHome={() => setTool(null)} />
  }

  if (tool === 'seats') {
    return <SeatingTool onHome={() => setTool(null)} />
  }

  if (tool === 'attendance') {
    return <AttendanceTool onHome={() => setTool(null)} />
  }

  if (tool === 'snap-sheet') {
    return <SnapSheetTool onHome={() => setTool(null)} />
  }

  return <HomeIndex onOpenTool={openTool} stats={stats} />
}
