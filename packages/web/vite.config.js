import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const galleryDir = fileURLToPath(new URL('./public/images/gallery/', import.meta.url))

// Same transparent WebP swap used by the Express server, for Vite dev/preview.
function galleryWebp() {
  const middleware = (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()
    if (!/\bimage\/webp\b/i.test(req.headers.accept || '')) return next()

    const pathname = String(req.url || '').split('?')[0]
    const match = /^\/images\/gallery\/([^/]+)\.(?:jpe?g|png)$/i.exec(pathname)
    if (!match) return next()

    const file = path.join(galleryDir, `${match[1]}-1080.webp`)
    if (!file.startsWith(galleryDir) || !fs.existsSync(file)) return next()

    const size = fs.statSync(file).size
    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Content-Length', size)
    res.setHeader('Cache-Control', 'public, max-age=604800')
    if (req.method === 'HEAD') return res.end()

    const stream = fs.createReadStream(file)
    stream.on('error', () => {
      stream.destroy()
      if (!res.headersSent) next()
      else res.end()
    })
    return stream.pipe(res)
  }

  return {
    name: 'comet-gallery-webp',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), galleryWebp()],
  server: {
    proxy: {
      // Frontend calls /api/* in development; forward to the Express API.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        },
      },
    },
  },
})
