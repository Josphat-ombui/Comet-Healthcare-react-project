// Password policy: complexity, reuse prevention, and HIBP k-anonymity breach check.
// Only the first five characters of a SHA-1 digest ever leave the server, and
// the plaintext password is never logged or stored in an event.

import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { PASSWORD_POLICY, isBreachedPassword } from '../../shared/src/identity.js'
import { config } from './config.js'

export class PasswordPolicyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PasswordPolicyError'
    this.status = 400
  }
}

export function validatePasswordPolicy(password) {
  const errors = []
  const value = String(password || '')
  if (value.length < PASSWORD_POLICY.minLength) errors.push(`Password must be at least ${PASSWORD_POLICY.minLength} characters`)
  if (value.length > PASSWORD_POLICY.maxLength) errors.push(`Password must be at most ${PASSWORD_POLICY.maxLength} characters`)
  if (PASSWORD_POLICY.requireUpper && !/[A-Z]/.test(value)) errors.push('Password must include an uppercase letter')
  if (PASSWORD_POLICY.requireLower && !/[a-z]/.test(value)) errors.push('Password must include a lowercase letter')
  if (PASSWORD_POLICY.requireDigit && !/\d/.test(value)) errors.push('Password must include a digit')
  if (PASSWORD_POLICY.requireSymbol && !/[^A-Za-z0-9]/.test(value)) errors.push('Password must include a symbol')
  return errors
}

export async function checkPasswordBreach(password) {
  const digest = crypto.createHash('sha1').update(String(password)).digest('hex').toUpperCase()
  const prefix = digest.slice(0, 5)
  const suffix = digest.slice(5)
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'User-Agent': 'Comet Healthcare password policy' },
      signal: AbortSignal.timeout(1500),
    })
    if (!response.ok) return { breached: false, count: 0, unavailable: true }
    const lines = (await response.text()).split(/\r?\n/)
    const match = lines.find((line) => line.startsWith(suffix))
    const count = match ? Number.parseInt(match.split(':')[1], 10) : 0
    return { breached: isBreachedPassword(count), count, unavailable: false }
  } catch {
    // Offline/dev environments keep working unless enforcement is explicitly on.
    return { breached: false, count: 0, unavailable: true }
  }
}

export async function assertPasswordAllowed(password, previousHashes = []) {
  const policyErrors = validatePasswordPolicy(password)
  if (policyErrors.length) throw new PasswordPolicyError(policyErrors[0])

  for (const hash of previousHashes.slice(0, PASSWORD_POLICY.historyLimit)) {
    if (hash && (await bcrypt.compare(String(password), hash))) {
      throw new PasswordPolicyError(`Password must not repeat the last ${PASSWORD_POLICY.historyLimit} passwords`)
    }
  }

  const breach = await checkPasswordBreach(password)
  if (config.password.enforceBreach && breach.unavailable) {
    throw new PasswordPolicyError('Password breach list is unavailable; try again later')
  }
  if (breach.breached) {
    if (config.password.enforceBreach) throw new PasswordPolicyError('This password appears in a known breach list')
    return { breach, warning: 'breached-password-not-enforced' }
  }
  return { breach, warning: null }
}
