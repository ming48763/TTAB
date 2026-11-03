/** 檔案視窗關閉時，系統會把那一下點擊送到頁面上。短時間內擋掉，避免點到「重新上傳」。 */
export function swallowFollowingClick() {
  const stop = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
  }
  document.addEventListener('click', stop, true)
  window.setTimeout(() => document.removeEventListener('click', stop, true), 1000)
}
