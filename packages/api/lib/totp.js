// RFC 6238 TOTP and recovery codes. No new dependency: HMAC-SHA1 from node:crypto.
// Secrets are generated here and stored encrypted by lib/crypto.js.

import crypto from 'node:crypto'
import { MFA_POLICY } from '../../shared/src/identity.js'
import { sha256 } from './auth.js'

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31]
  return out
}

function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const char of clean) {
    const index = BASE32.indexOf(char)
    if (index < 0) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20))
}

export function buildOtpauthUri(email, secret, issuer = MFA_POLICY.issuer) {
  const label = encodeURIComponent(`${issuer}:${email}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(MFA_POLICY.digits),
    period: String(MFA_POLICY.periodSeconds),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

export function totpCode(secret, counter = Math.floor(Date.now() / (MFA_POLICY.periodSeconds * 1000))) {
  const key = base32Decode(secret)
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const hmac = crypto.createHmac('sha1', key).update(buffer).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return String(binary % 10 ** MFA_POLICY.digits).padStart(MFA_POLICY.digits, '0')
}

export function verifyTotpCode(secret, code, window = MFA_POLICY.window) {
  if (!/^\d{6}$/.test(String(code || ''))) return false
  const current = Math.floor(Date.now() / (MFA_POLICY.periodSeconds * 1000))
  for (let delta = -window; delta <= window; delta += 1) {
    const expected = totpCode(secret, current + delta)
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(code)))) return true
  }
  return false
}

export function generateRecoveryCodes(count = MFA_POLICY.recoveryCodeCount) {
  return Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(10).toString('hex').toUpperCase()
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15)}`
  })
}

export function hashRecoveryCode(code) {
  return sha256(String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''))
}
