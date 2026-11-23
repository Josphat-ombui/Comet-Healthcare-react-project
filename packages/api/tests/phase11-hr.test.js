// Phase 11 HR unit tests. Pure helpers, schemas, DTOs, events and socket routing
// only — no database or network calls. Cross-tenant RLS isolation is verified
// by the deployment probe in the implementation guide.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  PAYROLL_RATE_KINDS, hrTenantWhere, endOfDayInstant,
  selectEffectivePayrollRate, resolvePayrollRates, calculatePayrollLine,
  assertContractTransition, assertLeaveDecision, maskEncrypted,
  toEmployeeDto, toRateDto,
} from '../lib/hr.js'
import {
  hrEmployeeCreateSchema, hrPayrollRateCreateSchema, hrPayrollRateVerifySchema,
  hrLeaveCreateSchema, hrAttendanceUpsertSchema, hrPayrollRunCreateSchema,
  hrActionSchema, hrEmployeeQuerySchema, hrRateQuerySchema, HR_MONEY_FIELDS,
} from '../lib/validation.js'
import { encryptString } from '../lib/crypto.js'
import {
  DomainEventSchemas, EmployeeCreatedDataSchema, LeaveApprovedDataSchema,
  PayrollRateVerifiedDataSchema, PayrollRunCalculatedDataSchema,
  PayrollRunApprovedDataSchema,
} from '../../shared/src/events.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const today = '2026-11-23'

function rate(id, kind, effectiveFrom, overrides = {}) {
  return {
    id,
    kind,
    effectiveFrom,
    effectiveTo: null,
    status: 'VERIFIED',
    rateBps: 1000,
    ...overrides,
  }
}

const verifiedRates = {
  PAYE: rate('rate_paye', 'PAYE', '2026-01-01T00:00:00.000Z', { rateBps: 3000 }),
  NSSF_EMPLOYEE: rate('rate_nssf_e', 'NSSF_EMPLOYEE', '2026-01-01T00:00:00.000Z', { rateBps: 600 }),
  NSSF_EMPLOYER: rate('rate_nssf_er', 'NSSF_EMPLOYER', '2026-01-01T00:00:00.000Z', { rateBps: 1200 }),
  SHIF: rate('rate_shif', 'SHIF', '2026-01-01T00:00:00.000Z', { rateBps: 275 }),
  HOUSING_LEVY: rate('rate_levy', 'HOUSING_LEVY', '2026-01-01T00:00:00.000Z', { rateBps: 150 }),
}

// ---------------------------------------------------------- rate verification

test('all five statutory rate kinds are represented and ordered', () => {
  assert.deepEqual(PAYROLL_RATE_KINDS, [
    'PAYE', 'NSSF_EMPLOYEE', 'NSSF_EMPLOYER', 'SHIF', 'HOUSING_LEVY',
  ])
  assert.equal(PAYROLL_RATE_KINDS.length, 5)
})

test('UNVERIFIED, future and expired payroll rates are rejected', () => {
  const rows = [
    rate('old', 'PAYE', '2026-01-01T00:00:00.000Z'),
    rate('unverified', 'PAYE', '2026-09-01T00:00:00.000Z', { status: 'UNVERIFIED' }),
    rate('expired', 'PAYE', '2026-02-01T00:00:00.000Z', { effectiveTo: '2026-06-30T23:59:59.999Z' }),
  ]
  assert.throws(
    () => selectEffectivePayrollRate(rows, 'PAYE', '2025-12-31T23:59:59.999Z'),
    /No VERIFIED PAYE payroll rate/
  )
  // The unverified 2026-09 row must never shadow the older verified row.
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-10-01T00:00:00.000Z').id, 'old')
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-05-01T00:00:00.000Z').id, 'expired')
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-08-01T00:00:00.000Z').id, 'old')
  assert.throws(
    () => resolvePayrollRates([rate('only', 'PAYE', '2026-01-01T00:00:00.000Z')], '2026-10-01T00:00:00.000Z'),
    /NSSF_EMPLOYEE/
  )
})

test('versioned effective date selection chooses the latest VERIFIED row', () => {
  const rows = [
    rate('r_old', 'PAYE', '2026-01-01T00:00:00.000Z', { rateBps: 2000 }),
    rate('r_new', 'PAYE', '2026-06-01T00:00:00.000Z', { rateBps: 2500 }),
    rate('r_future', 'PAYE', '2027-01-01T00:00:00.000Z', { rateBps: 3000 }),
    rate('r_unverified', 'PAYE', '2026-09-01T00:00:00.000Z', { status: 'UNVERIFIED', rateBps: 9999 }),
  ]
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-03-01T00:00:00.000Z').id, 'r_old')
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-08-01T00:00:00.000Z').id, 'r_new')
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-12-31T23:59:59.999Z').id, 'r_new')
  assert.equal(selectEffectivePayrollRate(rows, 'PAYE', '2026-08-01T00:00:00.000Z').rateBps, 2500)
})

test('rate creation schema cannot smuggle verification status or amounts', () => {
  const parsed = hrPayrollRateCreateSchema.parse({
    kind: 'PAYE',
    rateBps: 1234,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    sourceReference: 'Fixture gazette notice',
  })
  assert.equal(parsed.rateBps, 1234)
  assert.equal(parsed.classification, 'CONFIDENTIAL')
  for (const forbidden of [
    'companyId', 'status', 'verifiedById', 'verifiedAt', 'postedCents',
  ]) {
    assert.throws(() => hrPayrollRateCreateSchema.parse({
      kind: 'PAYE', rateBps: 1234, effectiveFrom: '2026-01-01T00:00:00.000Z',
      sourceReference: 'Fixture gazette notice', [forbidden]: 'secret',
    }), /Unrecognized key/, `rate accepted ${forbidden}`)
  }
  assert.throws(() => hrPayrollRateCreateSchema.parse({
    kind: 'PAYE', rateBps: 1000.5, effectiveFrom: '2026-01-01T00:00:00.000Z',
    sourceReference: 'Fixture gazette notice',
  }), /int/)
  assert.throws(() => hrPayrollRateVerifySchema.parse({ verificationNote: 'ok' }), /Verification note/)
})

// ------------------------------------------------------------- payroll arithmetic

test('payroll math uses only resolved basis points and integer cents', () => {
  const result = calculatePayrollLine({
    basicCents: 1_000_000,
    allowancesCents: 100_000,
    rates: verifiedRates,
  })
  assert.equal(result.grossCents, 1_100_000)
  assert.equal(result.payeCents, 330_000)
  assert.equal(result.nssfEmployeeCents, 66_000)
  assert.equal(result.nssfEmployerCents, 132_000)
  assert.equal(result.shifCents, 30_250)
  assert.equal(result.housingLevyCents, 16_500)
  assert.equal(result.deductionsCents, 442_750)
  assert.equal(result.netCents, 657_250)
  assert.equal(result.employerCostCents, 1_232_000)
  for (const field of HR_MONEY_FIELDS) {
    if (Object.hasOwn(result, field)) assert.equal(Number.isSafeInteger(result[field]), true, field)
  }
  assert.throws(() => calculatePayrollLine({ basicCents: 100.5, rates: verifiedRates }), /integer number of cents/)
  assert.throws(() => calculatePayrollLine({ basicCents: 100, rates: {} }), /VERIFIED PAYE/)
})

test('payroll components round once using integer arithmetic', () => {
  const custom = {
    PAYE: rate('p', 'PAYE', today, { rateBps: 1234 }),
    NSSF_EMPLOYEE: rate('ne', 'NSSF_EMPLOYEE', today, { rateBps: 0 }),
    NSSF_EMPLOYER: rate('nr', 'NSSF_EMPLOYER', today, { rateBps: 0 }),
    SHIF: rate('s', 'SHIF', today, { rateBps: 0 }),
    HOUSING_LEVY: rate('h', 'HOUSING_LEVY', today, { rateBps: 0 }),
  }
  const result = calculatePayrollLine({ basicCents: 101, rates: custom })
  assert.equal(result.payeCents, 12) // 101 * 1234 / 10000 = 12.4634 -> 12
  assert.equal(result.netCents, 89)
  assert.deepEqual(result.rateSnapshot.rates.PAYE, { id: 'p', rateBps: 1234 })
})

test('payroll module contains no hardcoded statutory percentage or amount', () => {
  const source = readFileSync(new URL('../lib/hr.js', import.meta.url), 'utf8')
  const forbidden = [
    'rateBps: 3000', 'rateBps: 1600', 'rateBps: 300', 'rateBps: 200',
    'PAYE_CENTS', 'NSSF_RATE', 'SHIF_RATE', 'HOUSING_LEVY_RATE',
  ]
  for (const pattern of forbidden) {
    assert.equal(source.includes(pattern), false, `found hardcoded statutory value: ${pattern}`)
  }
  assert.match(source, /no hardcoded PAYE\/NSSF\/SHIF\/Housing Levy values/)
})

// --------------------------------------------------------- bank encryption/DLP

test('bank details are encrypted at rest and masked in public DTOs', () => {
  const encrypted = encryptString('123456789012')
  const dto = toEmployeeDto({
    id: 'emp_1',
    companyId: 'cmp_secret',
    employeeNumber: 'EMP-1',
    firstName: 'Ann',
    lastName: 'Doe',
    status: 'ACTIVE',
    employmentType: 'PERMANENT',
    hiredAt: '2026-01-01T00:00:00.000Z',
    annualLeaveBalanceDays: 21,
    bankNameEncrypted: encryptString('Fixture Bank'),
    bankAccountEncrypted: encrypted,
    kraPinEncrypted: encryptString('A000000000Z'),
    createdById: 'usr_1',
  })
  assert.equal(dto.hasBankDetails, true)
  assert.equal(dto.hasKraPin, true)
  assert.equal(dto.bankAccountMasked, '••••9012')
  assert.equal(dto.bankNameMasked, '••••Bank')
  assert.equal(dto.kraPinMasked, '••••000Z')
  const serialised = JSON.stringify(dto)
  for (const secret of ['123456789012', 'A000000000Z', 'cmp_secret', 'usr_1', 'bankAccountEncrypted']) {
    assert.equal(serialised.includes(secret), false, `DTO leaked ${secret}`)
  }
  assert.equal(maskEncrypted(null), null)
  assert.equal(maskEncrypted('not-an-envelope'), '[ENCRYPTED]')
})

test('HR write schemas fail closed on restricted free text', () => {
  const employee = {
    employeeNumber: 'EMP-1', firstName: 'Ann', lastName: 'Doe', hiredAt: today,
  }
  assert.throws(() => hrEmployeeCreateSchema.parse({
    ...employee, notes: 'Card 4111111111111111',
  }), /CARD_NUMBER/)
  assert.throws(() => hrEmployeeCreateSchema.parse({
    ...employee, bankAccount: 'National ID 12345678',
  }), /KENYAN_NATIONAL_ID/)
  assert.throws(() => hrLeaveCreateSchema.parse({
    employeeId: 'emp_1', type: 'ANNUAL', startDate: today, endDate: today,
    days: 1, reason: 'National ID 12345678',
  }), /KENYAN_NATIONAL_ID/)
  assert.throws(() => hrAttendanceUpsertSchema.parse({
    employeeId: 'emp_1', date: today, notes: 'Card 4111111111111111',
  }), /CARD_NUMBER/)
  // Whole-field KRA PIN is a legitimate identifier; embedded values still fail.
  assert.equal(hrEmployeeCreateSchema.parse({ ...employee, kraPin: 'A000000000Z' }).kraPin, 'A000000000Z')
  assert.throws(() => hrEmployeeCreateSchema.parse({
    ...employee, kraPin: 'PIN A000000000Z',
  }), /KRA_PIN/)
})

// -------------------------------------------------------------- state machines

test('contract lifecycle rejects skipped and terminal transitions', () => {
  assert.equal(assertContractTransition('DRAFT', 'ACTIVE'), true)
  assert.equal(assertContractTransition('ACTIVE', 'EXPIRED'), true)
  assert.equal(assertContractTransition('ACTIVE', 'TERMINATED'), true)
  assert.throws(() => assertContractTransition('DRAFT', 'EXPIRED'), /Cannot change contract/)
  assert.throws(() => assertContractTransition('CANCELLED', 'ACTIVE'), /Cannot change contract/)
})

test('leave decisions are only valid for submitted or draft requests', () => {
  assert.equal(assertLeaveDecision('SUBMITTED', 'APPROVE'), true)
  assert.equal(assertLeaveDecision('DRAFT', 'REJECT'), true)
  assert.throws(() => assertLeaveDecision('APPROVED', 'APPROVE'), /Cannot approve leave/)
  assert.throws(() => assertLeaveDecision('REJECTED', 'REJECT'), /Cannot reject leave/)
  assert.throws(() => assertLeaveDecision('SUBMITTED', 'TAKEN'), /Cannot taken leave/)
})

// --------------------------------------------------------------- tenant scope

test('HR tenant scope allows organisation-wide rows but never another company', () => {
  assert.deepEqual(hrTenantWhere('cmp_a', null), { companyId: 'cmp_a' })
  assert.deepEqual(hrTenantWhere('cmp_a', 'br_1'), {
    companyId: 'cmp_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(hrTenantWhere('cmp_a', 'br_1')).includes('cmp_b'), false)
})

test('date helpers and DTOs never reveal tenant internals', () => {
  assert.equal(endOfDayInstant(today), '2026-11-23T23:59:59.999Z')
  const base = { companyId: 'cmp_secret', createdById: 'usr_1', classification: 'CONFIDENTIAL' }
  const dtos = [
    toRateDto({ ...base, id: 'rate_1', kind: 'PAYE', rateBps: 1000, effectiveFrom: today, status: 'UNVERIFIED', sourceReference: 'Fixture' }),
    toEmployeeDto({
      ...base, id: 'emp_1', employeeNumber: 'EMP-1', firstName: 'Ann', lastName: 'Doe',
      status: 'ACTIVE', employmentType: 'PERMANENT', hiredAt: today, annualLeaveBalanceDays: 0,
    }),
  ]
  for (const dto of dtos) {
    assert.equal(dto.companyId, undefined)
    assert.equal(dto.createdById, undefined)
  }
  assert.equal(dtos[0].status, 'UNVERIFIED')
  assert.equal(dtos[1].hasBankDetails, false)
  assert.equal(JSON.stringify(dtos).includes('cmp_secret'), false)
})

// --------------------------------------------------------- validation and DLP

test('HR write and query schemas are strict and carry no computed amounts', () => {
  assert.deepEqual(hrActionSchema.parse({}), {})
  assert.throws(() => hrActionSchema.parse({ status: 'APPROVED' }), /Unrecognized key/)
  for (const forbidden of ['companyId', 'status', 'grossCents', 'rateBps', 'verifiedById']) {
    assert.throws(() => hrPayrollRunCreateSchema.parse({
      periodStart: today, periodEnd: today, [forbidden]: 'secret',
    }), /Unrecognized key/, `payroll run accepted ${forbidden}`)
  }
  assert.throws(() => hrPayrollRunCreateSchema.parse({
    periodStart: '23-11-2026', periodEnd: today,
  }), /YYYY-MM-DD/)
  assert.throws(() => hrEmployeeQuerySchema.parse({ companyId: 'cmp_other' }), /Unrecognized key/)
  assert.equal(hrRateQuerySchema.parse({ limit: '25' }).limit, 25)
  assert.throws(() => hrRateQuerySchema.parse({ status: 'PENDING' }), /Invalid option/)
})

// -------------------------------------------------------- permissions & events

test('HR permissions exist with separation of duties across roles', () => {
  const names = [
    'hr.employee.read', 'hr.employee.write',
    'hr.contract.read', 'hr.contract.write',
    'hr.leave.read', 'hr.leave.write', 'hr.leave.approve',
    'hr.attendance.read', 'hr.attendance.write',
    'hr.payrollrate.read', 'hr.payrollrate.write', 'hr.payrollrate.verify',
    'hr.payroll.read', 'hr.payroll.write', 'hr.payroll.approve', 'hr.payroll.post',
  ]
  assert.equal(names.length, 16)
  for (const name of names) {
    assert.equal(typeof PERMISSIONS[name], 'string', `missing ${name}`)
    assert.equal(ROLE_PERMISSIONS.ADMIN.includes(name), true, `admin missing ${name}`)
  }
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('hr.payrollrate.verify'), false)
  assert.equal(ROLE_PERMISSIONS.MANAGER.includes('hr.payroll.post'), false)
  assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes('hr.payrollrate.verify'), true)
  assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes('hr.payroll.post'), false)
  assert.equal(ROLE_PERMISSIONS.STAFF.includes('hr.payrollrate.verify'), false)
})

test('HR event schemas are registered and strictly ID/classification-only', () => {
  const cases = [
    ['EmployeeCreated', EmployeeCreatedDataSchema, {
      entityType: 'EMPLOYEE', entityId: 'emp_1', employeeId: 'emp_1', classification: 'CONFIDENTIAL',
    }],
    ['LeaveApproved', LeaveApprovedDataSchema, {
      entityType: 'LEAVE_REQUEST', entityId: 'lev_1', leaveRequestId: 'lev_1',
      employeeId: 'emp_1', classification: 'CONFIDENTIAL',
    }],
    ['PayrollRateVerified', PayrollRateVerifiedDataSchema, {
      entityType: 'PAYROLL_RATE', entityId: 'rate_1', payrollRateId: 'rate_1', classification: 'CONFIDENTIAL',
    }],
    ['PayrollRunCalculated', PayrollRunCalculatedDataSchema, {
      entityType: 'PAYROLL_RUN', entityId: 'pay_1', payrollRunId: 'pay_1', classification: 'CONFIDENTIAL',
    }],
    ['PayrollRunApproved', PayrollRunApprovedDataSchema, {
      entityType: 'PAYROLL_RUN', entityId: 'pay_1', payrollRunId: 'pay_1', classification: 'CONFIDENTIAL',
    }],
  ]
  for (const [name, schema, valid] of cases) {
    assert.equal(typeof DomainEventSchemas[name]?.parse, 'function', `missing ${name}`)
    assert.deepEqual(schema.parse(valid), valid)
    for (const forbidden of [
      'companyId', 'branchId', 'actorId', 'name', 'bankAccount', 'kraPin',
      'rateBps', 'sourceReference', 'verificationNote', 'grossCents', 'status', 'reason',
    ]) {
      assert.throws(() => schema.parse({ ...valid, [forbidden]: 'secret' }), /Unrecognized key/)
    }
  }
})

test('HR socket frames route only to the company room and carry no record content', () => {
  const emitted = []
  const io = {
    to(room) {
      return { emit(socketEvent, payload) { emitted.push({ room, socketEvent, payload }) } }
    },
  }
  const event = {
    id: 'evt_1', type: 'PayrollRateVerified', version: 1,
    occurredAt: new Date(0).toISOString(), correlationId: 'cor_1',
    companyId: 'cmp_a', branchId: 'br_1', actorId: 'usr_1',
    data: {
      entityType: 'PAYROLL_RATE', entityId: 'rate_1',
      payrollRateId: 'rate_1', classification: 'CONFIDENTIAL',
    },
  }
  assert.equal(dispatchEvent(io, event), 1)
  assert.deepEqual(emitted, [{
    room: 'company:cmp_a',
    socketEvent: 'hr:rate',
    payload: {
      eventId: 'evt_1', type: 'PayrollRateVerified', occurredAt: event.occurredAt,
      correlationId: 'cor_1', data: event.data,
    },
  }])
  const serialised = JSON.stringify(emitted)
  for (const secret of ['br_1', 'usr_1', 'cmp_b', 'rateBps', '3000']) {
    assert.equal(serialised.includes(secret), false)
  }
})
