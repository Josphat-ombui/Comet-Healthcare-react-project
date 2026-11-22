// Session lifecycle: access tokens, rotating refresh tokens, device list and
// revocation. Refresh tokens are stored only as SHA-256 hashes.

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { db, withTenant } from './tenant.js'
import { sha256 } from './auth.js'
import { emitEvent } from './events.js'

const COOKIE_NAME = 'comet_refresh'

export function createRefreshToken() {
  return crypto.randomBytes(32).toString('hex')
}

export function signAccessToken(user, session, correlationId = '') {
  return jwt.sign(
    {
      sub: user.id,
      companyId: user.companyId,
      branchId: user.branchId || null,
      branchIds: session?.branchIds || (user.branchId ? [user.branchId] : []),
      roles: session?.roles || [user.role],
      sessionId: session?.id || null,
      scope: 'access',
      correlationId,
      jti: crypto.randomUUID(),
    },
    config.jwtSecret,
    { expiresIn: config.jwtAccessTtl }
  )
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwtSecret)
  if (payload.scope && payload.scope !== 'access') throw new Error('Invalid token scope')
  return payload
}

export function verifyMfaChallenge(token) {
  const payload = jwt.verify(token, config.jwtSecret)
  if (payload.scope !== 'mfa') throw new Error('Invalid MFA challenge')
  return payload
}

export function signMfaChallenge(user, sessionId, correlationId = '') {
  return jwt.sign(
    { sub: user.id, companyId: user.companyId, sessionId, scope: 'mfa', correlationId },
    config.jwtSecret,
    { expiresIn: '5m' }
  )
}

/** Short-lived token used only to authorise Socket.IO rooms. It carries no
 *  message content and is derived from a full API request's principal. */
export function signRealtimeToken(principal, rooms) {
  return jwt.sign(
    {
      sub: principal.userId,
      companyId: principal.companyId,
      branchIds: principal.branchIds || [],
      roles: principal.roles || [],
      rooms,
      scope: 'realtime',
      jti: crypto.randomUUID(),
    },
    config.jwtSecret,
    { expiresIn: config.realtime.tokenTtl }
  )
}

export function verifyRealtimeToken(token) {
  const payload = jwt.verify(token, config.jwtSecret)
  if (payload.scope !== 'realtime') throw new Error('Invalid token scope')
  if (!payload.companyId || !payload.sub || !Array.isArray(payload.rooms)) {
    throw new Error('Invalid realtime token claims')
  }
  return payload
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: config.session.refreshTtlSeconds * 1000,
  }
}

export function setRefreshCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions())
}

export function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined })
}

export function getRefreshCookie(req) {
  const header = req.headers?.cookie || ''
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === COOKIE_NAME) return decodeURIComponent(value.join('='))
  }
  return null
}

export async function createSession(user, req, roles = [user.role]) {
  const companyId = user.companyId
  return withTenant({ companyId, branchId: user.branchId || '', actorId: user.id }, async () => {
    const active = await db.session.findMany({
      where: { companyId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    })
    const excess = active.length - config.session.maxConcurrent + 1
    if (excess > 0) {
      for (const old of active.slice(0, excess)) {
        await db.session.update({ where: { id: old.id }, data: { revokedAt: new Date() } })
        await emitEvent('SessionRevoked', { userId: user.id, sessionId: old.id, reason: 'concurrent-limit' })
      }
    }

    const raw = createRefreshToken()
    const session = await db.session.create({
      data: {
        companyId,
        userId: user.id,
        refreshTokenHash: sha256(raw),
        userAgent: (req.headers?.['user-agent'] || '').slice(0, 300) || null,
        ipAddress: (req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null,
        expiresAt: new Date(Date.now() + config.session.refreshTtlSeconds * 1000),
      },
    })
    return { raw, session: { ...session, roles, branchIds: user.branchId ? [user.branchId] : [] } }
  })
}

export async function rotateSession(raw, req) {
  if (!raw) return null
  const hash = sha256(raw)
  const existing = await db.session.findUnique({ where: { refreshTokenHash: hash } })
  if (!existing || existing.revokedAt || existing.expiresAt < new Date()) return null
  const user = await db.user.findFirst({ where: { id: existing.userId, companyId: existing.companyId, status: 'ACTIVE' } })
  if (!user) return null

  const roles = await db.userRole.findMany({
    where: { companyId: user.companyId, userId: user.id },
    select: { role: { select: { code: true } } },
  })
  await db.session.update({ where: { id: existing.id }, data: { revokedAt: new Date(), lastSeenAt: new Date() } })

  // Reuse the user object shape expected by createSession/signAccessToken.
  const created = await createSession(user, req, roles.map((r) => r.role.code))
  return created
}

export async function revokeSession(sessionId, reason = 'user-logout') {
  const session = await db.session.findUnique({ where: { id: sessionId } })
  if (!session || session.revokedAt) return false
  await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
  await emitEvent('SessionRevoked', { userId: session.userId, sessionId, reason })
  return true
}

export function toPublicSession(session, currentId) {
  return {
    id: session.id,
    current: session.id === currentId,
    userAgent: session.userAgent || null,
    ipAddress: session.ipAddress || null,
    lastSeenAt: session.lastSeenAt || null,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  }
}
