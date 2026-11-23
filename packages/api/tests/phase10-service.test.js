// Phase 10 service unit tests. Pure helpers, schemas and contracts only —
// no database or network calls. Cross-tenant RLS isolation is verified by the
// deployment probe in the implementation guide.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RESPONSE_SLA_HOURS, DEFAULT_RESOLUTION_SLA_HOURS,
  serviceTenantWhere, calculateServiceLine, calculateServiceTotals,
  calculateWorkOrderTotals, calculateSlaDueDates, calculateSlaState,
  assertServiceTransition, assertServiceCustomer, assertServiceItemActive,
  assertVerifiedServiceRate,
  toContractDto, toTicketDto, toWorkOrderDto, toVisitDto, toPartUsageDto,
} from '../lib/service.js'
import {
  serviceContractCreateSchema, serviceTicketCreateSchema,
  serviceTicketAssignSchema, serviceTicketResolveSchema,
  serviceWorkOrderCreateSchema, serviceWorkOrderScheduleSchema,
  serviceWorkOrderCompleteSchema, serviceVisitCreateSchema,
  serviceVisitCheckOutSchema, servicePartUsageCreateSchema,
  serviceInvoiceCreateSchema, serviceActionSchema,
  serviceContractQuerySchema, serviceTicketQuerySchema,
  servicePartUsageQuerySchema, SERVICE_MONEY_FIELDS,
} from '../lib/validation.js'
import {
  DomainEventSchemas, ServiceContractActivatedDataSchema,
  ServiceTicketOpenedDataSchema, ServiceTicketAssignedDataSchema,
  ServiceTicketResolvedDataSchema, WorkOrderCompletedDataSchema,
  ServiceVisitCompletedDataSchema,
} from '../../shared/src/events.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const today = '2026-11-23'
const opened = '2026-11-23T08:00:00.000Z'

// ------------------------------------------------------------- cent arithmetic

test('service line values round once to whole integer cents', () => {
  assert.deepEqual(calculateServiceLine({ qty: 1.234, unitPriceCents: 1250 }), {
    qty: 1.234, unitPriceCents: 1250, totalCents: 1543,
  })
  assert.equal(Number.isSafeInteger(calculateServiceLine({ qty: 3, unitPriceCents: 333 }).totalCents), true)
  assert.throws(() => calculateServiceLine({ qty: 1, unitPriceCents: 12.5 }), /integer number of cents/)
  assert.throws(() => calculateServiceLine({ qty: 0, unitPriceCents: 100 }), /greater than zero/)
  assert.deepEqual(calculateServiceTotals([{ totalCents: 1543 }, { totalCents: 2500 }]), { totalCents: 4043 })
  assert.throws(() => calculateServiceTotals([{ totalCents: 1.5 }]), /integer number of cents/)
})

test('work order totals are labour plus parts in safe integer cents', () => {
  assert.deepEqual(calculateWorkOrderTotals(
    [{ totalCents: 15_000 }, { totalCents: 2_500 }],
    [{ totalCents: 1_250 }, { totalCents: 375 }],
  ), { labourCents: 17_500, partsCents: 1_625, totalCents: 19_125 })
  assert.deepEqual(calculateWorkOrderTotals([], [{ totalCents: 900 }]), {
    labourCents: 0, partsCents: 900, totalCents: 900,
  })
  assert.throws(() => calculateWorkOrderTotals([{ totalCents: 0.5 }]), /integer number of cents/)
})

// ------------------------------------------------------------------------- SLA

test('SLA due dates are commercial whole-hour targets persisted at ticket open', () => {
  assert.deepEqual(calculateSlaDueDates({ openedAt: opened, responseSlaHours: 4, resolutionSlaHours: 48 }), {
    openedAt: opened,
    responseSlaHours: 4,
    resolutionSlaHours: 48,
    responseDueAt: '2026-11-23T12:00:00.000Z',
    resolutionDueAt: '2026-11-25T08:00:00.000Z',
  })
  assert.equal(DEFAULT_RESPONSE_SLA_HOURS, 4)
  assert.equal(DEFAULT_RESOLUTION_SLA_HOURS, 48)
  assert.equal(calculateSlaDueDates({ openedAt: opened }).responseDueAt, '2026-11-23T12:00:00.000Z')
  assert.throws(() => calculateSlaDueDates({ openedAt: opened, responseSlaHours: 1.5 }), /whole number of hours/)
  assert.throws(() => calculateSlaDueDates({ openedAt: opened, resolutionSlaHours: 0 }), /whole number of hours/)
})

test('SLA states distinguish pending, at risk, met and breached', () => {
  const ticket = {
    openedAt: opened,
    responseDueAt: '2026-11-23T12:00:00.000Z',
    resolutionDueAt: '2026-11-25T08:00:00.000Z',
  }
  const pending = calculateSlaState(ticket, new Date('2026-11-23T09:00:00.000Z'))
  assert.equal(pending.response.state, 'PENDING')
  assert.equal(pending.resolution.state, 'PENDING')
  assert.equal(pending.breached, false)

  const atRisk = calculateSlaState(ticket, new Date('2026-11-23T11:00:00.000Z'))
  assert.equal(atRisk.response.state, 'AT_RISK')
  assert.equal(atRisk.resolution.state, 'PENDING')
  assert.equal(atRisk.breached, false)

  const breached = calculateSlaState(ticket, new Date('2026-11-23T13:00:00.000Z'))
  assert.equal(breached.response.state, 'BREACHED')
  assert.equal(breached.breached, true)

  const met = calculateSlaState({
    ...ticket,
    respondedAt: '2026-11-23T11:30:00.000Z',
    resolvedAt: '2026-11-24T10:00:00.000Z',
  }, new Date('2026-11-26T00:00:00.000Z'))
  assert.equal(met.response.state, 'MET')
  assert.equal(met.resolution.state, 'MET')
  assert.equal(met.breached, false)

  const lateResolution = calculateSlaState({
    ...ticket,
    respondedAt: '2026-11-23T11:30:00.000Z',
    resolvedAt: '2026-11-25T09:00:00.000Z',
  }, new Date('2026-11-26T00:00:00.000Z'))
  assert.equal(lateResolution.response.state, 'MET')
  assert.equal(lateResolution.resolution.state, 'BREACHED')
  assert.equal(lateResolution.breached, true)
})

// ------------------------------------------------------------- state machines

test('contract, ticket, work order and visit transitions reject skipped steps', () => {
  assert.equal(assertServiceTransition('contract', 'DRAFT', 'ACTIVE'), true)
  assert.equal(assertServiceTransition('contract', 'ACTIVE', 'SUSPENDED'), true)
  assert.equal(assertServiceTransition('contract', 'SUSPENDED', 'ACTIVE'), true)
  assert.throws(() => assertServiceTransition('contract', 'DRAFT', 'EXPIRED'), /Cannot change contract/)
  assert.throws(() => assertServiceTransition('contract', 'CANCELLED', 'ACTIVE'), /Cannot change contract/)

  assert.equal(assertServiceTransition('ticket', 'OPEN', 'ASSIGNED'), true)
  assert.equal(assertServiceTransition('ticket', 'IN_PROGRESS', 'RESOLVED'), true)
  assert.equal(assertServiceTransition('ticket', 'RESOLVED', 'CLOSED'), true)
  assert.equal(assertServiceTransition('ticket', 'RESOLVED', 'IN_PROGRESS'), true)
  assert.throws(() => assertServiceTransition('ticket', 'OPEN', 'RESOLVED'), /Cannot change ticket/)
  assert.throws(() => assertServiceTransition('ticket', 'CLOSED', 'OPEN'), /Cannot change ticket/)

  assert.equal(assertServiceTransition('workOrder', 'DRAFT', 'SCHEDULED'), true)
  assert.equal(assertServiceTransition('workOrder', 'SCHEDULED', 'IN_PROGRESS'), true)
  assert.equal(assertServiceTransition('workOrder', 'IN_PROGRESS', 'COMPLETED'), true)
  assert.throws(() => assertServiceTransition('workOrder', 'DRAFT', 'COMPLETED'), /Cannot change workOrder/)
  assert.throws(() => assertServiceTransition('workOrder', 'COMPLETED', 'DRAFT'), /Cannot change workOrder/)

  assert.equal(assertServiceTransition('visit', 'PLANNED', 'IN_PROGRESS'), true)
  assert.equal(assertServiceTransition('visit', 'IN_PROGRESS', 'COMPLETED'), true)
  assert.throws(() => assertServiceTransition('visit', 'PLANNED', 'COMPLETED'), /Cannot change visit/)
  assert.throws(() => assertServiceTransition('visit', 'COMPLETED', 'PLANNED'), /Cannot change visit/)
})

// --------------------------------------------------------------- pure guards

test('service guards reject wrong customer types, inactive items and unverified rates', () => {
  assert.equal(assertServiceCustomer({ id: 'pty_1', type: 'CUSTOMER' }).id, 'pty_1')
  assert.throws(() => assertServiceCustomer(null), /not found/)
  assert.throws(() => assertServiceCustomer({ type: 'SUPPLIER' }), /CUSTOMER party/)

  assert.equal(assertServiceItemActive({ id: 'itm_1', isActive: true }).id, 'itm_1')
  assert.throws(() => assertServiceItemActive(null), /not found/)
  assert.throws(() => assertServiceItemActive({ isActive: false }), /inactive/)

  const verified = { id: 'rate_1', kind: 'VAT', status: 'VERIFIED', rateBps: 1600 }
  assert.equal(assertVerifiedServiceRate(verified).id, 'rate_1')
  assert.throws(() => assertVerifiedServiceRate(null), /verified VAT rate/)
  assert.throws(() => assertVerifiedServiceRate({ ...verified, status: 'PENDING' }), /VERIFIED VAT/)
  assert.throws(() => assertVerifiedServiceRate({ ...verified, kind: 'WITHHOLDING' }), /VERIFIED VAT/)
})

// --------------------------------------------------------------- tenant scope

test('service tenant scoping allows organisation-wide rows but never another company', () => {
  assert.deepEqual(serviceTenantWhere('co_a', null), { companyId: 'co_a' })
  assert.deepEqual(serviceTenantWhere('co_a', 'br_1'), {
    companyId: 'co_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(serviceTenantWhere('co_a', 'br_1')).includes('co_b'), false)
})

// ---------------------------------------------------------------------- DTOs

test('service DTOs never expose tenant internals and embed derived SLA state', () => {
  const base = { id: 'doc_1', companyId: 'co_secret', createdById: 'usr_1', classification: 'INTERNAL' }
  const dtos = [
    toContractDto({ ...base, number: 'SVC-1', status: 'ACTIVE', customerId: 'pty_1', startDate: today, currency: 'KES', monthlyFeeCents: 0, responseSlaHours: 4, resolutionSlaHours: 48 }),
    toTicketDto({
      ...base, number: 'TKT-1', status: 'OPEN', priority: 'MEDIUM', customerId: 'pty_1',
      subject: 'Pump failure', openedAt: opened,
      responseDueAt: '2026-11-23T12:00:00.000Z', resolutionDueAt: '2026-11-25T08:00:00.000Z',
    }, new Date('2026-11-23T09:00:00.000Z')),
    toWorkOrderDto({ ...base, number: 'WO-1', status: 'DRAFT', ticketId: 'tkt_1', summary: 'Inspect pump', labourCents: 0, partsCents: 0, totalCents: 0, currency: 'KES' }),
    toVisitDto({ ...base, number: 'VIS-1', status: 'PLANNED', workOrderId: 'wo_1', plannedAt: opened }),
    toPartUsageDto({ ...base, workOrderId: 'wo_1', itemId: 'itm_1', qty: 1, unitCostCents: 100, unitPriceCents: 150, totalCents: 150, inventoryIssued: false, manualIssueRequired: true }),
  ]
  for (const dto of dtos) {
    assert.equal(dto.companyId, undefined)
    assert.equal(dto.createdById, undefined)
  }
  assert.equal(dtos[1].sla.response.state, 'PENDING')
  assert.equal(dtos[1].sla.breached, false)
  assert.equal(JSON.stringify(dtos).includes('co_secret'), false)
  assert.deepEqual(SERVICE_MONEY_FIELDS, [
    'monthlyFeeCents', 'unitPriceCents', 'labourCents', 'partsCents',
    'totalCents', 'unitCostCents',
  ])
})

// --------------------------------------------------------- validation and DLP

const serviceContractLine = {
  itemId: 'itm_1', description: 'Annual pump service', coverageQty: 1, unitPriceCents: 12_000,
}
const serviceLine = {
  itemId: 'itm_1', description: 'Technician labour', qty: 2, unitPriceCents: 5_000,
}

test('service write schemas reject client-supplied tenant, status, SLA dues and totals', () => {
  const contract = serviceContractCreateSchema.parse({
    customerId: 'pty_1', startDate: today, responseSlaHours: 4, resolutionSlaHours: 48,
    lines: [serviceContractLine],
  })
  assert.equal(contract.currency, 'KES')
  assert.equal(contract.classification, 'INTERNAL')
  assert.equal(contract.monthlyFeeCents, 0)
  for (const forbidden of [
    'companyId', 'status', 'number', 'responseDueAt', 'resolutionDueAt',
    'activatedAt', 'totalCents', 'taxRateId', 'taxRate',
  ]) {
    assert.throws(() => serviceContractCreateSchema.parse({
      customerId: 'pty_1', startDate: today, responseSlaHours: 4, resolutionSlaHours: 48,
      lines: [serviceContractLine], [forbidden]: 'secret',
    }), /Unrecognized key/, `contract accepted ${forbidden}`)
  }
  assert.throws(() => serviceContractCreateSchema.parse({
    customerId: 'pty_1', startDate: '23-11-2026', responseSlaHours: 4, resolutionSlaHours: 48,
    lines: [serviceContractLine],
  }), /YYYY-MM-DD/)
  assert.throws(() => serviceContractCreateSchema.parse({
    customerId: 'pty_1', startDate: today, responseSlaHours: 4.5, resolutionSlaHours: 48,
    lines: [serviceContractLine],
  }), /int/)
})

test('ticket, work order, visit and part write schemas stay strict', () => {
  assert.deepEqual(serviceTicketAssignSchema.parse({ assigneeId: 'usr_1' }), { assigneeId: 'usr_1' })
  assert.throws(() => serviceTicketAssignSchema.parse({ assigneeId: 'usr_1', companyId: 'co_other' }), /Unrecognized key/)
  assert.throws(() => serviceTicketResolveSchema.parse({ status: 'RESOLVED' }), /Unrecognized key/)
  assert.equal(serviceTicketResolveSchema.parse({ resolutionNotes: 'Fixed' }).resolutionNotes, 'Fixed')

  assert.throws(() => serviceTicketCreateSchema.parse({ subject: 'No customer' }), /customerId is required/)
  assert.equal(serviceTicketCreateSchema.parse({ customerId: 'pty_1', subject: 'Pump' }).priority, 'MEDIUM')
  assert.throws(() => serviceTicketCreateSchema.parse({
    customerId: 'pty_1', subject: 'Pump', companyId: 'co_other',
  }), /Unrecognized key/)

  const wo = serviceWorkOrderCreateSchema.parse({ ticketId: 'tkt_1', summary: 'Inspect', lines: [serviceLine] })
  assert.equal(wo.lines[0].qty, 2)
  assert.throws(() => serviceWorkOrderCreateSchema.parse({
    ticketId: 'tkt_1', summary: 'Inspect', lines: [serviceLine], labourCents: 10_000,
  }), /Unrecognized key/)
  assert.throws(() => serviceWorkOrderScheduleSchema.parse({
    scheduledAt: opened, status: 'SCHEDULED',
  }), /Unrecognized key/)
  assert.deepEqual(serviceWorkOrderCompleteSchema.parse({}), {})
  assert.throws(() => serviceVisitCreateSchema.parse({
    workOrderId: 'wo_1', plannedAt: opened, inventoryIssued: true,
  }), /Unrecognized key/)
  assert.throws(() => serviceVisitCheckOutSchema.parse({ status: 'COMPLETED' }), /Unrecognized key/)
  assert.throws(() => servicePartUsageCreateSchema.parse({
    workOrderId: 'wo_1', itemId: 'itm_1', qty: 1, unitCostCents: 100, issuedMovementId: 'mv_1',
  }), /Unrecognized key/)
})

test('service schemas fail closed on restricted free text', () => {
  assert.throws(() => serviceContractCreateSchema.parse({
    customerId: 'pty_1', startDate: today, responseSlaHours: 4, resolutionSlaHours: 48,
    lines: [serviceContractLine], notes: 'Card 4111111111111111',
  }), /CARD_NUMBER/)
  assert.throws(() => serviceTicketCreateSchema.parse({
    customerId: 'pty_1', subject: 'National ID 12345678',
  }), /KENYAN_NATIONAL_ID/)
  assert.throws(() => serviceWorkOrderCreateSchema.parse({
    ticketId: 'tkt_1', summary: 'Inspect', notes: 'Card 4111111111111111',
  }), /CARD_NUMBER/)
  assert.throws(() => servicePartUsageCreateSchema.parse({
    workOrderId: 'wo_1', itemId: 'itm_1', qty: 1, unitCostCents: 100,
    notes: 'National ID 12345678',
  }), /KENYAN_NATIONAL_ID/)
})

test('action, invoice and query schemas stay strict and carry no tax percentage', () => {
  assert.deepEqual(serviceActionSchema.parse({}), {})
  assert.throws(() => serviceActionSchema.parse({ status: 'ACTIVE' }), /Unrecognized key/)
  const invoice = serviceInvoiceCreateSchema.parse({ issueDate: today, taxRateId: 'rate_1' })
  assert.deepEqual(invoice, { issueDate: today, taxRateId: 'rate_1' })
  for (const forbidden of ['taxPercent', 'taxRate', 'rateBps', 'companyId', 'totalCents']) {
    assert.throws(() => serviceInvoiceCreateSchema.parse({
      issueDate: today, [forbidden]: 16,
    }), /Unrecognized key/, `invoice accepted ${forbidden}`)
  }
  assert.equal(serviceTicketQuerySchema.parse({ status: 'OPEN', limit: '25' }).limit, 25)
  assert.throws(() => serviceContractQuerySchema.parse({ companyId: 'co_other' }), /Unrecognized key/)
  assert.throws(() => serviceTicketQuerySchema.parse({ status: 'FLAGGED' }), /Invalid option/)
  assert.equal(servicePartUsageQuerySchema.parse({ inventoryIssued: 'true' }).inventoryIssued, true)
  assert.equal(servicePartUsageQuerySchema.parse({ inventoryIssued: 'false' }).inventoryIssued, false)
})

// --------------------------------------------------------- permissions, events

test('all service permissions exist and are granted to admin and manager', () => {
  const names = [
    'service.contract.read', 'service.contract.write',
    'service.ticket.read', 'service.ticket.write', 'service.ticket.assign', 'service.ticket.resolve',
    'service.workorder.read', 'service.workorder.write', 'service.workorder.schedule', 'service.workorder.complete',
    'service.visit.read', 'service.visit.write',
    'service.part.read', 'service.part.write',
  ]
  assert.equal(names.length, 14)
  for (const name of names) {
    assert.equal(typeof PERMISSIONS[name], 'string', `missing ${name}`)
    assert.equal(ROLE_PERMISSIONS.ADMIN.includes(name), true, `admin missing ${name}`)
    assert.equal(ROLE_PERMISSIONS.MANAGER.includes(name), true, `manager missing ${name}`)
  }
})

test('service event schemas are registered and strictly ID/classification-only', () => {
  const cases = [
    ['ServiceContractActivated', ServiceContractActivatedDataSchema, {
      entityType: 'SERVICE_CONTRACT', entityId: 'ctr_1', contractId: 'ctr_1',
      customerId: 'pty_1', classification: 'INTERNAL',
    }],
    ['ServiceTicketOpened', ServiceTicketOpenedDataSchema, {
      entityType: 'SERVICE_TICKET', entityId: 'tkt_1', ticketId: 'tkt_1',
      contractId: 'ctr_1', customerId: 'pty_1', classification: 'INTERNAL',
    }],
    ['ServiceTicketAssigned', ServiceTicketAssignedDataSchema, {
      entityType: 'SERVICE_TICKET', entityId: 'tkt_1', ticketId: 'tkt_1',
      assigneeId: 'usr_1', classification: 'INTERNAL',
    }],
    ['ServiceTicketResolved', ServiceTicketResolvedDataSchema, {
      entityType: 'SERVICE_TICKET', entityId: 'tkt_1', ticketId: 'tkt_1',
      workOrderId: 'wo_1', classification: 'CONFIDENTIAL',
    }],
    ['WorkOrderCompleted', WorkOrderCompletedDataSchema, {
      entityType: 'WORK_ORDER', entityId: 'wo_1', workOrderId: 'wo_1',
      ticketId: 'tkt_1', classification: 'INTERNAL',
    }],
    ['ServiceVisitCompleted', ServiceVisitCompletedDataSchema, {
      entityType: 'SERVICE_VISIT', entityId: 'vis_1', visitId: 'vis_1',
      workOrderId: 'wo_1', classification: 'INTERNAL',
    }],
  ]
  for (const [name, schema, valid] of cases) {
    assert.equal(typeof DomainEventSchemas[name]?.parse, 'function', `missing ${name}`)
    assert.deepEqual(schema.parse(valid), valid)
    for (const forbidden of [
      'companyId', 'number', 'status', 'subject', 'notes', 'totalCents',
      'taxRateId', 'dueAt', 'branchId', 'actorId',
    ]) {
      assert.throws(() => schema.parse({ ...valid, [forbidden]: 'secret' }), /Unrecognized key/)
    }
  }
})

test('service socket frames route only to the company room and carry no record content', () => {
  const emitted = []
  const io = {
    to(room) {
      return { emit(socketEvent, payload) { emitted.push({ room, socketEvent, payload }) } }
    },
  }
  const event = {
    id: 'evt_1', type: 'WorkOrderCompleted', version: 1,
    occurredAt: new Date(0).toISOString(), correlationId: 'cor_1',
    companyId: 'co_a', branchId: 'br_1', actorId: 'usr_1',
    data: {
      entityType: 'WORK_ORDER', entityId: 'wo_1', workOrderId: 'wo_1',
      ticketId: 'tkt_1', classification: 'CONFIDENTIAL',
    },
  }
  assert.equal(dispatchEvent(io, event), 1)
  assert.deepEqual(emitted, [{
    room: 'company:co_a',
    socketEvent: 'service:workorder',
    payload: {
      eventId: 'evt_1', type: 'WorkOrderCompleted', occurredAt: event.occurredAt,
      correlationId: 'cor_1', data: event.data,
    },
  }])
  const serialised = JSON.stringify(emitted)
  for (const secret of ['br_1', 'usr_1', 'amountCents', 'co_b']) {
    assert.equal(serialised.includes(secret), false)
  }
})
