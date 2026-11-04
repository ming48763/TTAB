/** 手機：直向寬度 480 以下，或矮的橫向（不再用長寬比）。 */
export const PHONE_SCREEN =
  '(max-width: 480px), ((orientation: landscape) and (max-height: 410px) and (max-width: 899px))'

/** 平板：行動端寬度，但不是手機。 */
export const TABLET_MAX = '(max-width: 899px)'

/** 平板橫向（視窗）。實際套用時還要搭配 is-ua-tablet。 */
export const TABLET_LANDSCAPE = '(orientation: landscape) and (max-width: 899px)'

/** 平板直向與平板橫向。 */
export const TABLET_SCREEN =
  '(orientation: portrait) and (min-width: 481px) and (max-width: 899px), ' + TABLET_LANDSCAPE

/** 直向，以及平板橫向。桌牌編輯器在這些尺寸把紙張縮進畫面。 */
export const EDITOR_FIT_SCREEN = `(orientation: portrait), ${TABLET_LANDSCAPE}`

/**
 * 螢幕 CSS 面積達此值視為平板。
 * 手機約 25万–40万（如 390×844、430×932）；平板約 57万起（如 600×960）。
 */
export const TABLET_MIN_SCREEN_AREA = 500_000

export type BrowserKind = 'Chrome' | 'Edge' | 'Safari' | 'Firefox' | 'Samsung' | 'Opera' | '其他'

/** 目前瀏覽器名稱。Edge／Samsung 要先於 Chrome，Safari 要排除 Chrome。 */
export function detectBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): BrowserKind {
  const brands =
    typeof navigator !== 'undefined'
      ? (
          navigator as Navigator & {
            userAgentData?: { brands?: { brand: string }[] }
          }
        ).userAgentData?.brands
      : undefined
  if (brands?.length) {
    const names = brands.map((item) => item.brand.toLowerCase())
    if (names.some((name) => name.includes('microsoft edge'))) return 'Edge'
    if (names.some((name) => name.includes('opera'))) return 'Opera'
    if (names.some((name) => name.includes('google chrome'))) return 'Chrome'
    if (names.some((name) => name.includes('firefox'))) return 'Firefox'
  }
  if (/Edg\//.test(ua)) return 'Edge'
  if (/SamsungBrowser\//i.test(ua)) return 'Samsung'
  if (/OPR\/|Opera\//i.test(ua)) return 'Opera'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) return 'Chrome'
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/CriOS\//i.test(ua)) return 'Safari'
  return '其他'
}

export type DeviceKind = '網頁端' | '平板端' | '手機端'

/**
 * 是否為手機／平板等行動裝置。
 * 只把 userAgentData.mobile === true 當確定訊號；false 常見於 Android 平板，不可直接當 Desktop。
 */
export function detectMobile(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  const nav =
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
      : undefined
  if (nav?.userAgentData?.mobile === true) return true

  if (/Mobi|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return true
  if (/Android/i.test(ua)) return true
  if (/iPad|Tablet|Silk/i.test(ua)) return true
  if (nav?.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return true

  if (typeof window !== 'undefined') {
    const coarse = window.matchMedia('(pointer: coarse)').matches
    const noHover = window.matchMedia('(hover: none)').matches
    if (coarse && noHover && (nav?.maxTouchPoints ?? 0) > 1) return true
  }

  return false
}

/** 目前視窗面積（iframe 內層）。 */
export function viewportAreaPx(): number {
  if (typeof window === 'undefined') return 0
  return Math.max(0, window.innerWidth * window.innerHeight)
}

/** 1.5× iframe 外層面積。775×421 的外層約 1163×632≈73万。 */
export function outerAreaPx(): number {
  if (typeof window === 'undefined') return 0
  if (new URLSearchParams(location.search).get('ui') !== '1') return 0
  try {
    if (!window.parent || window.parent === window) return 0
    return Math.max(0, window.parent.innerWidth * window.parent.innerHeight)
  } catch {
    return 0
  }
}

/** screen 面積（偏 CSS px）。若回報像實體像素會再除以 dpr²。 */
export function screenAreaPx(): number {
  if (typeof screen === 'undefined') return 0
  const area = screen.width * screen.height
  if (area <= 0) return 0
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  if (area > 900_000 && dpr > 1) return (screen.width / dpr) * (screen.height / dpr)
  return area
}

/**
 * 分手機／平板的總像素。
 * 有外層 iframe 時用外層（不要用被 1.5× 縮小的 775×421）。
 * 否則：390×875≈34万→手機；平板 screen／視窗 ≥50万→平板。
 */
export function deviceAreaPx(): number {
  const view = viewportAreaPx()
  const scr = screenAreaPx()
  const outer = outerAreaPx()

  // 縮放框內一律以外層為準（平板橫向 775×421 外層約 73万）
  if (outer > 0) return outer

  if (view <= 0) return scr
  if (scr <= 0) return view

  if (view < TABLET_MIN_SCREEN_AREA) {
    if (scr >= TABLET_MIN_SCREEN_AREA && Math.max(window.innerWidth, window.innerHeight) >= 600) {
      return scr
    }
    return view
  }
  return Math.max(view, scr)
}

/** 平板：明確平板 UA，或總像素 ≥ 50万。 */
export function detectTablet(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): boolean {
  if (!detectMobile(ua)) return false
  if (/iPad|Tablet|Silk|Kindle/i.test(ua)) return true
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  if (nav?.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return true
  return deviceAreaPx() >= TABLET_MIN_SCREEN_AREA
}

/** 目前視窗是否應套用手機端版面。 */
export function matchesPhoneScreen(): boolean {
  return detectDeviceKind() === '手機端'
}

/** 行動端版面寬度（手機＋平板，含平板橫向）。與 touchDrag compact 一致。 */
export function matchesCompactScreen(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(TABLET_MAX).matches
}

/**
 * Desktop → 網頁端。行動端再用 detectTablet（UA 平板或總像素 ≥50万）。
 * 與 is-ua-tablet 一致，避免 iPad 在小視窗被當成手機而鎖橫向。
 */
export function detectDeviceKind(): DeviceKind {
  if (!detectMobile()) return '網頁端'
  if (!window.matchMedia(TABLET_MAX).matches) return '網頁端'
  return detectTablet() ? '平板端' : '手機端'
}

/** 寫入 html 的 UA／裝置 class，供 CSS 排除平板誤套手機規則。 */
export function applyDeviceClasses(root: HTMLElement = document.documentElement) {
  const mobile = detectMobile()
  const tablet = detectTablet()
  root.classList.toggle('is-ua-mobile', mobile)
  root.classList.toggle('is-ua-desktop', !mobile)
  root.classList.toggle('is-ua-tablet', tablet)
  root.classList.toggle('is-ua-phone', mobile && !tablet)
}
