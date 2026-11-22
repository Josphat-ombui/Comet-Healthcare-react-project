// Authentication helpers — bcrypt hashing, JWT signing/verification, password
// reset tokens, and the Express auth middlewares. No user data is ever logged.

import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

export const SALT_ROUNDS = 12

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS)
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash)
}

/** Sign a JWT for the given user (attaching role so clients do not need a DB hit). */
export function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  )
}

/** Return a raw (opaque) reset token plus its hashed form for storage. */
export function createResetToken() {
  const raw = crypto.randomBytes(32).toString('hex')
  return { raw, hash: sha256(raw), expiresAt: new Date(Date.now() + config.resetTokenTtlSeconds * 1000) }
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

// ---------------------------------------------------------------- middlewares

/** Parse the "Authorization: Bearer <token>" header and verify it. */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' })
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.auth = { userId: payload.sub, role: payload.role }
    return next()
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid' })
  }
}

/** Populate req.auth when a valid Bearer token is present; never rejects.
 *  Used on public endpoints (like booking) where auth is optional. */
export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      const payload = jwt.verify(token, config.jwtSecret)
      req.auth = { userId: payload.sub, role: payload.role }
    } catch {
      // Ignore invalid/expired tokens on optional routes.
    }
  }
  return next()
}

/** Restrict a route to specific roles, e.g. requireAuth, requireRole('ADMIN'). */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that' })
    }
    return next()
  }
}

/** Shrink a JWT payload to the shape browsers expect from /api/auth/me. */
export function toPublicUser(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone ?? null,
    company: user.company ?? null,
    role: user.role,
    providerId: user.providerId ?? null,
    createdAt: user.createdAt,
  }
}