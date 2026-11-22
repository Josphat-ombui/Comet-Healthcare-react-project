import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  nextStep, resolveAssigneeIds, parseSteps,
} from '../lib/workflow.js'

const steps = [
  { key: 'request', label: 'Request', assigneeRole: 'STAFF', requireReason: false },
  { key: 'review', label: 'Review', assigneeRole: 'MANAGER', requireReason: true },
  { key: 'approve', label: 'Final approval', assigneeRole: 'ADMIN', requireReason: false },
]

test('nextStep follows linear progression and stops at the last step', () => {
  assert.equal(nextStep(steps, 'request').key, 'review')
  assert.equal(nextStep(steps, 'review').key, 'approve')
  assert.equal(nextStep(steps, 'approve'), null)
  assert.equal(nextStep(steps, 'unknown'), null)
  assert.equal(nextStep(JSON.stringify(steps), 'request').key, 'review')
  assert.deepEqual(parseSteps('not json'), [])
})

test('resolveAssigneeIds honours an explicit user over roles', () => {
  const users = [
    { id: 'u_staff', role: 'STAFF', status: 'ACTIVE' },
    { id: 'u_manager', role: 'MANAGER', status: 'ACTIVE' },
  ]
  assert.deepEqual(
    resolveAssigneeIds({ assigneeUserId: 'u_direct', assigneeRole: 'MANAGER' }, users),
    ['u_direct']
  )
})

test('resolveAssigneeIds resolves by role enum and falls back to ADMIN', () => {
  const users = [
    { id: 'u_admin_1', role: 'ADMIN', status: 'ACTIVE' },
    { id: 'u_manager', role: 'MANAGER', status: 'ACTIVE' },
    { id: 'u_manager_2', role: 'MANAGER', status: 'ACTIVE' },
    { id: 'u_staff', role: 'STAFF', status: 'ACTIVE' },
    { id: 'u_disabled', role: 'MANAGER', status: 'DISABLED' },
  ]
  assert.deepEqual(resolveAssigneeIds({ assigneeRole: 'MANAGER' }, users), ['u_manager', 'u_manager_2'])
  assert.deepEqual(resolveAssigneeIds({ assigneeRole: 'RECRUITER' }, users), ['u_admin_1'])
  assert.deepEqual(resolveAssigneeIds({}, users), ['u_admin_1'])
  assert.deepEqual(resolveAssigneeIds({}, []), [])
})
