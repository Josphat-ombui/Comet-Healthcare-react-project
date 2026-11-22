import { test } from 'node:test'
import assert from 'node:assert/strict'
import { documentDownloadName, toFileDto } from '../lib/files.js'

test('documentDownloadName strips path separators and keeps the pdf extension', () => {
  assert.equal(documentDownloadName('QUO-2026-0001.pdf', 'application/pdf'), 'QUO-2026-0001.pdf')
  assert.equal(documentDownloadName('../../QUO-2026-0001.pdf', 'application/pdf'), 'QUO-2026-0001.pdf')
  assert.equal(documentDownloadName('..\\..\\QUO-2026-0001.pdf', 'application/pdf'), 'QUO-2026-0001.pdf')
  assert.equal(documentDownloadName('INV/2026/0001', 'application/pdf'), 'INV_2026_0001.pdf')
  assert.equal(documentDownloadName('PFI-2026-0001.PDF', 'application/pdf'), 'PFI-2026-0001.PDF')
  for (const name of ['QUO-2026-0001.pdf', '../../QUO-2026-0001.pdf', 'INV/2026/0001']) {
    const safe = documentDownloadName(name, 'application/pdf')
    assert.ok(!safe.includes('/') && !safe.includes('\\'))
    assert.match(safe, /\.pdf$/i)
  }
})

test('stored document FileObject DTO never exposes the object key or checksum', () => {
  const dto = toFileDto({
    id: 'fil_doc',
    companyId: 'cmp_comet',
    branchId: null,
    uploadedById: 'u_generator',
    name: 'QUO-2026-0001.pdf',
    objectKey: 'documents/cmp_comet/2026/uuid.pdf',
    mimeType: 'application/pdf',
    size: 51200,
    checksum: 'secret-digest',
    classification: 'INTERNAL',
    status: 'CLEAN',
    storageProvider: 'LOCAL',
    version: 1,
    purpose: 'DOCUMENT',
    folder: 'documents',
    deletedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  assert.equal(dto.purpose, 'DOCUMENT')
  assert.equal(Object.hasOwn(dto, 'objectKey'), false)
  assert.equal(Object.hasOwn(dto, 'checksum'), false)
  assert.equal(Object.hasOwn(dto, 'companyId'), false)
})
