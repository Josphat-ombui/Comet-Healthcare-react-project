import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import {
  hashPassword,
  verifyPassword,
  signToken,
  createResetToken,
  sha256,
  requireRole,
} from '../lib/auth.js'
import { config } from '../lib/config.js'

test('password hashing verifies correctly and different passwords fail', async () => {
  const hash = await hashPassword('S3cureP@ss!')
  assert.notEqual(hash, 'S3cureP@ss!')
  assert.equal(await verifyPassword('S3cureP@ss!', hash), true)
  assert.equal(await verifyPassword('wrong', hash), false)
})

test('auth token signs and verifies with role payload', () => {
  const token = signToken({ id: 'u_1', role: 'ADMIN' })
  const payload = jwt.verify(token, config.jwtSecret)
  assert.equal(payload.sub, 'u_1')
  assert.equal(payload.role, 'ADMIN')
})

test('reset token is opaque and only its hash is stored', () => {
  const { raw, hash, expiresAt } = createResetToken()
  assert.ok(raw.length >= 32)
  assert.equal(hash, sha256(raw))
  assert.equal(hash, sha256(raw)) // deterministic
  assert.ok(expiresAt > new Date())
  assert.notEqual(raw, hash)
})

test('sha256 is stable', () => {
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('requireRole blocks unauthenticated and wrong-role requests', async () => {
  const middleware = requireRole('ADMIN')
  const next = () => {}
  let status = null
  const res = { status(code) { status = code; return this }, json() {} }

  // No auth context
  await middleware({ auth: undefined }, res, next)
  assert.equal(status, 403)

  // Wrong role
  await middleware({ auth: { userId: 'x', role: 'PATIENT' } }, res, next)
  assert.equal(status, 403)

  // Authorized — should call next, not set 403
  status = null
  let called = false
  const middleware2 = requireRole('ADMIN')
  await middleware2({ auth: { userId: 'x', role: 'ADMIN' } }, { status() { status = 403; return this }, json() {} }, () => { called = true })
  assert.equal(called, true)
  assert.equal(status, null)
})