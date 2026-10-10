/** Shrink a preview toolbar row so it stays on one line inside a fixed page. */
export function fitPreviewRow(row: HTMLElement | null, mode: 'spread' | 'center' = 'spread') {
  if (!row) return
  const portrait = window.matchMedia('(orientation: portrait)').matches
  if (!portrait) {
    row.style.zoom = ''
    row.style.width = ''
    return
  }
  const parent = row.parentElement
  if (!parent) return
  row.style.zoom = '1'
  const parentStyle = getComputedStyle(parent)
  const avail = Math.max(
    0,
    parent.clientWidth -
      (Number.parseFloat(parentStyle.paddingLeft) || 0) -
      (Number.parseFloat(parentStyle.paddingRight) || 0),
  )
  if (avail <= 0) return
  if (mode === 'center') {
    row.style.width = 'max-content'
  } else {
    row.style.width = '100%'
    if (row.scrollWidth <= avail + 1) {
      row.style.zoom = '1'
      return
    }
    row.style.width = 'max-content'
  }
  const need = row.scrollWidth
  if (need <= avail + 1) {
    row.style.zoom = '1'
    return
  }
  row.style.zoom = String(Math.round((avail / need) * 1000) / 1000)
}
