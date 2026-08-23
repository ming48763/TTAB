import { useState } from 'react'
import { HomeIndex } from './home/HomeIndex'
import type { ToolId } from './home/tools'
import { PlateNameTool } from './tools/PlateNameTool'
import { SeatingTool } from './tools/SeatingTool'

export default function App() {
  const [tool, setTool] = useState<ToolId | null>(null)

  if (!tool) {
    return <HomeIndex onOpenTool={setTool} />
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

  return <HomeIndex onOpenTool={setTool} />
}
