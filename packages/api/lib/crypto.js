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
