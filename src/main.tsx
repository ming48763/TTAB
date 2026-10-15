import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const UI_SCALE = 1.5

function mountApp() {
  const rootEl = document.getElementById('root')
  if (!rootEl) return
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

function mountScaledFrame() {
  const params = new URLSearchParams(location.search)
  params.set('ui', '1')
  const frame = document.createElement('iframe')
  frame.title = 'TTAB'
  frame.src = `${location.pathname}?${params.toString()}${location.hash}`
  frame.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'border:0',
    `width:calc(100vw / ${UI_SCALE})`,
    `height:calc(100dvh / ${UI_SCALE})`,
    `zoom:${UI_SCALE}`,
    'background:#f3efe6',
  ].join(';')
  document.documentElement.style.height = '100%'
  document.documentElement.style.overflow = 'hidden'
  document.body.style.margin = '0'
  document.body.style.height = '100%'
  document.body.style.overflow = 'hidden'
  document.body.style.background = '#f3efe6'
  document.body.replaceChildren(frame)
}

const compactScreen = window.matchMedia('(max-width: 899px)')
const framed = new URLSearchParams(location.search).get('ui') === '1'

if (framed || compactScreen.matches) mountApp()
else mountScaledFrame()

if (!framed) {
  compactScreen.addEventListener('change', () => location.reload())
}
