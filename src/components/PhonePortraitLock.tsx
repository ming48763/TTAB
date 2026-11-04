import { useEffect, useState } from 'react'
import { detectDeviceKind } from '../lib/screenLayout'

function shouldLock() {
  return detectDeviceKind() === '手機端' && window.matchMedia('(orientation: landscape)').matches
}

/** 手機橫向時全螢幕提示直向使用；平板／網頁不受影響。不重整頁面。 */
export function PhonePortraitLock() {
  const [locked, setLocked] = useState(shouldLock)

  useEffect(() => {
    const sync = () => setLocked(shouldLock())
    const mq = window.matchMedia('(orientation: landscape)')
    mq.addEventListener('change', sync)
    window.addEventListener('resize', sync)
    sync()
    return () => {
      mq.removeEventListener('change', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  useEffect(() => {
    if (!locked) return
    const html = document.documentElement
    html.classList.add('is-phone-portrait-locked')
    const prevBodyOverflow = document.body.style.overflow
    const prevHtmlOverflow = html.style.overflow
    document.body.style.overflow = 'hidden'
    html.style.overflow = 'hidden'
    return () => {
      html.classList.remove('is-phone-portrait-locked')
      document.body.style.overflow = prevBodyOverflow
      html.style.overflow = prevHtmlOverflow
    }
  }, [locked])

  if (!locked) return null

  return (
    <div className="phone-portrait-lock" role="alert" aria-live="assertive">
      <p>請將手機直向使用，以獲得較佳的體驗。</p>
    </div>
  )
}
