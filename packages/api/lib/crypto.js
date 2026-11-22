// AES-256-GCM helpers for restricted columns (MFA secrets, legal-hold reasons).
// The key comes from OBJECT_ENCRYPTION_KEY (base64, 32 bytes). The development
// fallback is intentionally obvious so it is never mistaken for production.

import crypto from 'node:crypto'
import { config } from './config.js'

function key() {
  const raw = config.objectEncryptionKey
  if (!raw || raw.startsWith('replace-with')) {
    return crypto.createHash('sha256').update('comet-dev-only-encryption-key').digest()
  }
  const decoded = Buffer.from(raw, 'base64')
  if (decoded.length !== 32) {
    throw new Error('OBJECT_ENCRYPTION_KEY must be base64-encoded 32 bytes')
  }
  return decoded
}

export function encryptString(plain) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`
}

export function decryptString(payload) {
  if (typeof payload !== 'string' || !payload.startsWith('v1.')) {
    throw new Error('Unsupported encrypted value')
  }
  const [, ivPart, tagPart, dataPart] = payload.split('.')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivPart, 'base64'))
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64')), decipher.final()]).toString('utf8')
}

// Binary variant used by the encrypted local object store. The envelope is
// `v1.<iv>.<tag>.<ciphertext>` so a wrong key or tampered bytes fail loudly.
export function encryptBuffer(buffer) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()])
  return Buffer.concat([
    Buffer.from(`v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.`, 'utf8'),
    encrypted,
  ])
}

export function decryptBuffer(payload) {
  const parts = payload.toString('utf8').split('.')
  if (parts[0] !== 'v1' || parts.length < 4) throw new Error('Unsupported encrypted object')
  const iv = Buffer.from(parts[1], 'base64')
  const tag = Buffer.from(parts[2], 'base64')
  // The base64 envelope is ASCII; everything after the third dot is ciphertext.
  const marker = `${parts[0]}.${parts[1]}.${parts[2]}.`
  const encrypted = payload.subarray(Buffer.byteLength(marker, 'utf8'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

// Short-lived HMAC tokens let the local fallback expose upload/download URLs
// without turning the object store into a public filesystem.
function storageKey() {
  return crypto.createHash('sha256').update(`comet-storage:${config.jwtSecret}`).digest()
}

export function signStorageToken(payload, ttlSeconds = 15 * 60) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString('base64url')
  const sig = crypto.createHmac('sha256', storageKey()).update(body).digest('base64url')
  return `${body}.${sig}`
}

export function verifyStorageToken(token) {
  if (typeof token !== 'string') return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = crypto.createHmac('sha256', storageKey()).update(body).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.exp || payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}
