const rootEl = document.getElementById('root')

if (rootEl) {
  const { StrictMode } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { default: App } = await import('./App')
  await import('./index.css')

  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
