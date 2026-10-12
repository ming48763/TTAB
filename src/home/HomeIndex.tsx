import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '../components/BrandMark'
import { formatCount, type UsageStats } from '../lib/usageStats'
import { HOME_TOOLS, type ToolId } from './tools'
import { ToolTile } from './ToolTile'

interface Props {
  onOpenTool: (id: ToolId) => void
  stats: UsageStats
}

export function HomeIndex({ onOpenTool, stats }: Props) {
  const headerRef = useRef<HTMLElement>(null)
  const [line, setLine] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/home-line')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { line?: string } | null) => {
        if (!cancelled && data?.line) setLine(data.line)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const header = headerRef.current
    if (!header) return
    let frame = 0
    const fadeDistance = 96
    const update = () => {
      frame = 0
      const opacity = Math.max(0, Math.min(1, 1 - window.scrollY / fadeDistance))
      header.style.opacity = String(opacity)
      header.style.pointerEvents = opacity < 0.04 ? 'none' : ''
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div className="app step-home">
      <header ref={headerRef} className="site-header home-header no-print">
        <div className="brand">
          <BrandMark />
          <div>
            <h1>Teacher, Take A Break!</h1>
            {line ? <p>{line}</p> : null}
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
      <footer className="home-stats no-print" aria-label="使用統計">
        <span>瀏覽 {formatCount(stats.visits)} 人次</span>
        <span className="home-stats-sep" aria-hidden>
          ·
        </span>
        <span>功能使用 {formatCount(stats.uses)} 次</span>
      </footer>
    </div>
  )
}
