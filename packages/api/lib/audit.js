// Append-only audit trail with SHA-256 hash chaining. The database rules added
// in Phase 2 prevent UPDATE/DELETE, so this is tamper-evident as well as
// append-only. Restricted field names are redacted before anything is written.

import { sha256 } from './auth.js'
import { db, getTenantContext } from './tenant.js'

const REDACTED_KEYS = new Set([
  'password', 'passwordHash', 'currentPassword', 'newPassword', 'token', 'accessToken',
  'refreshToken', 'resetToken', 'secret', 'secretEncrypted', 'otp', 'code', 'authorization',
  'apiKey', 'keyHash', 'recoveryCode', 'recoveryCodes',
])

// PostgreSQL jsonb normalises object key order. Canonicalise before hashing so
// verification is stable across a database round-trip.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
  }
  return value
}

function stableStringify(value) {
  return JSON.stringify(canonical(value))
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        REDACTED_KEYS.has(key) ? '[REDACTED]' : redact(item),
      ])
    )
  }
  return value
}

export async function recordAudit(input) {
  const ctx = getTenantContext() || {}
  const companyId = input.companyId || ctx.companyId
  if (!companyId) throw new Error('Audit write requires tenant context')

  const previous = await db.auditLog.findFirst({
    where: { companyId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { hash: true },
  })
  const previousHash = previous?.hash || 'GENESIS'
  const body = {
    actorId: input.actorId ?? ctx.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: String(input.resourceId),
    metadata: input.metadata ? redact(input.metadata) : null,
    correlationId: input.correlationId || ctx.correlationId || null,
    previousHash,
    ipAddress: input.ipAddress || null,
    userAgent: input.userAgent ? String(input.userAgent).slice(0, 300) : null,
  }
  const hash = sha256(`${previousHash}|${stableStringify(body)}`)
  return db.auditLog.create({
    data: {
      companyId,
      ...body,
      hash,
      createdAt: new Date(),
    },
  })
}

/** Convenience wrapper for HTTP handlers. */
export async function recordRequestAudit(req, input) {
  const ctx = getTenantContext() || {}
  return recordAudit({
    companyId: input.companyId || ctx.companyId,
    actorId: req.auth?.userId ?? ctx.actorId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: String(input.resourceId),
    metadata: input.metadata,
    correlationId: req.correlationId,
    ipAddress: (req.ip || req.socket?.remoteAddress || '').slice(0, 64) || null,
    userAgent: req.headers?.['user-agent'] || null,
  })
}

export function computeAuditHash(previousHash, body) {
  return sha256(`${previousHash}|${stableStringify(body)}`)
}

export async function verifyAuditChain(companyId, limit = 2000) {
  const entries = await db.auditLog.findMany({
    where: { companyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: limit,
  })
  let previousHash = 'GENESIS'
  let brokenAt = null
  for (const entry of entries) {
    const body = {
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      metadata: entry.metadata,
      correlationId: entry.correlationId,
      previousHash,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    }
    const expected = computeAuditHash(previousHash, body)
    if (entry.hash !== expected || entry.previousHash !== previousHash) {
      brokenAt = entry.id
      break
    }
    previousHash = entry.hash
  }
  return { checked: entries.length, valid: brokenAt === null, brokenAt }
}
