type PdfBlob = { output(type: 'blob'): Blob }

function topWindow() {
  try {
    if (window.top && window.top.document.body) return window.top
  } catch {
    /* 外層視窗跨網域時改在本頁下載 */
  }
  return window
}

function urlApi(view: Window) {
  return (view as Window & { URL: typeof URL }).URL
}

/** 在最外層頁面下載。桌面版畫面在縮放 iframe 裡，jsPDF 的連結點擊會被瀏覽器取消。 */
export function savePdfFile(pdf: PdfBlob, filename: string) {
  const view = topWindow()
  const url = urlApi(view).createObjectURL(pdf.output('blob'))
  const a = view.document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  view.document.body.appendChild(a)
  a.click()
  a.remove()
  view.setTimeout(() => urlApi(view).revokeObjectURL(url), 60_000)
}
