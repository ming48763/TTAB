import { useEffect, useState } from 'react'

const PHONE =
  '(max-width: 480px), ((orientation: landscape) and (max-height: 410px) and (max-width: 899px) and (min-aspect-ratio: 16/9))'
const TABLET = '(max-width: 899px)'

type ScreenInfo = {
  width: number
  height: number
  outer: string
  device: string
}

function readScreen(): ScreenInfo {
  const landscape = window.matchMedia('(orientation: landscape)').matches
  const phone = window.matchMedia(PHONE).matches
  const tablet = !phone && window.matchMedia(TABLET).matches
  const kind = phone ? '手機端' : tablet ? '平板端' : '網頁端'
  const framed = new URLSearchParams(location.search).get('ui') === '1'
  let outer = ''
  if (framed) {
    try {
      outer = `${window.parent.innerWidth} × ${window.parent.innerHeight}`
    } catch {
      outer = ''
    }
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    outer,
    device: `${kind} · ${landscape ? '橫向' : '直向'}`,
  }
}

export function ScreenDebugBar() {
  const [info, setInfo] = useState(readScreen)

  useEffect(() => {
    const update = () => setInfo(readScreen())
    const queries = [PHONE, TABLET, '(orientation: landscape)'].map((query) => window.matchMedia(query))
    window.addEventListener('resize', update)
    for (const query of queries) query.addEventListener('change', update)
    return () => {
      window.removeEventListener('resize', update)
      for (const query of queries) query.removeEventListener('change', update)
    }
  }, [])

  return (
    <div className="screen-debug" aria-hidden="true">
      <span>
        {info.width} × {info.height}
      </span>
      {info.outer ? <span>外層 {info.outer}</span> : null}
      <span>{info.device}</span>
    </div>
  )
}
