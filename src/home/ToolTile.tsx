import type { ToolTileData } from './tools'
import { ToolPeek } from './ToolPeek'

interface Props {
  tool: ToolTileData
  onOpen?: () => void
}

export function ToolTile({ tool, onOpen }: Props) {
  const peekKind = tool.toolId === 'plates' ? 'plates' : tool.toolId === 'seats' ? 'seats' : null

  if (tool.enabled) {
    return (
      <div className="tool-peek-host">
        <button type="button" className="tool-tile is-ready" onClick={onOpen}>
          <strong>{tool.title}</strong>
          <span>{tool.hint}</span>
        </button>
        {peekKind ? <ToolPeek kind={peekKind} /> : null}
      </div>
    )
  }
  return (
    <div className="tool-tile is-soon" aria-disabled="true">
      <strong>{tool.title}</strong>
      <span>{tool.hint}</span>
    </div>
  )
}
