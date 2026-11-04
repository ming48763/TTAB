import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { detectDeviceKind, TABLET_LANDSCAPE } from '../lib/screenLayout'

const POOL_SCROLL_MIN_THUMB = 28
/** Thumb drag / wheel: smaller mapping → same finger move scrolls farther. */
const POOL_SCROLL_GAIN = 2

function matchesTabletLandscape() {
  return detectDeviceKind() === '平板端' && window.matchMedia(TABLET_LANDSCAPE).matches
}

function useTabletLandscape() {
  const [active, setActive] = useState(false)
  useEffect(() => {
    const media = window.matchMedia(TABLET_LANDSCAPE)
    const sync = () => setActive(matchesTabletLandscape())
    sync()
    media.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    return () => {
      media.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])
  return active
}

/** Always-visible scrollbar: 5px visual, 10px hit area — native overlay bars hide after scroll. */
export function PoolScroller({
  children,
  revision = 0,
  bodyClassName = 'sweep-zone-list',
  when,
  hideRailWhenFit = false,
}: {
  children: ReactNode
  revision?: number
  bodyClassName?: string
  /** Only use the custom rail in this context; otherwise render a plain body. */
  when?: 'tablet-landscape'
  /** Hide the rail when content fits (no scrollbar needed). */
  hideRailWhenFit?: boolean
}) {
  const tabletLandscape = useTabletLandscape()
  const enabled = when === 'tablet-landscape' ? tabletLandscape : true
  const listRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ startY: number; startScroll: number } | null>(null)
  const [thumb, setThumb] = useState({ top: 0, height: POOL_SCROLL_MIN_THUMB })
  const [overflows, setOverflows] = useState(false)

  const sync = useCallback(() => {
    const el = listRef.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const canScroll = scrollHeight > clientHeight + 1
    setOverflows(canScroll)
    if (!canScroll) {
      setThumb({ top: 0, height: Math.max(POOL_SCROLL_MIN_THUMB, clientHeight) })
      return
    }
    const height = Math.max(POOL_SCROLL_MIN_THUMB, (clientHeight / scrollHeight) * clientHeight)
    const maxTop = Math.max(0, clientHeight - height)
    const top = maxTop === 0 ? 0 : (scrollTop / (scrollHeight - clientHeight)) * maxTop
    setThumb({ top, height })
  }, [])

  useLayoutEffect(() => {
    if (!enabled) return
    const el = listRef.current
    if (!el) return
    sync()
    el.addEventListener('scroll', sync, { passive: true })
    const onWheel = (event: WheelEvent) => {
      if (el.scrollHeight <= el.clientHeight + 1) return
      event.preventDefault()
      el.scrollTop += event.deltaY * POOL_SCROLL_GAIN
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', sync)
      el.removeEventListener('wheel', onWheel)
      observer.disconnect()
    }
  }, [sync, revision, enabled])

  function onRailPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const el = listRef.current
    const rail = railRef.current
    if (!el || !rail) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = rail.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (y < thumb.top || y > thumb.top + thumb.height) {
      const ratio = Math.min(1, Math.max(0, y / rect.height))
      el.scrollTop = ratio * (el.scrollHeight - el.clientHeight)
      sync()
    }
    dragRef.current = { startY: event.clientY, startScroll: el.scrollTop }
  }

  function onRailPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const el = listRef.current
    const rail = railRef.current
    const drag = dragRef.current
    if (!el || !rail || !drag) return
    const maxScroll = el.scrollHeight - el.clientHeight
    const thumbTravel = rail.clientHeight - thumb.height
    if (maxScroll <= 0 || thumbTravel <= 0) return
    el.scrollTop =
      drag.startScroll + ((event.clientY - drag.startY) / thumbTravel) * maxScroll * POOL_SCROLL_GAIN
  }

  function onRailPointerUp() {
    dragRef.current = null
  }

  if (!enabled) {
    return <div className={bodyClassName}>{children}</div>
  }

  const hideRail = hideRailWhenFit && !overflows

  return (
    <div className={`pool-scroller${hideRail ? ' is-fit' : ''}`}>
      <div className={bodyClassName} ref={listRef}>
        {children}
      </div>
      {!hideRail ? (
        <div
          className="pool-scroll-rail"
          ref={railRef}
          aria-hidden="true"
          onPointerDown={onRailPointerDown}
          onPointerMove={onRailPointerMove}
          onPointerUp={onRailPointerUp}
          onPointerCancel={onRailPointerUp}
        >
          <div
            className="pool-scroll-thumb"
            style={{ height: `${thumb.height}px`, transform: `translateY(${thumb.top}px)` }}
          />
        </div>
      ) : null}
    </div>
  )
}
