// Public + session auth endpoints.
//
// Backward compatible: POST /register and POST /login still return
// { token, user }. Phase 3 adds MFA challenges, rotating refresh cookies,
// session management, OIDC, lockout, password history, and audit events.

import crypto from 'node:crypto'
import { Router } from 'express'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'
import { PASSWORD_POLICY } from '../../shared/src/identity.js'
import { db, withTenant } from '../lib/tenant.js'
import { hashPassword, verifyPassword, signToken, requireAuth, createResetToken, sha256, toPublicUser } from '../lib/auth.js'
import {
  registerSchema,
  loginSchema,
  resetRequestSchema,
  resetPasswordSchema,
  mfaVerifySchema,
  changePasswordSchema,
  oidcCallbackSchema,
} from '../lib/validation.js'
import { config } from '../lib/config.js'
import { sendMail } from '../lib/mailer.js'
import { assertPasswordAllowed, PasswordPolicyError } from '../lib/password.js'
import { decryptString, encryptString } from '../lib/crypto.js'
import { buildOtpauthUri, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotpCode } from '../lib/totp.js'
import { createOidcState, exchangeCode, getAuthorizationUrl, isOidcConfigured, verifyIdToken, verifyOidcState } from '../lib/oidc.js'
import { createSession, getRefreshCookie, rotateSession, setRefreshCookie, clearRefreshCookie, signAccessToken, signMfaChallenge, toPublicSession, verifyMfaChallenge } from '../lib/session.js'
import { recordAudit } from '../lib/audit.js'
import { emitEvent } from '../lib/events.js'

export const authRouter = Router()

function clientIp(req) {
  return (req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null
}

async function findUserByEmail(email) {
  const normalized = String(email || '').toLowerCase().trim()
  return withTenant({ companyId: DEFAULT_COMPANY_ID }, () =>
    db.user.findFirst({
      where: { companyId: DEFAULT_COMPANY_ID, email: normalized },
    })
  )
}

async function rolesFor(user) {
  if (!user) return []
  const assignments = await db.userRole.findMany({
    where: { companyId: user.companyId, userId: user.id },
    select: { role: { select: { code: true } } },
  })
  return assignments.length ? assignments.map((a) => a.role.code) : [user.role]
}

async function previousHashes(user) {
  const rows = await db.passwordHistory.findMany({
    where: { companyId: user.companyId, userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_POLICY.historyLimit,
    select: { hash: true },
  })
  return rows.map((row) => row.hash)
}

async function rememberPassword(user, hash) {
  await db.passwordHistory.create({
    data: { companyId: user.companyId, userId: user.id, hash },
  })
  const old = await db.passwordHistory.findMany({
    where: { companyId: user.companyId, userId: user.id },
    orderBy: { createdAt: 'desc' },
    skip: PASSWORD_POLICY.historyLimit,
    select: { id: true },
  })
  if (old.length) {
    await db.passwordHistory.deleteMany({ where: { id: { in: old.map((row) => row.id) } } })
  }
}

async function audit(req, action, resourceId, metadata = {}, companyId = DEFAULT_COMPANY_ID) {
  await recordAudit({
    companyId,
    actorId: req.auth?.userId || null,
    action,
    resourceType: 'User',
    resourceId: String(resourceId),
    metadata,
    ipAddress: clientIp(req),
    userAgent: req.headers?.['user-agent'] || null,
  })
}

async function completeSignIn(user, req, res, extra = {}) {
  const roles = await rolesFor(user)
  const { raw, session } = await createSession(user, req, roles)
  setRefreshCookie(res, raw)
  await withTenant({ companyId: user.companyId, branchId: user.branchId || '', actorId: user.id }, async () => {
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockoutUntil: null, lastFailedLoginAt: null } })
    await audit(req, 'LOGIN_SUCCESS', user.id, { provider: user.identityProvider, roles }, user.companyId)
  })
  return res.json({
    token: signAccessToken(user, session, req.correlationId),
    // Keep the legacy signer available for internal callers/tests.
    legacyToken: signToken(user),
    user: { ...toPublicUser(user), roles, branchId: user.branchId || null },
    mfaRequired: false,
    sessionId: session.id,
    expiresIn: config.jwtAccessTtl,
    ...extra,
  })
}

function policyError(res, error) {
  if (error instanceof PasswordPolicyError) {
    return res.status(error.status).json({ error: error.message })
  }
  throw error
}

async function issuePasswordReset(user, req) {
  const { raw, hash, expiresAt } = createResetToken()
  await withTenant({ companyId: user.companyId }, async () => {
    await db.user.update({ where: { id: user.id }, data: { resetTokenHash: hash, resetTokenExp: expiresAt } })
    await audit(req, 'PASSWORD_RESET_REQUESTED', user.id, {}, user.companyId)
  })
  await sendMail({
    to: user.email,
    subject: 'Reset your Comet Healthcare password',
    text: `Hi ${user.firstName},\n\nWe received a request to reset your password.\nOpen the link below to choose a new one (valid for ${Math.round(config.resetTokenTtlSeconds / 3600)} hours):\n\n${config.appUrl}/reset-password?token=${raw}\n\nIf you did not request this, you can safely ignore this email.`,
  })
}

// ---------------------------------------------------------------- registration

authRouter.post('/register', async (req, res) => {
  const body = registerSchema.parse(req.body)
  const email = body.email.toLowerCase()
  const existing = await findUserByEmail(email)
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }

  let passwordHash
  try {
    await assertPasswordAllowed(body.password)
    passwordHash = await hashPassword(body.password)
  } catch (error) {
    return policyError(res, error)
  }

  const user = await withTenant({ companyId: DEFAULT_COMPANY_ID }, async () => {
    const created = await db.user.create({
      data: {
        companyId: DEFAULT_COMPANY_ID,
        email,
        passwordHash,
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone || null,
        company: body.company || null,
        role: 'PATIENT',
        passwordChangedAt: new Date(),
      },
    })
    await rememberPassword(created, passwordHash)
    await emitEvent('UserCreated', { userId: created.id, email: created.email, branchId: null })
    await audit(req, 'USER_CREATED', created.id, { role: created.role })
    return created
  })
  return res.status(201).json(await completeSignIn(user, req, res))
})

// ---------------------------------------------------------------- local login

authRouter.post('/login', async (req, res) => {
  const body = loginSchema.parse(req.body)
  const user = await findUserByEmail(body.email)
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  if (user.lockoutUntil && user.lockoutUntil > new Date()) {
    return res.status(423).json({ error: 'Account temporarily locked. Try again later.' })
  }

  const ok = await verifyPassword(body.password, user.passwordHash)
  if (!ok) {
    const failed = user.failedLoginAttempts + 1
    const locked = failed >= config.login.maxAttempts
    await withTenant({ companyId: user.companyId }, async () => {
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: failed,
          lastFailedLoginAt: new Date(),
          ...(locked ? { lockoutUntil: new Date(Date.now() + config.login.windowSeconds * 1000) } : {}),
        },
      })
      await audit(req, 'LOGIN_FAILED', user.id, { reason: 'bad-password' }, user.companyId)
    })
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  if (user.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'This account is not active' })
  }

  const mfa = await withTenant({ companyId: user.companyId }, () =>
    db.mfaCredential.findFirst({
      where: { companyId: user.companyId, userId: user.id, type: 'TOTP', enabled: true },
      select: { id: true },
    })
  )
  if (mfa) {
    const challenge = signMfaChallenge(user, null, req.correlationId)
    await audit(req, 'MFA_CHALLENGE_ISSUED', user.id, {}, user.companyId)
    return res.json({
      mfaRequired: true,
      challenge,
      token: null,
      user: { ...toPublicUser(user), roles: await rolesFor(user) },
    })
  }

  return completeSignIn(user, req, res)
})

authRouter.post('/mfa/verify', async (req, res) => {
  const body = mfaVerifySchema.parse(req.body)
  let claims
  try {
    claims = verifyMfaChallenge(body.challenge)
  } catch {
    return res.status(400).json({ error: 'MFA challenge expired. Sign in again.' })
  }

  const user = await withTenant({ companyId: claims.companyId }, () =>
    db.user.findFirst({ where: { id: claims.sub, companyId: claims.companyId, status: 'ACTIVE' } })
  )
  if (!user) return res.status(401).json({ error: 'Account not found' })

  const credential = await withTenant({ companyId: user.companyId }, () =>
    db.mfaCredential.findFirst({
      where: { companyId: user.companyId, userId: user.id, type: 'TOTP', enabled: true },
    })
  )
  if (!credential) return res.status(400).json({ error: 'MFA is not enrolled for this account' })

  let usedRecovery = false
  let valid = false
  try {
    valid = verifyTotpCode(decryptString(credential.secretEncrypted), body.code)
  } catch {
    valid = false
  }
  if (!valid) {
    const codeHash = hashRecoveryCode(body.code)
    const recovery = await withTenant({ companyId: user.companyId }, () =>
      db.recoveryCode.findFirst({ where: { companyId: user.companyId, userId: user.id, codeHash, usedAt: null } })
    )
    if (recovery) {
      await withTenant({ companyId: user.companyId }, () =>
        db.recoveryCode.update({ where: { id: recovery.id }, data: { usedAt: new Date() } })
      )
      usedRecovery = true
      valid = true
    }
  }
  if (!valid) {
    await audit(req, 'MFA_VERIFY_FAILED', user.id, {}, user.companyId)
    return res.status(401).json({ error: 'Invalid authentication code' })
  }

  await audit(req, 'MFA_VERIFIED', user.id, { method: usedRecovery ? 'recovery-code' : 'totp' }, user.companyId)
  return completeSignIn(user, req, res)
})

// ---------------------------------------------------------------- MFA enrolment

authRouter.post('/mfa/enrol', requireAuth, async (req, res) => {
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const secret = generateTotpSecret()
  const codes = generateRecoveryCodes()
  const secretEncrypted = encryptString(secret)

  await withTenant({ companyId, actorId: req.auth.userId }, async () => {
    await db.mfaCredential.upsert({
      where: { userId_type: { userId: req.auth.userId, type: 'TOTP' } },
      update: { secretEncrypted, enabled: false, confirmedAt: null },
      create: { companyId, userId: req.auth.userId, type: 'TOTP', secretEncrypted, enabled: false },
    })
    await db.recoveryCode.deleteMany({ where: { companyId, userId: req.auth.userId, usedAt: null } })
    await db.recoveryCode.createMany({
      data: codes.map((code) => ({ companyId, userId: req.auth.userId, codeHash: hashRecoveryCode(code) })),
    })
    await audit(req, 'MFA_ENROLMENT_STARTED', req.auth.userId, {}, companyId)
  })

  return res.json({
    secret,
    otpauthUri: buildOtpauthUri(req.auth.user?.email || '', secret),
    recoveryCodes: codes,
  })
})

authRouter.post('/mfa/confirm', requireAuth, async (req, res) => {
  const body = mfaVerifySchema.parse(req.body)
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const credential = await withTenant({ companyId }, () =>
    db.mfaCredential.findFirst({ where: { companyId, userId: req.auth.userId, type: 'TOTP', enabled: false } })
  )
  if (!credential) return res.status(400).json({ error: 'Start MFA enrolment first' })
  if (!verifyTotpCode(decryptString(credential.secretEncrypted), body.code)) {
    return res.status(400).json({ error: 'Invalid authentication code' })
  }
  await withTenant({ companyId, actorId: req.auth.userId }, async () => {
    await db.mfaCredential.update({ where: { id: credential.id }, data: { enabled: true, confirmedAt: new Date() } })
    await db.user.update({ where: { id: req.auth.userId }, data: { mfaEnabled: true } })
    await audit(req, 'MFA_ENABLED', req.auth.userId, {}, companyId)
  })
  return res.json({ message: 'Multi-factor authentication enabled.' })
})

authRouter.post('/mfa/disable', requireAuth, async (req, res) => {
  const body = mfaVerifySchema.parse(req.body)
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const credential = await withTenant({ companyId }, () =>
    db.mfaCredential.findFirst({ where: { companyId, userId: req.auth.userId, type: 'TOTP', enabled: true } })
  )
  if (!credential || !verifyTotpCode(decryptString(credential.secretEncrypted), body.code)) {
    return res.status(400).json({ error: 'Invalid authentication code' })
  }
  await withTenant({ companyId, actorId: req.auth.userId }, async () => {
    await db.mfaCredential.update({ where: { id: credential.id }, data: { enabled: false } })
    await db.recoveryCode.deleteMany({ where: { companyId, userId: req.auth.userId } })
    await db.user.update({ where: { id: req.auth.userId }, data: { mfaEnabled: false } })
    await audit(req, 'MFA_DISABLED', req.auth.userId, {}, companyId)
  })
  return res.json({ message: 'Multi-factor authentication disabled.' })
})

// ---------------------------------------------------------------- identity

authRouter.get('/me', requireAuth, async (req, res) => {
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const user = await withTenant({ companyId }, () =>
    db.user.findFirst({ where: { id: req.auth.userId, companyId } })
  )
  if (!user) return res.status(401).json({ error: 'Account not found' })
  const roles = req.auth.roles?.length ? req.auth.roles : await rolesFor(user)
  return res.json({
    user: { ...toPublicUser(user), roles, branchId: user.branchId || null, mfaEnabled: user.mfaEnabled },
    roles,
    sessionId: req.auth.sessionId || null,
  })
})

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = changePasswordSchema.parse(req.body)
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const user = await withTenant({ companyId }, () =>
    db.user.findFirst({ where: { id: req.auth.userId, companyId } })
  )
  if (!user || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: 'Current password is incorrect' })
  }
  let hash
  try {
    await assertPasswordAllowed(body.newPassword, await previousHashes(user))
    hash = await hashPassword(body.newPassword)
  } catch (error) {
    return policyError(res, error)
  }
  await withTenant({ companyId, actorId: user.id }, async () => {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, passwordChangedAt: new Date(), resetTokenHash: null, resetTokenExp: null },
    })
    await rememberPassword(user, hash)
    await db.session.updateMany({ where: { companyId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(req, 'PASSWORD_CHANGED', user.id, {}, companyId)
  })
  clearRefreshCookie(res)
  return res.json({ message: 'Password updated. Please sign in again.' })
})

// ---------------------------------------------------------------- sessions

authRouter.get('/sessions', requireAuth, async (req, res) => {
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const sessions = await withTenant({ companyId }, () =>
    db.session.findMany({
      where: { companyId, userId: req.auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })
  )
  return res.json({ sessions: sessions.map((s) => toPublicSession(s, req.auth.sessionId)) })
})

async function revokeOwnSession(req, res, sessionId) {
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  const session = await withTenant({ companyId }, () =>
    db.session.findFirst({ where: { id: sessionId, companyId, userId: req.auth.userId, revokedAt: null } })
  )
  if (!session) return res.status(404).json({ error: 'Session not found' })
  await withTenant({ companyId, actorId: req.auth.userId }, async () => {
    await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
    await emitEvent('SessionRevoked', { userId: req.auth.userId, sessionId: session.id, reason: 'user-revoked' })
    await audit(req, 'SESSION_REVOKED', session.id, {}, companyId)
  })
  if (session.id === req.auth.sessionId) clearRefreshCookie(res)
  return res.json({ message: 'Session revoked.' })
}

authRouter.post('/sessions/:id/revoke', requireAuth, async (req, res) => revokeOwnSession(req, res, req.params.id))

authRouter.post('/sessions/revoke-others', requireAuth, async (req, res) => {
  const companyId = req.auth.companyId || DEFAULT_COMPANY_ID
  await withTenant({ companyId, actorId: req.auth.userId }, async () => {
    const sessions = await db.session.findMany({
      where: { companyId, userId: req.auth.userId, revokedAt: null, id: { not: req.auth.sessionId || '' } },
      select: { id: true },
    })
    for (const session of sessions) {
      await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
      await emitEvent('SessionRevoked', { userId: req.auth.userId, sessionId: session.id, reason: 'revoke-others' })
    }
    await audit(req, 'SESSIONS_REVOKED', req.auth.userId, { count: sessions.length }, companyId)
  })
  return res.json({ message: 'Other sessions revoked.' })
})

authRouter.post('/refresh', async (req, res) => {
  const raw = getRefreshCookie(req)
  const rotated = await rotateSession(raw, req)
  if (!rotated) {
    clearRefreshCookie(res)
    return res.status(401).json({ error: 'Refresh token expired. Sign in again.' })
  }
  const user = await withTenant({ companyId: rotated.session.companyId }, () =>
    db.user.findFirst({ where: { id: rotated.session.userId, companyId: rotated.session.companyId } })
  )
  if (!user) return res.status(401).json({ error: 'Account not found' })
  setRefreshCookie(res, rotated.raw)
  const roles = rotated.session.roles?.length ? rotated.session.roles : await rolesFor(user)
  return res.json({
    token: signAccessToken(user, rotated.session, req.correlationId),
    user: { ...toPublicUser(user), roles, branchId: user.branchId || null },
    sessionId: rotated.session.id,
  })
})

authRouter.post('/logout', async (req, res) => {
  const raw = getRefreshCookie(req)
  const sessionId = req.auth?.sessionId || null
  await withTenant({ companyId: req.auth?.companyId || DEFAULT_COMPANY_ID }, async () => {
    if (raw) {
      const session = await db.session.findUnique({ where: { refreshTokenHash: sha256(raw) } })
      if (session) {
        await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
        await emitEvent('SessionRevoked', { userId: session.userId, sessionId: session.id, reason: 'logout' })
        await audit(req, 'LOGOUT', session.id, {}, session.companyId)
      }
    } else if (sessionId) {
      await db.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => {})
    }
  })
  clearRefreshCookie(res)
  return res.json({ message: 'Signed out.' })
})

// ---------------------------------------------------------------- password reset

authRouter.post('/forgot-password', async (req, res) => {
  const body = resetRequestSchema.parse(req.body)
  const user = await findUserByEmail(body.email)
  // Always respond the same, regardless of whether the email exists.
  if (user) await issuePasswordReset(user, req)
  return res.json({ message: 'If that email is registered, a reset link has been sent.' })
})

authRouter.post('/reset-password', async (req, res) => {
  const body = resetPasswordSchema.parse(req.body)
  const tokenHash = sha256(body.token)
  const user = await withTenant({ companyId: DEFAULT_COMPANY_ID }, () =>
    db.user.findFirst({ where: { companyId: DEFAULT_COMPANY_ID, resetTokenHash: tokenHash } })
  )
  if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' })
  }
  let hash
  try {
    await assertPasswordAllowed(body.password, await previousHashes(user))
    hash = await hashPassword(body.password)
  } catch (error) {
    return policyError(res, error)
  }
  await withTenant({ companyId: user.companyId, actorId: user.id }, async () => {
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hash, passwordChangedAt: new Date(), resetTokenHash: null, resetTokenExp: null, failedLoginAttempts: 0, lockoutUntil: null },
    })
    await rememberPassword(user, hash)
    await db.session.updateMany({ where: { companyId: user.companyId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    await audit(req, 'PASSWORD_RESET_COMPLETED', user.id, {}, user.companyId)
  })
  return res.json({ message: 'Password updated. You can now sign in.' })
})

// ---------------------------------------------------------------- OIDC

authRouter.get('/oidc/start', (req, res) => {
  if (!isOidcConfigured()) {
    return res.status(503).json({ error: 'Single sign-on is not configured' })
  }
  const { state, nonce, token } = createOidcState()
  res.cookie('comet_oidc_state', token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  })
  return getAuthorizationUrl({ state, nonce })
    .then((url) => res.redirect(url))
    .catch(() => res.status(502).json({ error: 'Identity provider unavailable' }))
})

authRouter.post('/oidc/callback', async (req, res) => {
  if (!isOidcConfigured()) {
    return res.status(503).json({ error: 'Single sign-on is not configured' })
  }
  const body = oidcCallbackSchema.parse(req.body)
  const stateCookie = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('comet_oidc_state='))
    ?.split('=')
    .slice(1)
    .join('=')
  if (!stateCookie) return res.status(400).json({ error: 'OIDC state cookie missing' })

  let stateClaims
  try {
    stateClaims = verifyOidcState(decodeURIComponent(stateCookie))
  } catch {
    return res.status(400).json({ error: 'OIDC state expired' })
  }
  if (stateClaims.state !== body.state) {
    return res.status(400).json({ error: 'OIDC state mismatch' })
  }
  res.clearCookie('comet_oidc_state', { path: '/api/auth' })

  try {
    const tokens = await exchangeCode(body.code)
    const claims = await verifyIdToken(tokens.id_token, stateClaims.nonce)
    const email = String(claims.email || '').toLowerCase()
    if (!email || claims.email_verified === false) {
      return res.status(401).json({ error: 'Verified email is required for single sign-on' })
    }

    let user = await withTenant({ companyId: DEFAULT_COMPANY_ID }, () =>
      db.user.findFirst({
        where: {
          companyId: DEFAULT_COMPANY_ID,
          OR: [
            { email },
            { identityProvider: 'oidc', externalId: String(claims.sub) },
          ],
        },
      })
    )
    if (user && user.identityProvider === 'local') {
      return res.status(409).json({ error: 'This email uses local sign-in. Sign in with your password first.' })
    }
    if (!user) {
      const randomHash = await hashPassword(crypto.randomUUID())
      user = await withTenant({ companyId: DEFAULT_COMPANY_ID }, () =>
        db.user.create({
          data: {
            companyId: DEFAULT_COMPANY_ID,
            email,
            passwordHash: randomHash,
            firstName: String(claims.given_name || claims.name || 'OIDC').slice(0, 80),
            lastName: String(claims.family_name || 'User').slice(0, 80),
            role: 'STAFF',
            status: 'ACTIVE',
            identityProvider: 'oidc',
            externalId: String(claims.sub),
          },
        })
      )
      await withTenant({ companyId: DEFAULT_COMPANY_ID, actorId: user.id }, async () => {
        await emitEvent('UserCreated', { userId: user.id, email: user.email, branchId: null })
        await audit(req, 'USER_CREATED', user.id, { provider: 'oidc' })
      })
    }
    if (user.status !== 'ACTIVE') return res.status(403).json({ error: 'This account is not active' })
    return completeSignIn(user, req, res)
  } catch {
    return res.status(502).json({ error: 'Single sign-on verification failed' })
  }
})
