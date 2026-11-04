import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyDeviceClasses, detectDeviceKind, detectMobile } from './lib/screenLayout'
import { markRotateReload } from './lib/workSession'
import { installTouchDrag } from './lib/touchDrag'
import './index.css'

installTouchDrag()

const UI_SCALE = 1.5
/** Desktop UA 的 iframe 內層至少這麼寬，才會維持網頁端 CSS。 */
const DESKTOP_MIN_INNER = 900

function mountApp() {
  const rootEl = document.getElementById('root')
  if (!rootEl) return
  applyDeviceClasses()
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

function desktopFrameBox() {
  const outerW = window.innerWidth
  const outerH = window.innerHeight
  const innerFromScale = outerW / UI_SCALE
  if (innerFromScale >= DESKTOP_MIN_INNER) {
    return {
      width: `calc(100vw / ${UI_SCALE})`,
      height: `calc(100dvh / ${UI_SCALE})`,
      zoom: String(UI_SCALE),
    }
  }
  const zoom = outerW / DESKTOP_MIN_INNER
  return {
    width: `${DESKTOP_MIN_INNER}px`,
    height: `${Math.max(1, outerH / zoom)}px`,
    zoom: String(zoom),
  }
}

function mountScaledFrame() {
  const params = new URLSearchParams(location.search)
  params.set('ui', '1')
  const mobile = detectMobile()
  const box = mobile
    ? {
        width: `calc(100vw / ${UI_SCALE})`,
        height: `calc(100dvh / ${UI_SCALE})`,
        zoom: String(UI_SCALE),
      }
    : desktopFrameBox()
  const frame = document.createElement('iframe')
  frame.title = 'TTAB'
  frame.src = `${location.pathname}?${params.toString()}${location.hash}`
  frame.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'border:0',
    `width:${box.width}`,
    `height:${box.height}`,
    `zoom:${box.zoom}`,
    'background:#f3efe6',
  ].join(';')
  document.documentElement.style.height = '100%'
  document.documentElement.style.overflow = 'hidden'
  document.documentElement.style.overscrollBehaviorY = 'contain'
  applyDeviceClasses()
  document.body.style.margin = '0'
  document.body.style.height = '100%'
  document.body.style.overflow = 'hidden'
  document.body.style.background = '#f3efe6'
  document.body.replaceChildren(frame)

  if (!mobile) {
    window.addEventListener('resize', () => {
      const next = desktopFrameBox()
      frame.style.width = next.width
      frame.style.height = next.height
      frame.style.zoom = next.zoom
    })
  }
}

const compactScreen = window.matchMedia('(max-width: 899px)')
const framed = new URLSearchParams(location.search).get('ui') === '1'
const mobileUa = detectMobile()

// Desktop UA 一律走網頁端縮放框，不因視窗變窄改走行動端直出。
if (framed || (compactScreen.matches && mobileUa)) mountApp()
else mountScaledFrame()

if (!framed && mobileUa) {
  compactScreen.addEventListener('change', () => {
    // 手機旋轉只靠 PhonePortraitLock，不重整，避免資料消失。
    if (detectDeviceKind() === '手機端') return
    markRotateReload()
    location.reload()
  })
}
