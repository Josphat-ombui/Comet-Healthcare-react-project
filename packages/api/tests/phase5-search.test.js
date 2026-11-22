import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canSeeProjection } from '../lib/search.js'

const base = {
  id: 'doc_1',
  entityType: 'DOCUMENT',
  entityId: 'doc_1',
  title: 'Quotation',
  classification: 'INTERNAL',
  branchId: null,
  allowedUserIds: null,
  allowedRoleCodes: null,
}

test('organisation-wide projections are visible to any caller', () => {
  assert.equal(canSeeProjection(base, { userId: 'u_1', roles: ['STAFF'], branchIds: ['b_1'] }), true)
  assert.equal(canSeeProjection({ ...base, allowedUserIds: [], allowedRoleCodes: [] }, {
    userId: 'u_1', roles: [], branchIds: [],
  }), true)
})

test('explicit user and role allow lists grant and deny access', () => {
  const userDoc = { ...base, allowedUserIds: ['u_1'], allowedRoleCodes: null }
  assert.equal(canSeeProjection(userDoc, { userId: 'u_1', roles: ['STAFF'] }), true)
  assert.equal(canSeeProjection(userDoc, { userId: 'u_2', roles: ['ADMIN'] }), false)

  const roleDoc = { ...base, allowedUserIds: null, allowedRoleCodes: ['COMPLIANCE'] }
  assert.equal(canSeeProjection(roleDoc, { userId: 'u_2', roles: ['STAFF', 'COMPLIANCE'] }), true)
  assert.equal(canSeeProjection(roleDoc, { userId: 'u_2', roles: ['STAFF'] }), false)
})

test('branch scope excludes other branches unless privileged or allBranches', () => {
  const branchDoc = { ...base, branchId: 'b_2' }
  assert.equal(canSeeProjection(branchDoc, { userId: 'u_1', roles: ['STAFF'], branchIds: ['b_1'] }), false)
  assert.equal(canSeeProjection(branchDoc, { userId: 'u_1', roles: ['STAFF'], branchIds: ['b_2'] }), true)
  assert.equal(canSeeProjection(branchDoc, { userId: 'u_1', roles: ['ADMIN'], branchIds: [] }), true)
  assert.equal(canSeeProjection(branchDoc, {
    userId: 'u_1', roles: ['STAFF'], branchIds: [], allBranches: true,
  }), true)
})

test('restricted projections require an explicit includeRestricted flag', () => {
  const restricted = { ...base, classification: 'RESTRICTED' }
  assert.equal(canSeeProjection(restricted, { userId: 'u_1', roles: ['ADMIN'], branchIds: [] }), false)
  assert.equal(canSeeProjection(restricted, {
    userId: 'u_1', roles: ['COMPLIANCE'], branchIds: [], includeRestricted: true,
  }), true)
})
