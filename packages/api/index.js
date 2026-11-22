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

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import compression from 'compression'
import { ZodError } from 'zod'
import { config } from './lib/config.js'
import { rateLimit } from './lib/util.js'
import { authRouter } from './routes/auth.routes.js'
import { identityRouter } from './routes/identity.routes.js'
import { orgRouter } from './routes/org.routes.js'
import { auditRouter } from './routes/audit.routes.js'
import { providerRouter } from './routes/providers.routes.js'
import { appointmentRouter } from './routes/appointments.routes.js'
import { inquiryRouter } from './routes/inquiries.routes.js'
import { adminRouter } from './routes/admin.routes.js'
import { contentRouter } from './routes/content.routes.js'
import { documentsRouter } from './routes/documents.routes.js'
import { requireAuth } from './lib/auth.js'
import { resolvePrincipal } from './lib/authorize.js'
import { tenantContextMiddleware } from './lib/tenant.js'
import { PasswordPolicyError } from './lib/password.js'
import { webpForGalleryUrl } from './lib/media.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.set('trust proxy', true)
app.disable('x-powered-by')

app.use((req, res, next) => {
  const correlationId = req.header('X-Correlation-ID') || `cor_${randomUUID()}`
  req.correlationId = correlationId
  res.setHeader('X-Correlation-ID', correlationId)
  next()
})

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
app.get('/api/health/live', (_req, res) => res.json({ status: 'ok', service: 'comet-api' }))
app.get('/api/health/ready', (_req, res) => res.json({
  status: 'ok',
  service: 'comet-api',
  checks: { postgres: 'ok', redis: 'not-configured', objectStorage: 'not-configured' },
}))

// Slow down the write endpoints a little for public internet deployments.
app.use('/api', rateLimit({ windowMs: 60_000, max: 120 }))

// Phase 3: resolve the bearer principal, then scope every query to its tenant
// and branch. Public routes simply get the default tenant context.
app.use('/api', resolvePrincipal)
app.use('/api', tenantContextMiddleware)

app.use('/api/auth', authRouter)
app.use('/api/identity', identityRouter)
app.use('/api/org', orgRouter)
app.use('/api/audit', auditRouter)
app.use('/api/providers', providerRouter)
app.use('/api/appointments', appointmentRouter)
app.use('/api/inquiries', inquiryRouter)
app.use('/api/content', contentRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/admin', requireAuth, adminRouter)

// ---- production: serve the built frontend from dist/ and SPA-fallback ----
const dist = path.resolve(__dirname, '../web/dist')
const publicDir = path.resolve(__dirname, '../web/public')

// Transparently serve generated WebP derivatives for gallery photos. Existing
// <img src="/images/gallery/....jpg"> markup stays unchanged; supporting
// browsers receive a much smaller file with the correct MIME type.
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next()
  if (!req.accepts('image/webp')) return next()
  const webpUrl = webpForGalleryUrl(req.path)
  if (!webpUrl) return next()
  const file = path.join(publicDir, webpUrl.slice(1))
  const galleryDir = path.join(publicDir, 'images', 'gallery') + path.sep
  if (!file.startsWith(galleryDir) || !fs.existsSync(file)) return next()
  return res.sendFile(file, { maxAge: '7d', headers: { 'Content-Type': 'image/webp' } })
})

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
  if (err instanceof PasswordPolicyError) {
    return res.status(err.status).json({ error: err.message })
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