// Phase 12 projects unit tests. Pure helpers, schemas, DTOs, events and socket
// routing only — no database or network calls. Cross-tenant RLS isolation is
// verified by the deployment probe in the implementation guide.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  isoDay, projectTenantWhere, roundHours, calculateTimeAmountCents,
  toProjectDto, toTimeEntryDto, toInvoiceSummary, toBudgetUsageDto,
  loadBudgetUsageForLinks,
  assertProjectTransition, assertMilestoneTransition, assertTaskTransition,
  assertTimeDecision,
} from '../lib/projects.js'
import {
  projectCreateSchema, projectUpdateSchema, projectTransitionSchema,
  projectQuerySchema, projectMilestoneCreateSchema, projectTaskCreateSchema,
  projectTimeCreateSchema, projectTimeDecisionSchema, projectTimeInvoiceSchema,
  projectBudgetLinkCreateSchema, projectTimeQuerySchema,
  PROJECT_MONEY_FIELDS,
} from '../lib/validation.js'
import {
  DomainEventSchemas, ProjectCreatedDataSchema, ProjectTaskCompletedDataSchema,
  MilestoneMetDataSchema, TimeEntryApprovedDataSchema,
} from '../../shared/src/events.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const today = '2026-11-23'

const projectBase = {
  name: 'Comet Delivery Programme',
  budgetCents: 5_000_000,
  classification: 'INTERNAL',
}

function assertDlpRejects(parse, finding) {
  let error
  try {
    parse()
  } catch (caught) {
    error = caught
  }
  assert.ok(error, 'restricted free text was accepted')
  assert.match(error.message, new RegExp(finding))
  // Findings report the type only — never the matched value.
  assert.equal(error.message.includes('4111111111111111'), false)
  assert.equal(error.message.includes('12345678'), false)
}

// ------------------------------------------------------------- date & tenant

test('project date parsing accepts only valid ISO calendar days', () => {
  assert.equal(isoDay(today), today)
  assert.equal(isoDay('2024-02-29'), '2024-02-29')
  assert.throws(() => isoDay('23-11-2026'), /Invalid Date/)
  assert.throws(() => isoDay('2026-02-30'), /Invalid Date/)
  assert.throws(() => isoDay('2026-2-03'), /Invalid Date/)
})

test('project tenant scope allows organisation-wide rows but never another company', () => {
  assert.deepEqual(projectTenantWhere('cmp_a', null), { companyId: 'cmp_a' })
  assert.deepEqual(projectTenantWhere('cmp_a', 'br_1'), {
    companyId: 'cmp_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(projectTenantWhere('cmp_a', 'br_1')).includes('cmp_b'), false)
})

// ----------------------------------------------------------- lifecycle guards

test('project lifecycle rejects skipped and terminal transitions', () => {
  assert.equal(assertProjectTransition('PLANNED', 'ACTIVE'), true)
  assert.equal(assertProjectTransition('ACTIVE', 'ON_HOLD'), true)
  assert.equal(assertProjectTransition('ON_HOLD', 'ACTIVE'), true)
  assert.equal(assertProjectTransition('ACTIVE', 'COMPLETED'), true)
  assert.throws(() => assertProjectTransition('PLANNED', 'COMPLETED'), /Cannot change project/)
  assert.throws(() => assertProjectTransition('COMPLETED', 'ACTIVE'), /Cannot change project/)
  assert.throws(() => assertProjectTransition('CANCELLED', 'PLANNED'), /Cannot change project/)
  assert.throws(() => assertProjectTransition('PLANNED', 'UNKNOWN'), /Cannot change project/)
})

test('milestone lifecycle rejects terminal reuse and invalid status names', () => {
  assert.equal(assertMilestoneTransition('PLANNED', 'IN_PROGRESS'), true)
  assert.equal(assertMilestoneTransition('IN_PROGRESS', 'MET'), true)
  assert.equal(assertMilestoneTransition('PLANNED', 'MISSED'), true)
  assert.throws(() => assertMilestoneTransition('PLANNED', 'DONE'), /Cannot change milestone/)
  assert.throws(() => assertMilestoneTransition('MET', 'IN_PROGRESS'), /Cannot change milestone/)
  assert.throws(() => assertMilestoneTransition('MISSED', 'MET'), /Cannot change milestone/)
})

test('task lifecycle requires IN_PROGRESS before DONE and blocks terminal changes', () => {
  assert.equal(assertTaskTransition('TODO', 'IN_PROGRESS'), true)
  assert.equal(assertTaskTransition('IN_PROGRESS', 'DONE'), true)
  assert.equal(assertTaskTransition('BLOCKED', 'IN_PROGRESS'), true)
  assert.throws(() => assertTaskTransition('TODO', 'DONE'), /Cannot change task/)
  assert.throws(() => assertTaskTransition('DONE', 'TODO'), /Cannot change task/)
  assert.throws(() => assertTaskTransition('CANCELLED', 'BLOCKED'), /Cannot change task/)
})

test('time decisions are only valid on DRAFT entries', () => {
  assert.equal(assertTimeDecision('DRAFT', 'APPROVE'), true)
  assert.equal(assertTimeDecision('DRAFT', 'REJECT'), true)
  assert.throws(() => assertTimeDecision('APPROVED', 'APPROVE'), /Cannot approve time/)
  assert.throws(() => assertTimeDecision('REJECTED', 'REJECT'), /Cannot reject time/)
  assert.throws(() => assertTimeDecision('BILLED', 'APPROVE'), /Cannot approve time/)
  assert.throws(() => assertTimeDecision('DRAFT', 'BILLED'), /Cannot billed time/)
})

// ------------------------------------------------------------- hours & cents

test('hours round once, half-up, to two decimals', () => {
  assert.equal(roundHours(1.005), 1.01)
  assert.equal(roundHours(1.234), 1.23)
  assert.equal(roundHours(1.235), 1.24)
  assert.equal(roundHours('2.5'), 2.5)
  assert.throws(() => roundHours(0), /greater than zero/)
  assert.throws(() => roundHours(0.004), /greater than zero/)
  assert.throws(() => roundHours(-1), /positive number/)
  assert.throws(() => roundHours('1e3'), /positive number/)
})

test('time amounts use integer cents from the rounded hours only', () => {
  assert.equal(calculateTimeAmountCents({ hours: 1.005, hourlyRateCents: 1000 }), 1010)
  assert.equal(calculateTimeAmountCents({ hours: 0.335, hourlyRateCents: 999 }), 340)
  assert.equal(calculateTimeAmountCents({ hours: 5, hourlyRateCents: 12345, billable: false }), 0)
  assert.equal(calculateTimeAmountCents({ hours: 1, hourlyRateCents: 0 }), 0)
  assert.throws(
    () => calculateTimeAmountCents({ hours: 1, hourlyRateCents: 10.5 }),
    /integer number of cents/
  )
  assert.throws(
    () => calculateTimeAmountCents({ hours: -1, hourlyRateCents: 100 }),
    /positive number/
  )
  for (const field of PROJECT_MONEY_FIELDS) {
    assert.equal(typeof field, 'string')
  }
})

// --------------------------------------------------------- budget delegation

test('budget usage DTOs copy finance values or report explicit unavailability', () => {
  const usage = {
    lines: [{ budgetLineId: 'line_1', actualCents: 123 }],
    totals: { budgetCents: 1000, actualCents: 123, varianceCents: 877 },
  }
  assert.deepEqual(toBudgetUsageDto({ budgetId: 'bud_1', usage }), {
    budgetId: 'bud_1',
    usage,
    unavailable: null,
  })
  assert.deepEqual(toBudgetUsageDto({ budgetId: 'bud_1', usage: null }), {
    budgetId: 'bud_1',
    usage: null,
    unavailable: { code: 'FINANCE_UNAVAILABLE', reason: 'Budget usage is unavailable' },
  })
  assert.equal(JSON.stringify(toBudgetUsageDto({ budgetId: 'bud_1' })).includes('0'), false)
})

test('budget links never fabricate totals when finance fails', async () => {
  const calls = []
  const usageLoader = async (budgetId) => {
    calls.push(budgetId)
    if (budgetId === 'bud_missing') {
      const error = new Error('not found')
      error.status = 404
      throw error
    }
    if (budgetId === 'bud_conflict') {
      const error = new Error('conflict')
      error.status = 409
      throw error
    }
    if (budgetId === 'bud_down') throw new Error('connection reset')
    return {
      lines: [],
      totals: { budgetCents: 9000, actualCents: 1000, varianceCents: 8000 },
    }
  }
  const results = await loadBudgetUsageForLinks(
    [{ budgetId: 'bud_ok' }, { budgetId: 'bud_missing' }, { budgetId: 'bud_conflict' }, { budgetId: 'bud_down' }],
    { usageLoader }
  )
  assert.deepEqual(calls, ['bud_ok', 'bud_missing', 'bud_conflict', 'bud_down'])
  assert.deepEqual(results[0].usage.totals, {
    budgetCents: 9000, actualCents: 1000, varianceCents: 8000,
  })
  assert.equal(results[0].unavailable, null)
  assert.deepEqual(results.map((row) => row.unavailable?.code ?? null), [
    null, 'BUDGET_NOT_FOUND', 'FINANCE_CONFLICT', 'FINANCE_UNAVAILABLE',
  ])
  for (const row of results.slice(1)) {
    assert.equal(row.usage, null)
    assert.equal(JSON.stringify(row).includes('varianceCents'), false)
  }
})

// ------------------------------------------------------------------- DTO safety

test('project and time DTOs expose no tenant or actor internals', () => {
  const base = {
    companyId: 'cmp_secret', branchId: 'br_secret', createdById: 'usr_secret',
    updatedById: 'usr_editor',
  }
  const project = toProjectDto({
    ...base,
    id: 'prj_1', number: 'PRJ-2026-0001', name: 'Delivery', description: null,
    status: 'PLANNED', customerId: 'cus_1', salesOrderId: null, financeInvoiceId: null,
    budgetCents: 100_000, currency: 'KES', plannedStart: new Date(0), plannedEnd: null,
    startedAt: null, completedAt: null, cancelledAt: null, classification: 'INTERNAL',
    createdAt: new Date(0), updatedAt: new Date(0),
  })
  const time = toTimeEntryDto({
    ...base,
    id: 'tim_1', projectId: 'prj_1', taskId: null, memberId: null, userId: 'usr_member',
    number: 'TIME-2026-0001', workDate: today, hours: 1.25, billable: true,
    hourlyRateCents: 5000, amountCents: 6250, status: 'DRAFT', approvedById: null,
    approvedAt: null, rejectedAt: null, billedAt: null, financeInvoiceId: null,
    classification: 'INTERNAL',
  })
  for (const dto of [project, time]) {
    const serialised = JSON.stringify(dto)
    for (const secret of ['cmp_secret', 'br_secret', 'usr_secret', 'usr_editor', 'createdById']) {
      assert.equal(serialised.includes(secret), false, `DTO leaked ${secret}`)
    }
  }
  assert.equal(project.budgetCents, 100_000)
  assert.equal(time.amountCents, 6250)
  assert.equal(project.plannedStart, '1970-01-01T00:00:00.000Z')
})

test('invoice response is narrowed to a safe API summary', () => {
  const summary = toInvoiceSummary({
    id: 'inv_1', number: 'INV-1', status: 'ISSUED', totalCents: 10_000,
    currency: 'KES', issuedAt: today, companyId: 'cmp_secret', partyId: 'cus_1',
    taxRateId: 'rate_1', lines: [{ description: 'secret work' }], notes: 'private note',
  })
  assert.deepEqual(summary, {
    id: 'inv_1', number: 'INV-1', status: 'ISSUED', totalCents: 10_000,
    currency: 'KES', issuedAt: today,
  })
  const serialised = JSON.stringify(summary)
  for (const secret of ['cmp_secret', 'cus_1', 'rate_1', 'secret work', 'private note']) {
    assert.equal(serialised.includes(secret), false, `invoice summary leaked ${secret}`)
  }
  assert.equal(toInvoiceSummary(null), null)
})

// ------------------------------------------------------------------ validation

test('project write and query schemas reject tenant, status and calculated fields', () => {
  assert.equal(projectCreateSchema.parse(projectBase).budgetCents, 5_000_000)
  for (const forbidden of [
    'companyId', 'createdById', 'status', 'startedAt', 'completedAt', 'amountCents', 'financeInvoiceId',
  ]) {
    assert.throws(
      () => projectCreateSchema.parse({ ...projectBase, [forbidden]: 'secret' }),
      /Unrecognized key/,
      `project create accepted ${forbidden}`
    )
  }
  assert.equal(projectUpdateSchema.parse({ number: 'PRJ-CUSTOM-1' }).number, 'PRJ-CUSTOM-1')
  assert.throws(() => projectUpdateSchema.parse({}), /At least one field/)
  assert.throws(() => projectUpdateSchema.parse({ companyId: 'cmp_other' }), /Unrecognized key/)
  assert.deepEqual(projectTransitionSchema.parse({ status: 'ACTIVE' }), { status: 'ACTIVE' })
  assert.throws(() => projectTransitionSchema.parse({ status: 'ACTIVE', note: 'x' }), /Unrecognized key/)
  assert.throws(() => projectQuerySchema.parse({ companyId: 'cmp_other' }), /Unrecognized key/)
  assert.throws(() => projectQuerySchema.parse({ status: 'PENDING' }), /Invalid option/)
  assert.equal(projectQuerySchema.parse({ limit: '25' }).limit, 25)
})

test('child create schemas allow server numbering and reject client-calculated columns', () => {
  const milestone = projectMilestoneCreateSchema.parse({ name: 'Go live' })
  const task = projectTaskCreateSchema.parse({ title: 'Configure tenant' })
  const time = projectTimeCreateSchema.parse({ workDate: today, hours: 1.5 })
  assert.equal(milestone.number, undefined)
  assert.equal(task.number, undefined)
  assert.equal(time.number, undefined)
  assert.equal(time.billable, false)
  assert.equal(time.hourlyRateCents, 0)
  assert.equal(projectMilestoneCreateSchema.parse({ number: 'MS-CUSTOM-1', name: 'Go live' }).number, 'MS-CUSTOM-1')
  assert.equal(projectTaskCreateSchema.parse({ number: 'TASK-CUSTOM-1', title: 'Configure tenant' }).number, 'TASK-CUSTOM-1')
  assert.equal(projectTimeCreateSchema.parse({
    number: 'TIME-CUSTOM-1', workDate: today, hours: 1.5,
  }).number, 'TIME-CUSTOM-1')
  for (const forbidden of ['companyId', 'status', 'amountCents', 'hoursRounded', 'financeInvoiceId']) {
    assert.throws(
      () => projectTimeCreateSchema.parse({ workDate: today, hours: 1, [forbidden]: 'secret' }),
      /Unrecognized key/,
      `time create accepted ${forbidden}`
    )
  }
  assert.deepEqual(projectTimeDecisionSchema.parse({ decision: 'APPROVE' }), { decision: 'APPROVE' })
  assert.throws(() => projectTimeDecisionSchema.parse({ decision: 'APPROVE', status: 'APPROVED' }), /Unrecognized key/)
  assert.deepEqual(projectBudgetLinkCreateSchema.parse({ budgetId: 'bud_1' }), { budgetId: 'bud_1' })
  assert.throws(() => projectBudgetLinkCreateSchema.parse({ budgetId: 'bud_1', companyId: 'cmp_x' }), /Unrecognized key/)
  assert.equal(projectTimeQuerySchema.parse({ status: 'DRAFT', from: today, to: today }).status, 'DRAFT')
})

test('project write schemas fail closed on restricted free text', () => {
  assertDlpRejects(
    () => projectCreateSchema.parse({ ...projectBase, name: 'Card 4111111111111111' }),
    'CARD_NUMBER'
  )
  assertDlpRejects(
    () => projectMilestoneCreateSchema.parse({ name: 'National ID 12345678' }),
    'KENYAN_NATIONAL_ID'
  )
  assertDlpRejects(
    () => projectTaskCreateSchema.parse({ title: 'Card 4111111111111111' }),
    'CARD_NUMBER'
  )
  assertDlpRejects(
    () => projectTimeInvoiceSchema.parse({ description: 'National ID 12345678' }),
    'KENYAN_NATIONAL_ID'
  )
  assertDlpRejects(
    () => projectTimeDecisionSchema.parse({ decision: 'REJECT', note: 'Card 4111111111111111' }),
    'CARD_NUMBER'
  )
  assert.equal(projectTimeInvoiceSchema.parse({ description: 'Approved consultancy work' }).description, 'Approved consultancy work')
})

// --------------------------------------------------------- permissions/events

test('project permissions exist with separation of duties across roles', () => {
  const names = [
    'projects.project.read', 'projects.project.write',
    'projects.member.read', 'projects.member.write',
    'projects.task.read', 'projects.task.write',
    'projects.milestone.read', 'projects.milestone.write',
    'projects.time.read', 'projects.time.write', 'projects.time.approve', 'projects.time.bill',
    'projects.budget.read', 'projects.budget.link',
  ]
  assert.equal(names.length, 14)
  for (const name of names) {
    assert.equal(typeof PERMISSIONS[name], 'string', `missing ${name}`)
    assert.equal(ROLE_PERMISSIONS.ADMIN.includes(name), true, `admin missing ${name}`)
  }
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('projects.time.write'), true)
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('projects.time.approve'), true)
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('projects.time.bill'), false)
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('projects.budget.link'), true)
  assert.equal(ROLE_PERMISSIONS.STAFF.includes('projects.time.write'), true)
  assert.equal(ROLE_PERMISSIONS.STAFF.includes('projects.time.approve'), false)
  assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes('projects.time.bill'), false)
  for (const name of names) {
    assert.equal(
      ROLE_PERMISSIONS.COMPLIANCE.includes(name),
      name.endsWith('.read'),
      `compliance role is not read-only for ${name}`
    )
  }
})

test('project event schemas are registered and strictly ID/classification-only', () => {
  const cases = [
    ['ProjectCreated', ProjectCreatedDataSchema, {
      entityType: 'PROJECT', entityId: 'prj_1', projectId: 'prj_1', classification: 'INTERNAL',
    }],
    ['ProjectTaskCompleted', ProjectTaskCompletedDataSchema, {
      entityType: 'PROJECT_TASK', entityId: 'tsk_1', taskId: 'tsk_1',
      projectId: 'prj_1', classification: 'INTERNAL',
    }],
    ['MilestoneMet', MilestoneMetDataSchema, {
      entityType: 'MILESTONE', entityId: 'ms_1', milestoneId: 'ms_1',
      projectId: 'prj_1', classification: 'INTERNAL',
    }],
    ['TimeEntryApproved', TimeEntryApprovedDataSchema, {
      entityType: 'TIME_ENTRY', entityId: 'tim_1', timeEntryId: 'tim_1',
      projectId: 'prj_1', classification: 'INTERNAL',
    }],
  ]
  for (const [name, schema, valid] of cases) {
    assert.equal(typeof DomainEventSchemas[name]?.parse, 'function', `missing ${name}`)
    assert.deepEqual(schema.parse(valid), valid)
    for (const forbidden of [
      'companyId', 'branchId', 'actorId', 'name', 'title', 'dueAt', 'hours',
      'amountCents', 'hourlyRateCents', 'status', 'note', 'invoiceId', 'description',
    ]) {
      assert.throws(() => schema.parse({ ...valid, [forbidden]: 'secret' }), /Unrecognized key/)
    }
  }
})

test('project socket frames route only to the company room and carry no record content', () => {
  const mappings = [
    ['ProjectCreated', 'projects:project', {
      entityType: 'PROJECT', entityId: 'prj_1', projectId: 'prj_1', classification: 'INTERNAL',
    }],
    ['ProjectTaskCompleted', 'projects:task', {
      entityType: 'PROJECT_TASK', entityId: 'tsk_1', taskId: 'tsk_1',
      projectId: 'prj_1', classification: 'INTERNAL',
    }],
    ['MilestoneMet', 'projects:milestone', {
      entityType: 'MILESTONE', entityId: 'ms_1', milestoneId: 'ms_1',
      projectId: 'prj_1', classification: 'INTERNAL',
    }],
    ['TimeEntryApproved', 'projects:time', {
      entityType: 'TIME_ENTRY', entityId: 'tim_1', timeEntryId: 'tim_1',
      projectId: 'prj_1', classification: 'INTERNAL',
    }],
  ]
  for (const [type, socketEvent, data] of mappings) {
    const emitted = []
    const io = {
      to(room) {
        return { emit(name, payload) { emitted.push({ room, name, payload }) } }
      },
    }
    const event = {
      id: 'evt_1', type, version: 1, occurredAt: new Date(0).toISOString(),
      correlationId: 'cor_1', companyId: 'cmp_a', branchId: 'br_1', actorId: 'usr_1', data,
    }
    assert.equal(dispatchEvent(io, event), 1)
    assert.equal(emitted.length, 1)
    assert.equal(emitted[0].room, 'company:cmp_a')
    assert.equal(emitted[0].name, socketEvent)
    assert.deepEqual(emitted[0].payload.data, data)
    const serialised = JSON.stringify(emitted)
    for (const secret of ['br_1', 'usr_1', 'cmp_b', 'hours', 'amountCents', 'title', 'dueAt']) {
      assert.equal(serialised.includes(secret), false, `${socketEvent} leaked ${secret}`)
    }
  }
})

// --------------------------------------------------------- finance delegation

test('projects delegates tax and budget arithmetic to finance', () => {
  const source = readFileSync(new URL('../lib/projects.js', import.meta.url), 'utf8')
  for (const call of [
    'getBudgetUsage', 'resolveVerifiedRate(', 'createInvoice(', 'issueInvoice(',
  ]) {
    assert.equal(source.includes(call), true, `missing finance delegation: ${call}`)
  }
  for (const forbidden of [
    'VAT_RATE', 'taxRateBps', 'taxCents', '0.16', '16 / 100', 'estimatedUsage', 'fakeTotals',
  ]) {
    assert.equal(source.includes(forbidden), false, `found local finance arithmetic: ${forbidden}`)
  }
  assert.match(source, /Finance owns budget usage arithmetic/)
})

test('routes require finance permissions alongside billing, usage and linking', () => {
  const routes = readFileSync(new URL('../routes/projects.routes.js', import.meta.url), 'utf8')
  for (const permission of [
    'projects.time.bill', 'finance.invoice.write', 'finance.invoice.issue',
    'projects.budget.read', 'finance.budget.read',
    'projects.budget.link', 'finance.budget.write',
  ]) {
    assert.match(routes, new RegExp(`requirePermission\\('${permission.replaceAll('.', '\\.')}'\\)`))
  }
  assert.match(routes, /resolveVerifiedRate|invoiceTimeEntry/) // billing stays in the service
})
