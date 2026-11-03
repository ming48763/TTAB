/** 手機：直向寬度 480 以下，或又矮又寬的橫向。 */
export const PHONE_SCREEN =
  '(max-width: 480px), ((orientation: landscape) and (max-height: 410px) and (max-width: 899px) and (min-aspect-ratio: 16/9))'

/** 平板橫向。775×421（外層約 1163×632）與約 640×400 都在這裡，不是手機。 */
export const TABLET_LANDSCAPE =
  '(orientation: landscape) and (max-width: 899px) and (min-height: 411px), (orientation: landscape) and (max-width: 899px) and (max-height: 410px) and (max-aspect-ratio: 1.75)'

/** 平板直向與平板橫向。 */
export const TABLET_SCREEN =
  '(orientation: portrait) and (min-width: 481px) and (max-width: 899px), ' + TABLET_LANDSCAPE

/** 直向，以及平板橫向。桌牌編輯器在這些尺寸把紙張縮進畫面。 */
export const EDITOR_FIT_SCREEN = `(orientation: portrait), ${TABLET_LANDSCAPE}`
