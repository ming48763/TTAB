/** Long-press drag for touch on compact screens. Only draggable cards wait this long. */
const HOLD_MS = 100
const COMPACT = '(max-width: 899px)'
const CARD_SELECTOR = [
  '.booth-drag-card[draggable="true"]',
  '.seat-chip[draggable="true"]',
  '.bus-seat-name[draggable="true"]',
  '.sweep-folder[draggable="true"]',
  '.sweep-task-chip[draggable="true"]',
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
  if (target.closest('input, textarea, select, button, a, .sweep-folder-title')) return null
  const card = target.closest(CARD_SELECTOR)
  return card instanceof HTMLElement ? card : null
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

function makeGhost(card: HTMLElement, x: number, y: number) {
  const ghost = card.cloneNode(true) as HTMLElement
  ghost.classList.remove('is-touch-dragging')
  ghost.classList.add('touch-drag-ghost')
  ghost.removeAttribute('draggable')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
  const rect = card.getBoundingClientRect()
  ghost.style.position = 'fixed'
  ghost.style.left = `${x}px`
  ghost.style.top = `${y}px`
  ghost.style.width = `${rect.width}px`
  ghost.style.height = `${rect.height}px`
  ghost.style.margin = '0'
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
