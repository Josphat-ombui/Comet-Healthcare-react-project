// Small shared helpers used across the API.

import crypto from 'node:crypto'

// A-Z minus ambiguous letters, 2-9 digits minus 0/1. Codes look like CMT-K7EXQN8R.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function randomCode(length = 8) {
  const bytes = crypto.randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export function genBookingCode() {
  return `CMT-${randomCode(8)}`
}

/** Error carrying an HTTP status so the central handler can serialise it
 *  without leaking internals. */
export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    Object.assign(this, extra)
  }
}

/** Simple in-memory, per-IP sliding-window rate limiter. Fine for a dev/preview
 *  deployment; swap for redis/rate-limiter in production. */
export function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const hits = new Map()
  return (req, res, next) => {
    const key = req.ip || 'unknown'
    const now = Date.now()
    const bucket = (hits.get(key) || []).filter((t) => now - t < windowMs)
    if (bucket.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000))
      return res.status(429).json({ error: 'Too many requests, please slow down' })
    }
    bucket.push(now)
    hits.set(key, bucket)
    return next()
  }
}