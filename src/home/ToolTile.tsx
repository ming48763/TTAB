import type { ToolTileData } from './tools'

interface Props {
  tool: ToolTileData
  onOpen?: () => void
}

function Hint({ hint }: { hint: string }) {
  const mark = Math.max(hint.lastIndexOf('，'), hint.lastIndexOf(','))
  const last = mark > 0 ? hint.slice(mark + 1).trim() : ''
  if (!last) return <span>{hint}</span>
  return (
    <span>
      {hint.slice(0, mark + 1)}
      <span className="tool-hint-last">{last}</span>
    </span>
  )
}

export function ToolTile({ tool, onOpen }: Props) {
  if (tool.enabled) {
    return (
      <button type="button" className="tool-tile is-ready" onClick={onOpen}>
        <strong>{tool.title}</strong>
        <Hint hint={tool.hint} />
      </button>
    )
  }
  return (
    <div className="tool-tile is-soon" aria-disabled="true">
      <strong>{tool.title}</strong>
      <Hint hint={tool.hint} />
    </div>
  )
}
