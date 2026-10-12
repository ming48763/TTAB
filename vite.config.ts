import type { Connect, PreviewServer, ViteDevServer } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { pickHomeLine } from './server/homeLines'

function homeLineMiddleware(middlewares: Connect.Server) {
  middlewares.use('/api/home-line', (req, res, next) => {
    if (req.method !== 'GET') {
      next()
      return
    }
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.end(JSON.stringify({ line: pickHomeLine() }))
  })
}

function homeLinePlugin() {
  return {
    name: 'home-line-api',
    configureServer(server: ViteDevServer) {
      homeLineMiddleware(server.middlewares)
    },
    configurePreviewServer(server: PreviewServer) {
      homeLineMiddleware(server.middlewares)
    },
  }
}

export default defineConfig({
  plugins: [react(), homeLinePlugin()],
})
