import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canReadFile, toFileDto } from '../lib/files.js'

function fakeFile(overrides = {}) {
  return {
    id: 'fil_1',
    companyId: 'cmp_comet',
    branchId: 'br_hq',
    uploadedById: 'u_owner',
    name: 'report.pdf',
    objectKey: 'files/cmp_comet/2026/abc.pdf',
    mimeType: 'application/pdf',
    size: 2048,
    checksum: 'sha256-secret',
    classification: 'INTERNAL',
    status: 'CLEAN',
    storageProvider: 'LOCAL',
    version: 1,
    folder: null,
    purpose: 'GENERAL',
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function actor(userId, roles, branchIds = []) {
  return { userId, companyId: 'cmp_comet', roles, branchIds }
}

test('canReadFile allows the uploader, admins, compliance and same-branch peers', () => {
  const file = fakeFile()
  assert.equal(canReadFile(file, actor('u_owner', ['STAFF'], ['br_hq'])), true)
  assert.equal(canReadFile(file, actor('u_admin', ['ADMIN'], [])), true)
  assert.equal(canReadFile(file, actor('u_compliance', ['COMPLIANCE'], [])), true)
  assert.equal(canReadFile(file, actor('u_peer', ['STAFF'], ['br_hq'])), true)
})

test('canReadFile denies cross-branch users, anonymous access and deleted files', () => {
  const file = fakeFile()
  assert.equal(canReadFile(file, actor('u_other', ['STAFF'], ['br_plant'])), false)
  assert.equal(canReadFile(file, actor('u_none', ['STAFF'], [])), false)
  assert.equal(canReadFile(file, null), false)
  assert.equal(canReadFile(fakeFile({ deletedAt: new Date().toISOString() }), actor('u_owner', ['STAFF'], ['br_hq'])), false)
  assert.equal(canReadFile(fakeFile({ deletedAt: new Date().toISOString() }), actor('u_admin', ['ADMIN'])), false)
})

test('toFileDto exposes only public fields and never storage or tenant internals', () => {
  const dto = toFileDto(fakeFile())
  assert.deepEqual(Object.keys(dto).sort(), [
    'id', 'name', 'mimeType', 'size', 'classification', 'status', 'version',
    'purpose', 'folder', 'createdAt', 'updatedAt', 'uploadedBy',
  ].sort())
  assert.equal(dto.uploadedBy, 'u_owner')
  const json = JSON.stringify(dto)
  assert.ok(!json.includes('objectKey'))
  assert.ok(!json.includes('checksum'))
  assert.ok(!json.includes('cmp_comet'))
  assert.ok(!json.includes('files/cmp_comet'))
})
