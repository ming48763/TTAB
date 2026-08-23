import { BrandMark } from '../components/BrandMark'
import { HOME_TOOLS, type ToolId } from './tools'
import { ToolTile } from './ToolTile'

interface Props {
  onOpenTool: (id: ToolId) => void
}

export function HomeIndex({ onOpenTool }: Props) {
  return (
    <div className="app step-home">
      <header className="site-header home-header no-print">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Teacher, Take A Break!</h1>
            <p>給自己多一點休息的時間</p>
          </div>
        </div>
      </header>
      <main className="site-main">
        <div className="tool-grid" role="list">
          {[...HOME_TOOLS]
            .sort((a, b) => Number(b.enabled) - Number(a.enabled))
            .map((tool) => (
            <div key={tool.id} role="listitem">
              <ToolTile
                tool={tool}
                onOpen={tool.toolId ? () => onOpenTool(tool.toolId!) : undefined}
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
