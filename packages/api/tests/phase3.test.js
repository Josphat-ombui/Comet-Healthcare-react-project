import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PASSWORD_POLICY } from '../../shared/src/identity.js'
import { PERMISSIONS, hasPermission } from '../../shared/src/permissions.js'
import { computeAuditHash } from '../lib/audit.js'
import { validatePasswordPolicy } from '../lib/password.js'
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, totpCode, verifyTotpCode } from '../lib/totp.js'
import { createOidcState, verifyOidcState } from '../lib/oidc.js'

test('TOTP codes verify within the clock window and reject incorrect values', () => {
  const secret = generateTotpSecret()
  const code = totpCode(secret)
  assert.match(code, /^\d{6}$/)
  assert.equal(verifyTotpCode(secret, code), true)
  assert.equal(verifyTotpCode(secret, '000000'), false)
  assert.equal(verifyTotpCode(secret, '12345'), false)
})

test('recovery codes are unique and hashed for storage', () => {
  const codes = generateRecoveryCodes()
  assert.equal(codes.length, 10)
  assert.equal(new Set(codes).size, 10)
  const normalized = codes[0].replace(/[^A-Z0-9]/g, '').toUpperCase()
  assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(normalized))
})

test('password policy enforces complexity and reuse rules', () => {
  assert.deepEqual(validatePasswordPolicy('S3cureP@ssword!'), [])
  const errors = validatePasswordPolicy('weakpass')
  assert.ok(errors.some((error) => error.includes('uppercase')))
  assert.ok(errors.some((error) => error.includes('digit')))
  assert.equal(PASSWORD_POLICY.historyLimit, 5)
})

test('audit hash chain is deterministic and changes with content', () => {
  const body = { actorId: 'u_1', action: 'LOGIN_SUCCESS', resourceId: 'u_1' }
  const first = computeAuditHash('GENESIS', body)
  assert.equal(first, computeAuditHash('GENESIS', body))
  assert.notEqual(first, computeAuditHash('GENESIS', { ...body, actorId: 'u_2' }))
  assert.notEqual(first, computeAuditHash('OTHER', body))
})

test('OIDC state token round-trips and is scoped', () => {
  const { state, nonce, token } = createOidcState()
  const claims = verifyOidcState(token)
  assert.equal(claims.state, state)
  assert.equal(claims.nonce, nonce)
  assert.equal(claims.scope, 'oidc')
})

test('role permission catalogue covers identity and audit actions', () => {
  assert.ok(PERMISSIONS['identity.user.write'])
  assert.ok(PERMISSIONS['audit.verify'])
  assert.equal(hasPermission(['ADMIN'], 'identity.user.write'), true)
  assert.equal(hasPermission(['STAFF'], 'identity.user.write'), false)
})
