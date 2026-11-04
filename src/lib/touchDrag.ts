/** Touch-drag for cards on phone and tablet, including tablet landscape (that layout follows the desktop stylesheet). */
const HOLD_MS = 100
const COMPACT = '(max-width: 899px)'
const CARD_SELECTOR = [
  '.booth-drag-card[draggable="true"]',
  '.seat-chip[draggable="true"]',
  '.bus-seat-name[draggable="true"]',
  '.sweep-folder[draggable="true"]',
  '.sweep-task-chip[draggable="true"]',
  '.att-card[draggable="true"]',
  '.att-brick[draggable="true"]',
  '.att-pack[draggable="true"]',
].join(', ')

type Session = {
  pointerId: number
  card: HTMLElement
  x: number
  y: number
  timer: number
  dragging: boolean
  dataTransfer: DataTransfer | null
  over: Element | null
  ghost: HTMLElement | null
}

let session: Session | null = null
let swallowClick = 0
let installed = false

function isCompact() {
  return window.matchMedia(COMPACT).matches
}

function cardFrom(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  if (target.closest('input, textarea, select, a, .sweep-folder-title')) return null
  const card = target.closest(CARD_SELECTOR)
  if (!(card instanceof HTMLElement)) return null
  /* Same as seat-pool cards: the card itself may be a <button> (att-card / brick / pack).
     Only ignore nested buttons that are not the drag source. */
  const nestedBtn = target.closest('button')
  if (nestedBtn && nestedBtn !== card) return null
  return card
}

/** Nearest ancestor that actually scrolls. */
function scrollParentOf(el: Element): HTMLElement | null {
  let node: Element | null = el
  while (node) {
    if (node instanceof HTMLElement) {
      const { overflowY, overflowX } = getComputedStyle(node)
      const canY = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1
      const canX = (overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1
      if (canY || canX) return node
    }
    node = node.parentElement
  }
  return null
}

/**
 * Overlay scrollbars sit on top of cards; touches there still hit the card.
 * Reserve the gutter (or a thick strip) so the finger can scroll instead of drag.
 */
function pointerOnScrollbar(scroll: HTMLElement, x: number, y: number) {
  const rect = scroll.getBoundingClientRect()
  const canY = scroll.scrollHeight > scroll.clientHeight + 1
  const canX = scroll.scrollWidth > scroll.clientWidth + 1
  const gutterY = Math.max(scroll.offsetWidth - scroll.clientWidth, 0)
  const gutterX = Math.max(scroll.offsetHeight - scroll.clientHeight, 0)
  const reserveY = Math.max(gutterY, 24)
  const reserveX = Math.max(gutterX, 24)
  if (canY && x >= rect.right - reserveY && x <= rect.right + 1) return true
  if (canX && y >= rect.bottom - reserveX && y <= rect.bottom + 1) return true
  return false
}

function makeDragEvent(type: string, dataTransfer: DataTransfer, x: number, y: number, related: EventTarget | null) {
  const event = new DragEvent(type, {
    bubbles: true,
    cancelable: true,
    dataTransfer,
    clientX: x,
    clientY: y,
    relatedTarget: related instanceof Node ? related : null,
  })
  if (event.dataTransfer !== dataTransfer) {
    try {
      Object.defineProperty(event, 'dataTransfer', { configurable: true, value: dataTransfer })
    } catch {
      /* keep the browser's dataTransfer */
    }
  }
  return event
}

function dispatchDrag(type: string, target: EventTarget, dataTransfer: DataTransfer, related: EventTarget | null) {
  const point = session
  const event = makeDragEvent(type, dataTransfer, point?.x ?? 0, point?.y ?? 0, related)
  target.dispatchEvent(event)
  return event
}

function elementAt(x: number, y: number, ghost: HTMLElement | null) {
  if (ghost) ghost.hidden = true
  const hit = document.elementFromPoint(x, y)
  if (ghost) ghost.hidden = false
  return hit
}

/** Product of CSS `zoom` on ancestors (tablet landscape boards use 0.65). */
function cssZoomOf(el: HTMLElement) {
  let zoom = 1
  let node: HTMLElement | null = el
  while (node && node !== document.documentElement) {
    const raw = getComputedStyle(node).zoom
    if (raw && raw !== 'normal') {
      const next = Number.parseFloat(raw)
      if (Number.isFinite(next) && next > 0) zoom *= next
    }
    node = node.parentElement
  }
  return zoom
}

/**
 * Ghost leaves its container (`cqi` / zoom). Freeze text to the on-screen size:
 * computed CSS px × ancestor zoom, matching getBoundingClientRect box (no CSS zoom on ghost —
 * zoom scales from the top-left and pulls the card off the finger).
 */
function stampTextMetrics(source: HTMLElement, clone: HTMLElement, scale: number) {
  const from = [source, ...source.querySelectorAll<HTMLElement>('*')]
  const to = [clone, ...clone.querySelectorAll<HTMLElement>('*')]
  const count = Math.min(from.length, to.length)
  for (let i = 0; i < count; i += 1) {
    const style = getComputedStyle(from[i])
    const fontPx = Number.parseFloat(style.fontSize)
    if (Number.isFinite(fontPx)) to[i].style.fontSize = `${fontPx * scale}px`
    if (style.lineHeight.endsWith('px')) {
      const linePx = Number.parseFloat(style.lineHeight)
      if (Number.isFinite(linePx)) to[i].style.lineHeight = `${linePx * scale}px`
    } else {
      to[i].style.lineHeight = style.lineHeight
    }
    to[i].style.letterSpacing = style.letterSpacing
    to[i].style.fontWeight = style.fontWeight
  }
}

function makeGhost(card: HTMLElement, x: number, y: number) {
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.remove('is-touch-dragging')
  ghost.classList.add('touch-drag-ghost')
  ghost.removeAttribute('draggable')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
  const zoom = cssZoomOf(card)
  const rect = card.getBoundingClientRect()
  stampTextMetrics(card, ghost, zoom)
  ghost.style.position = 'fixed'
  ghost.style.left = `${x}px`
  ghost.style.top = `${y}px`
  ghost.style.boxSizing = 'border-box'
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  ghost.style.margin = '0'
  ghost.style.overflow = 'hidden'
  ghost.style.pointerEvents = 'none'
  ghost.style.zIndex = '90'
  ghost.style.transform = 'translate(-50%, calc(-100% - 12px))'
  return ghost
}

function clearSession(releaseId?: number) {
  if (!session) return
  const current = session
  session = null
  window.clearTimeout(current.timer)
  current.ghost?.remove()
  current.card.classList.remove('is-touch-dragging')
  document.documentElement.classList.remove('is-touch-drag')
  if (releaseId !== undefined) {
    try {
      if (current.card.hasPointerCapture(releaseId)) current.card.releasePointerCapture(releaseId)
    } catch {
      /* pointer already released */
    }
  }
}

function beginDrag() {
  const current = session
  if (!current || current.dragging) return
  const dataTransfer = new DataTransfer()
  let start: DragEvent
  try {
    start = dispatchDrag('dragstart', current.card, dataTransfer, null)
  } catch {
    clearSession(current.pointerId)
    return
  }
  if (start.defaultPrevented) {
    clearSession(current.pointerId)
    return
  }
  current.dataTransfer = start.dataTransfer ?? dataTransfer
  current.dragging = true
  current.card.classList.add('is-touch-dragging')
  document.documentElement.classList.add('is-touch-drag')
  current.ghost = makeGhost(current.card, current.x, current.y)
  document.body.appendChild(current.ghost)
  moveOver(current)
}

function moveOver(current: Session) {
  if (!current.dragging || !current.dataTransfer) return
  if (current.ghost) {
    current.ghost.style.left = `${current.x}px`
    current.ghost.style.top = `${current.y}px`
  }
  const hit = elementAt(current.x, current.y, current.ghost)
  if (hit !== current.over) {
    const previous = current.over
    current.over = hit
    if (previous) dispatchDrag('dragleave', previous, current.dataTransfer, hit)
    if (hit) dispatchDrag('dragenter', hit, current.dataTransfer, previous)
  }
  if (hit) dispatchDrag('dragover', hit, current.dataTransfer, null)
}

function onPointerDown(event: PointerEvent) {
  if (!isCompact()) return
  if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return
  if (!event.isPrimary || session) return
  const card = cardFrom(event.target)
  if (!card) return
  const scroll = scrollParentOf(card)
  if (scroll && pointerOnScrollbar(scroll, event.clientX, event.clientY)) return
  session = {
    pointerId: event.pointerId,
    card,
    x: event.clientX,
    y: event.clientY,
    timer: window.setTimeout(beginDrag, HOLD_MS),
    dragging: false,
    dataTransfer: null,
    over: null,
    ghost: null,
  }
  try {
    card.setPointerCapture(event.pointerId)
  } catch {
    /* capture is optional; document listeners still follow the pointer */
  }
}

function onPointerMove(event: PointerEvent) {
  if (!session || event.pointerId !== session.pointerId) return
  session.x = event.clientX
  session.y = event.clientY
  if (session.dragging) moveOver(session)
}

function finishPointer(event: PointerEvent, drop: boolean) {
  if (!session || event.pointerId !== session.pointerId) return
  const current = session
  window.clearTimeout(current.timer)
  if (!current.dragging || !current.dataTransfer) {
    clearSession(event.pointerId)
    return
  }
  current.x = event.clientX
  current.y = event.clientY
  const hit = elementAt(current.x, current.y, current.ghost)
  swallowClick += 1
  const token = swallowClick
  window.setTimeout(() => {
    if (swallowClick === token) swallowClick = 0
  }, 400)
  if (drop && hit) {
    try {
      dispatchDrag('drop', hit, current.dataTransfer, null)
    } catch {
      /* drop handlers own their errors; still end the gesture */
    }
  }
  try {
    dispatchDrag('dragend', current.card, current.dataTransfer, null)
  } catch {
    /* dragend clears highlight; ignore handler failures */
  }
  clearSession(event.pointerId)
}

function onPointerUp(event: PointerEvent) {
  finishPointer(event, true)
}

function onPointerCancel(event: PointerEvent) {
  finishPointer(event, false)
}

function onContextMenu(event: Event) {
  if (!isCompact()) return
  if (session?.dragging || cardFrom(event.target)) event.preventDefault()
}

function onSelectStart(event: Event) {
  if (!isCompact()) return
  if (session?.dragging || cardFrom(event.target)) event.preventDefault()
}

function onClick(event: Event) {
  if (swallowClick === 0) return
  swallowClick = 0
  event.preventDefault()
  event.stopPropagation()
}

function onTouchMove(event: TouchEvent) {
  if (session?.dragging) event.preventDefault()
}

export function installTouchDrag() {
  if (installed || typeof document === 'undefined') return
  installed = true
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointermove', onPointerMove, true)
  document.addEventListener('pointerup', onPointerUp, true)
  document.addEventListener('pointercancel', onPointerCancel, true)
  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('selectstart', onSelectStart, true)
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
}
