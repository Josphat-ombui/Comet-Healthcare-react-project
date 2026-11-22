import assert from 'node:assert/strict'
import test from 'node:test'

import { decryptBuffer, encryptBuffer, signStorageToken, verifyStorageToken } from '../lib/crypto.js'
import { assertSafeKey, newObjectKey, verifyMagicNumber } from '../lib/object-storage.js'
import { DomainEventSchemas, parseEventEnvelope } from '../../shared/src/events.js'
import { dispatchEvent } from '../../realtime/src/events.js'

test('encrypted local object round-trips and rejects tampering', () => {
  const plain = Buffer.from('%PDF-1.7\ncomet healthcare\n')
  const encrypted = encryptBuffer(plain)
  assert.notDeepEqual(encrypted, plain)
  assert.deepEqual(decryptBuffer(encrypted), plain)
  encrypted[encrypted.length - 1] ^= 0xff
  assert.throws(() => decryptBuffer(encrypted))
})

test('storage tokens expire and cannot be tampered with', () => {
  const token = signStorageToken({ purpose: 'download', key: 'files/cmp_comet/a.pdf' }, 60)
  assert.equal(verifyStorageToken(token)?.key, 'files/cmp_comet/a.pdf')
  assert.equal(verifyStorageToken(`${token}x`), null)
  const expired = signStorageToken({ purpose: 'download', key: 'files/cmp_comet/a.pdf' }, -1)
  assert.equal(verifyStorageToken(expired), null)
})

test('object keys reject traversal and use safe prefixes', () => {
  assert.throws(() => assertSafeKey('../etc/passwd'))
  assert.throws(() => assertSafeKey('/absolute'))
  const key = newObjectKey('cmp_comet', 'report.pdf', 'documents')
  assert.match(key, /^documents\/cmp_comet\/\d{4}\/[a-f0-9-]+\.pdf$/)
  assert.doesNotThrow(() => assertSafeKey(key))
})

test('magic-number verification fails closed on MIME mismatches', () => {
  const pdf = Buffer.from('%PDF-1.7\n%%EOF')
  assert.equal(verifyMagicNumber(pdf, 'application/pdf').ok, true)
  assert.equal(verifyMagicNumber(pdf, 'image/png').ok, false)
  assert.equal(verifyMagicNumber(Buffer.from('hello'), 'application/pdf').ok, false)
  assert.equal(verifyMagicNumber(Buffer.from('hello'), 'text/plain').ok, true)
})

test('Phase 5 event envelopes validate and stay ID-only', () => {
  const data = {
    fileId: 'fil_1',
    uploadedById: 'usr_1',
    classification: 'CONFIDENTIAL',
    size: 12,
    entityType: 'FILE',
    entityId: 'fil_1',
  }
  DomainEventSchemas.FileUploaded.parse(data)
  assert.throws(() => DomainEventSchemas.FileUploaded.parse({ ...data, title: 'secret report' }))

  const envelope = parseEventEnvelope({
    id: 'evt_1',
    type: 'FileUploaded',
    version: 1,
    occurredAt: new Date().toISOString(),
    correlationId: 'cor_1',
    companyId: 'cmp_comet',
    data,
  })
  assert.equal(envelope.type, 'FileUploaded')
})

test('realtime maps shared events to user rooms without content', () => {
  const emitted = []
  const io = {
    to(room) {
      return { emit: (event, payload) => emitted.push({ room, event, payload }) }
    },
  }
  const count = dispatchEvent(io, {
    id: 'evt_1',
    type: 'NotificationCreated',
    occurredAt: new Date().toISOString(),
    correlationId: 'cor_1',
    companyId: 'cmp_comet',
    data: { notificationId: 'ntf_1', userId: 'usr_1', category: 'WORKFLOW', classification: 'INTERNAL', entityType: 'WORKFLOW', entityId: 'wfi_1' },
  })
  assert.equal(count, 1)
  assert.equal(emitted[0].room, 'company:cmp_comet:user:usr_1')
  assert.equal(emitted[0].event, 'notification:new')
  assert.equal(emitted[0].payload.data.title, undefined)
})
