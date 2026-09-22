import type { ToolTileData } from './tools'

interface Props {
  tool: ToolTileData
  onOpen?: () => void
}

export function ToolTile({ tool, onOpen }: Props) {
  if (tool.enabled) {
    return (
      <button type="button" className="tool-tile is-ready" onClick={onOpen}>
        <strong>{tool.title}</strong>
        <span>{tool.hint}</span>
      </button>
    )
  }
  return (
    <div className="tool-tile is-soon" aria-disabled="true">
      <strong>{tool.title}</strong>
      <span>{tool.hint}</span>
    </div>
  )
}
