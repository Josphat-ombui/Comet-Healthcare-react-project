import { test } from 'node:test'
import assert from 'node:assert/strict'
import jwt from 'jsonwebtoken'
import { config } from '../lib/config.js'
import { signRealtimeToken } from '../lib/session.js'
import { DlpViolationError, enforceDlp } from '../lib/dlp.js'
import { findingTypes, inspectText, redactText } from '../../shared/src/dlp.js'
import { DomainEventSchemas, MessageSentDataSchema, parseEventEnvelope } from '../../shared/src/events.js'
import { PERMISSIONS, hasPermission } from '../../shared/src/permissions.js'
import { verifyRealtimeToken } from '../../realtime/src/auth.js'
import { dispatchEvent } from '../../realtime/src/events.js'

test('DLP detects Luhn-valid card numbers, national IDs, KRA PINs and secrets', () => {
  const text = 'Card 4111 1111 1111 1111, ID 12345678, PIN P051234567X, key sk_live_abcdefghijklmnop'
  const types = findingTypes(inspectText(text))
  assert.deepEqual(types, ['CARD_NUMBER', 'KENYAN_NATIONAL_ID', 'KRA_PIN', 'SECRET'])
})

test('DLP ignores Luhn-invalid digit runs and masks every finding', () => {
  assert.deepEqual(inspectText('4111111111111112'), [])
  const redacted = redactText('Card 4111111111111111 and PIN P051234567X')
  assert.ok(!redacted.includes('4111111111111111'))
  assert.ok(!redacted.includes('P051234567X'))
  assert.match(redacted, /\[REDACTED:CARD_NUMBER\]/)
  assert.match(redacted, /\[REDACTED:KRA_PIN\]/)
})

test('DLP policy blocks by default and reports types without values', () => {
  assert.throws(
    () => enforceDlp({ body: 'my KRA PIN is P051234567X' }),
    (error) => error instanceof DlpViolationError && error.status === 422 && error.types.includes('KRA_PIN')
  )
  const clean = enforceDlp({ body: 'Please review the delivery schedule.' })
  assert.deepEqual(clean.types, [])
})

test('messaging event contracts carry IDs only and validate', () => {
  assert.deepEqual(Object.keys(MessageSentDataSchema.shape).sort(), [
    'channelId', 'classification', 'inboxId', 'messageId', 'recipientInboxIds',
    'recipientUserIds', 'threadId', 'visibility',
  ].sort())
  const envelope = parseEventEnvelope({
    id: 'evt_1', type: 'MessageSent', version: 1,
    occurredAt: new Date().toISOString(), correlationId: 'cor_1',
    companyId: 'cmp_comet', branchId: null, actorId: 'u_1',
    data: {
      messageId: 'msg_1', threadId: 'thr_1', inboxId: null, channelId: null,
      visibility: 'RECIPIENT', classification: 'INTERNAL',
      recipientUserIds: ['u_2'], recipientInboxIds: [],
    },
  })
  assert.equal(envelope.type, 'MessageSent')
  assert.ok(DomainEventSchemas.ThreadAssigned)
  assert.ok(DomainEventSchemas.MessageRecalled)
  assert.ok(DomainEventSchemas.ReactionAdded)
})

test('messaging permissions are granted by role without extending compliance reads', () => {
  for (const code of [
    'messaging.inbox.manage', 'messaging.thread.resolve', 'messaging.message.react',
    'messaging.message.edit', 'messaging.channel.read',
  ]) {
    assert.ok(PERMISSIONS[code], `missing permission ${code}`)
  }
  assert.equal(hasPermission(['STAFF'], 'messaging.message.send'), true)
  assert.equal(hasPermission(['STAFF'], 'messaging.inbox.manage'), false)
  assert.equal(hasPermission(['COMPLIANCE'], 'messaging.message.send'), false)
})

test('realtime tokens are scoped, tenant-bound and room-limited', () => {
  const token = signRealtimeToken(
    { userId: 'u_1', companyId: 'cmp_comet', branchIds: [], roles: ['STAFF'] },
    ['company:cmp_comet', 'company:cmp_comet:user:u_1']
  )
  const claims = verifyRealtimeToken(token)
  assert.equal(claims.scope, 'realtime')
  assert.deepEqual(claims.rooms, ['company:cmp_comet', 'company:cmp_comet:user:u_1'])

  const foreign = jwt.sign(
    { sub: 'u_1', companyId: 'cmp_comet', rooms: ['company:cmp_other:thread:x'], scope: 'realtime' },
    config.jwtSecret,
    { expiresIn: '5m' }
  )
  assert.throws(() => verifyRealtimeToken(foreign), /outside the token tenant/)

  const access = jwt.sign(
    { sub: 'u_1', companyId: 'cmp_comet', rooms: ['company:cmp_comet'], scope: 'access' },
    config.jwtSecret,
    { expiresIn: '5m' }
  )
  assert.throws(() => verifyRealtimeToken(access), /Invalid token scope/)
})

test('event relay fans out to thread and recipient rooms without message content', () => {
  const calls = []
  const io = { to: (room) => ({ emit: (event, payload) => calls.push({ room, event, payload }) }) }
  const emitted = dispatchEvent(io, {
    id: 'evt_2', type: 'MessageSent', version: 1, occurredAt: new Date().toISOString(),
    correlationId: 'cor_2', companyId: 'cmp_comet', branchId: null, actorId: 'u_1',
    data: {
      messageId: 'msg_2', threadId: 'thr_2', inboxId: null, channelId: null,
      visibility: 'RECIPIENT', classification: 'INTERNAL',
      recipientUserIds: ['u_2'], recipientInboxIds: ['inbox_1'],
    },
  })
  assert.equal(emitted, 3)
  assert.deepEqual(calls.map((call) => call.room).sort(), [
    'company:cmp_comet:inbox:inbox_1',
    'company:cmp_comet:thread:thr_2',
    'company:cmp_comet:user:u_2',
  ])
  assert.ok(calls.every((call) => call.event === 'message:new'))
  assert.ok(calls.every((call) => !('body' in call.payload.data)))
  assert.ok(calls.every((call) => !('subject' in call.payload.data)))
})
