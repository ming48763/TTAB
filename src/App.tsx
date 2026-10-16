import { useEffect, useState } from 'react'
import { HomeIndex } from './home/HomeIndex'
import type { ToolId } from './home/tools'
import { recordToolUse, recordVisit, readUsageStats, type UsageStats } from './lib/usageStats'
import { AttendanceTool } from './tools/AttendanceTool'
import { PlateNameTool } from './tools/PlateNameTool'
import { SeatingTool } from './tools/SeatingTool'
import { SnapSheetTool } from './tools/SnapSheetTool'
import { BusTool } from './tools/BusTool'
import { RoomTool } from './tools/RoomTool'
import { SweepTool } from './tools/SweepTool'

export default function App() {
  const [tool, setTool] = useState<ToolId | null>(null)
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
      event.preventDefault()
      event.returnValue = ''
    }
    document.documentElement.classList.add('is-leave-guard')
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onUnload)

    const compact = window.matchMedia('(max-width: 899px)')
    let startX = 0
    let startY = 0
    let tracking = false
    let asked = false
    const skipSelector = '[draggable="true"], input, textarea, select, .booth-range, .preview-range'
    const atScrollTop = (start: EventTarget | null) => {
      if (!(start instanceof Element) || start.closest(skipSelector)) return false
      let el: Element | null = start
      while (el) {
        if (el instanceof HTMLElement) {
          const overflowY = getComputedStyle(el).overflowY
          if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 1) {
            return false
          }
        }
        el = el.parentElement
      }
      const scroller = document.scrollingElement
      return !scroller || scroller.scrollTop <= 1
    }
    const onTouchStart = (event: TouchEvent) => {
      if (!compact.matches || event.touches.length !== 1) {
        tracking = false
        return
      }
      asked = false
      startX = event.touches[0].clientX
      startY = event.touches[0].clientY
      tracking = atScrollTop(event.target)
    }
    const onTouchMove = (event: TouchEvent) => {
      if (!tracking || asked || event.touches.length !== 1) return
      const dx = event.touches[0].clientX - startX
      const dy = event.touches[0].clientY - startY
      if (dy < 72 || Math.abs(dx) > dy) return
      if (!atScrollTop(event.target)) {
        tracking = false
        return
      }
      asked = true
      tracking = false
      const ok = window.confirm('確定要重新整理嗎？重新整理後目前的內容不會保留。')
      if (ok) location.reload()
    }
    const onTouchEnd = () => {
      tracking = false
    }
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: true })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)

    return () => {
      armed = false
      document.documentElement.classList.remove('is-leave-guard')
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onUnload)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [tool])

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

  if (tool === 'sweep') {
    return <SweepTool onHome={() => setTool(null)} />
  }

  if (tool === 'bus') {
    return <BusTool onHome={() => setTool(null)} />
  }

  if (tool === 'rooms') {
    return <RoomTool onHome={() => setTool(null)} />
  }

  return <HomeIndex onOpenTool={openTool} stats={stats} />
}
