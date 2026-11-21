// Comet Healthcare API — Express 5 entrypoint.
//
// Layout:
//   /api/auth/*          register, login, me, password reset
//   /api/providers/*     expert directory + availability
//   /api/appointments/*  booking, cancel, reschedule
//   /api/inquiries/*   contact / CDMO / catalogue leads
//   /api/admin/*       admin-only management surface
//   /api/documents/*   generated business documents + branded PDFs
//
// Run with `npm run dev` (auto-restarts) or `npm start`.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { ZodError } from 'zod'
import { config } from './lib/config.js'
import { rateLimit } from './lib/util.js'
import { authRouter } from './routes/auth.routes.js'
import { providerRouter } from './routes/providers.routes.js'
import { appointmentRouter } from './routes/appointments.routes.js'
import { inquiryRouter } from './routes/inquiries.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { contentRouter } from './routes/content.routes.js'
import { documentsRouter } from './routes/documents.routes.js'
import { requireAuth } from './lib/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.set('trust proxy', true)
app.disable('x-powered-by')

// Gzip text responses (HTML/CSS/JS/JSON). Images are already compressed.
app.use(compression({ threshold: 1024 }))

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// Minimal access log — method, path, status, duration. Never log bodies or PII.
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    const start = Date.now()
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`)
    })
  }
  next()
})

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'comet-api', time: new Date().toISOString() }))

// Slow down the write endpoints a little for public internet deployments.
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }))

app.use('/api/auth', authRouter)
app.use('/api/providers', providerRouter)
app.use('/api/appointments', appointmentRouter)
app.use('/api/inquiries', inquiryRouter)
app.use('/api/content', contentRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/admin', requireAuth, adminRouter)

// ---- production: serve the built frontend from dist/ and SPA-fallback ----
const dist = path.resolve(__dirname, '../dist')
const publicDir = path.resolve(__dirname, '../public')

// Serve the media library + static images from public/ in ALL environments so
// admin-uploaded photos work identically in dev and production.
app.use('/images', express.static(path.join(publicDir, 'images'), { maxAge: '7d' }))

if (config.isProd) {
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }))
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(dist, 'index.html'))
    }
    return next()
  })
}

// Unknown API route -> JSON 404 (never the HTML fallback).
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }))

// Central error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err instanceof ZodError) {
    const first = err.issues[0]
    return res.status(400).json({
      error: first ? first.message : 'Invalid request',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    })
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }
  // Do NOT leak internals (stack traces, query details) to clients.
  console.error('Unhandled error:', err)
  return res.status(500).json({ error: 'Something went wrong on our side' })
})

app.listen(config.port, () => {
  console.log(`Comet Healthcare API listening on http://localhost:${config.port} (${config.nodeEnv})`)
  if (config.isProd) console.log(`Serving frontend from ${dist}`)
})

export default app