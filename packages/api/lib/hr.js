// Phase 11 HR lifecycle service.
//
// Employees, contracts, leave, attendance and payroll are tenant/branch scoped
// and use the Prisma proxy `db` from lib/tenant.js. Bank, account and KRA PIN
// values are encrypted at rest and only ever exposed as masks in DTOs.
//
// Every statutory payroll percentage comes from a versioned, VERIFIED
// PayrollRate row. There are no hardcoded PAYE/NSSF/SHIF/Housing Levy values.
// A row is always created UNVERIFIED; only a separate authorised verify action
// makes it available to calculations. All arithmetic uses integer cents and
// basis points via BigInt, rounding once per component.
//
// Audit metadata and domain events contain opaque IDs and classification only.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { encryptString, decryptString } from './crypto.js'
import { createJournal, postJournal } from './finance.js'

const MAX_LIST = 200
const BPS_SCALE = 10_000n

export const PAYROLL_RATE_KINDS = Object.freeze([
  'PAYE', 'NSSF_EMPLOYEE', 'NSSF_EMPLOYER', 'SHIF', 'HOUSING_LEVY',
])

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || 'cmp_comet'
}

function limitOf(value, fallback = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), MAX_LIST)
}

function isoDay(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid date')
  return date.toISOString().slice(0, 10)
}

function isoInstant(value, label = 'Timestamp') {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Invalid ${label}`)
  return date.toISOString()
}

/** Inclusive end-of-day instant so same-day rate changes remain effective. */
export function endOfDayInstant(value) {
  return `${isoDay(value)}T23:59:59.999Z`
}

function principalOf(actor) {
  const ctx = getTenantContext() || {}
  return {
    userId: actor?.userId ?? ctx.actorId ?? null,
    companyId: actor?.companyId || ctx.companyId || 'cmp_comet',
    branchId: actor?.branchId ?? ctx.branchId ?? null,
    correlationId: actor?.correlationId || ctx.correlationId || null,
  }
}

async function auditMutation(actor, action, resourceType, resourceId, metadata = {}) {
  const principal = principalOf(actor)
  const input = {
    actorId: principal.userId,
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata,
    correlationId: principal.correlationId,
  }
  if (actor?.req) return recordRequestAudit(actor.req, input)
  return recordAudit(input)
}

async function hrEvent(type, data, options = {}) {
  return emitEvent(type, data, { aggregateType: 'HR', ...options })
}

function assertSafeIntegerCents(value, label = 'Amount') {
  const cents = Number(value)
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new HttpError(400, `${label} must be a non-negative integer number of cents`)
  }
  return cents
}

function assertBps(value, label = 'Rate') {
  const bps = Number(value)
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 1_000_000) {
    throw new HttpError(409, `${label} has an invalid rate in basis points`)
  }
  return bps
}

/** Tenant + optional branch scope. Branch scope allows organisation-wide rows. */
export function hrTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) return { ...scope, OR: [{ branchId: null }, { branchId }] }
  return scope
}

// ---------------------------------------------------- payroll rate resolution

/**
 * Pick the single most recent VERIFIED row effective on `onDate`. UNVERIFIED
 * rows are invisible to payroll. Gaps and absent kinds fail closed with 409.
 */
export function selectEffectivePayrollRate(rates, kind, onDate) {
  const at = new Date(isoInstant(onDate, 'effective date')).getTime()
  const eligible = (rates || []).filter((rate) => {
    if (!rate || rate.kind !== kind || rate.status !== 'VERIFIED') return false
    const from = new Date(rate.effectiveFrom).getTime()
    const to = rate.effectiveTo ? new Date(rate.effectiveTo).getTime() : null
    return Number.isFinite(from) && from <= at && (to === null || Number.isFinite(to) && to >= at)
  })
  eligible.sort((a, b) => (
    new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    || String(b.id).localeCompare(String(a.id))
  ))
  if (!eligible.length) {
    throw new HttpError(409, `No VERIFIED ${kind} payroll rate is effective for this date`)
  }
  return eligible[0]
}

/** Resolve all five statutory components used by a payroll calculation. */
export function resolvePayrollRates(rates, onDate) {
  const resolved = {}
  for (const kind of PAYROLL_RATE_KINDS) {
    resolved[kind] = selectEffectivePayrollRate(rates, kind, onDate)
  }
  return resolved
}

/**
 * Pure integer-cent payroll math. `rates` is a map of kind -> resolved row.
 * No statutory percentage or amount exists in this module; every basis-point
 * value is read from a VERIFIED row supplied by the caller.
 */
export function calculatePayrollLine({ basicCents, allowancesCents = 0, rates } = {}) {
  const basic = assertSafeIntegerCents(basicCents, 'Basic pay')
  const allowance = assertSafeIntegerCents(allowancesCents, 'Allowances')
  const gross = basic + allowance
  if (!Number.isSafeInteger(gross)) throw new HttpError(400, 'Invalid gross pay')

  const component = (kind) => {
    const rate = rates?.[kind]
    if (!rate) throw new HttpError(409, `A VERIFIED ${kind} payroll rate is required`)
    const bps = BigInt(assertBps(rate.rateBps, kind))
    return Number((BigInt(gross) * bps + BPS_SCALE / 2n) / BPS_SCALE)
  }

  const payeCents = component('PAYE')
  const nssfEmployeeCents = component('NSSF_EMPLOYEE')
  const nssfEmployerCents = component('NSSF_EMPLOYER')
  const shifCents = component('SHIF')
  const housingLevyCents = component('HOUSING_LEVY')
  const deductionsCents = payeCents + nssfEmployeeCents + shifCents + housingLevyCents
  const netCents = gross - deductionsCents
  if (!Number.isSafeInteger(deductionsCents) || netCents < 0) {
    throw new HttpError(409, 'Payroll deductions exceed gross pay')
  }

  const rateSnapshot = {
    rates: Object.fromEntries(PAYROLL_RATE_KINDS.map((kind) => [kind, {
      id: rates[kind].id ?? null,
      rateBps: assertBps(rates[kind].rateBps, kind),
    }])),
  }

  return {
    basicCents: basic,
    allowancesCents: allowance,
    grossCents: gross,
    payeCents,
    nssfEmployeeCents,
    nssfEmployerCents,
    shifCents,
    housingLevyCents,
    deductionsCents,
    netCents,
    employerCostCents: gross + nssfEmployerCents,
    rateSnapshot,
  }
}

// ------------------------------------------------------------------- DTOs

/** Never returns plaintext, decrypted values or raw encrypted envelopes. */
export function maskEncrypted(value) {
  if (!value) return null
  try {
    const plain = decryptString(String(value))
    if (!plain) return null
    return `••••${plain.slice(-4)}`
  } catch {
    return '[ENCRYPTED]'
  }
}

function isoOrNull(value) {
  return value ? isoInstant(value) : null
}

export function toEmployeeDto(row) {
  if (!row) return null
  const hasBankDetails = Boolean(row.bankNameEncrypted || row.bankAccountEncrypted)
  const hasKraPin = Boolean(row.kraPinEncrypted)
  return {
    id: row.id,
    employeeNumber: row.employeeNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email ?? null,
    phone: row.phone ?? null,
    userId: row.userId ?? null,
    branchId: row.branchId ?? null,
    departmentId: row.departmentId ?? null,
    jobTitleId: row.jobTitleId ?? null,
    status: row.status,
    employmentType: row.employmentType,
    hiredAt: isoOrNull(row.hiredAt),
    terminatedAt: isoOrNull(row.terminatedAt),
    annualLeaveBalanceDays: row.annualLeaveBalanceDays,
    hasBankDetails,
    hasKraPin,
    bankNameMasked: maskEncrypted(row.bankNameEncrypted),
    bankAccountMasked: maskEncrypted(row.bankAccountEncrypted),
    kraPinMasked: maskEncrypted(row.kraPinEncrypted),
    notes: row.notes ?? null,
    classification: row.classification,
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  }
}

export function toContractDto(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    employeeId: row.employeeId,
    status: row.status,
    employmentType: row.employmentType,
    startDate: isoOrNull(row.startDate),
    endDate: isoOrNull(row.endDate),
    basicSalaryCents: row.basicSalaryCents,
    allowancesCents: row.allowancesCents,
    currency: row.currency,
    notes: row.notes ?? null,
    classification: row.classification,
    activatedAt: isoOrNull(row.activatedAt),
    terminatedAt: isoOrNull(row.terminatedAt),
    cancelledAt: isoOrNull(row.cancelledAt),
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  }
}

export function toRateDto(row) {
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind,
    rateBps: row.rateBps,
    effectiveFrom: isoOrNull(row.effectiveFrom),
    effectiveTo: isoOrNull(row.effectiveTo),
    sourceReference: row.sourceReference,
    verificationNote: row.verificationNote ?? null,
    status: row.status,
    verifiedById: row.verifiedById ?? null,
    verifiedAt: isoOrNull(row.verifiedAt),
    classification: row.classification,
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  }
}

export function toLeaveDto(row) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    employeeId: row.employeeId,
    type: row.type,
    status: row.status,
    startDate: isoOrNull(row.startDate),
    endDate: isoOrNull(row.endDate),
    days: row.days,
    reason: row.reason,
    approvedById: row.approvedById ?? null,
    approvedAt: isoOrNull(row.approvedAt),
    rejectedAt: isoOrNull(row.rejectedAt),
    takenAt: isoOrNull(row.takenAt),
    cancelledAt: isoOrNull(row.cancelledAt),
    classification: row.classification,
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  }
}

export function toAttendanceDto(row) {
  if (!row) return null
  return {
    id: row.id,
    employeeId: row.employeeId,
    date: isoDay(row.date),
    hoursWorkedMinutes: row.hoursWorkedMinutes,
    checkInAt: isoOrNull(row.checkInAt),
    checkOutAt: isoOrNull(row.checkOutAt),
    notes: row.notes ?? null,
    classification: row.classification,
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  }
}

export function toPayrollLineDto(row) {
  if (!row) return null
  return {
    id: row.id,
    runId: row.runId,
    employeeId: row.employeeId,
    basicCents: row.basicCents,
    allowancesCents: row.allowancesCents,
    grossCents: row.grossCents,
    payeCents: row.payeCents,
    nssfEmployeeCents: row.nssfEmployeeCents,
    nssfEmployerCents: row.nssfEmployerCents,
    shifCents: row.shifCents,
    housingLevyCents: row.housingLevyCents,
    deductionsCents: row.deductionsCents,
    netCents: row.netCents,
    rateSnapshot: row.rateSnapshot ?? null,
    classification: row.classification,
  }
}

export function toPayrollRunDto(row, lines = []) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    periodStart: isoOrNull(row.periodStart),
    periodEnd: isoOrNull(row.periodEnd),
    employeeIds: row.employeeIds || [],
    status: row.status,
    currency: row.currency,
    grossCents: row.grossCents,
    deductionsCents: row.deductionsCents,
    employerCostCents: row.employerCostCents,
    netCents: row.netCents,
    calculatedAt: isoOrNull(row.calculatedAt),
    approvedById: row.approvedById ?? null,
    approvedAt: isoOrNull(row.approvedAt),
    postedById: row.postedById ?? null,
    postedAt: isoOrNull(row.postedAt),
    financeJournalId: row.financeJournalId ?? null,
    notes: row.notes ?? null,
    classification: row.classification,
    lines: (lines || row.lines || []).map(toPayrollLineDto),
    createdAt: isoOrNull(row.createdAt),
    updatedAt: isoOrNull(row.updatedAt),
  }
}

// ------------------------------------------------------------ data helpers

function isNumberConflict(error) {
  if (error?.code !== 'P2002') return false
  const target = error?.meta?.target
  if (!target) return true
  return (Array.isArray(target) ? target : [target]).some((part) => String(part).includes('number'))
}

async function nextNumber(model, prefix, companyId) {
  const year = new Date().getUTCFullYear()
  const pattern = `${prefix}-${year}-`
  const count = await db[model].count({ where: { companyId, number: { startsWith: pattern } } })
  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate = `${pattern}${String(count + 1 + offset).padStart(4, '0')}`
    // eslint-disable-next-line no-await-in-loop
    const existing = await db[model].findFirst({ where: { companyId, number: candidate }, select: { id: true } })
    if (!existing) return candidate
  }
  throw new HttpError(409, 'Unable to allocate a document number')
}

async function createWithNumber(model, prefix, buildData, companyId, attempts = 5) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const number = await nextNumber(model, prefix, companyId)
    try {
      // eslint-disable-next-line no-await-in-loop
      return await db[model].create({ data: buildData(number) })
    } catch (error) {
      if (!isNumberConflict(error)) throw error
      lastError = error
    }
  }
  throw lastError || new HttpError(409, 'Unable to allocate a document number')
}

async function findRecord(model, id, label, actor = null) {
  const principal = principalOf(actor)
  const row = await db[model].findFirst({
    where: { ...hrTenantWhere(principal.companyId, principal.branchId), id },
  })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

function listWhere(principal, query = {}, extra = {}) {
  return {
    ...hrTenantWhere(principal.companyId, principal.branchId),
    ...(query.status ? { status: query.status } : {}),
    ...extra,
  }
}

async function resolveEmployee(companyId, employeeId) {
  const employee = await db.employee.findFirst({ where: { id: employeeId, companyId } })
  if (!employee) throw new HttpError(404, 'Employee not found')
  if (employee.status === 'TERMINATED') throw new HttpError(409, 'Employee is terminated')
  return employee
}

async function resolveBranch(companyId, branchId) {
  if (!branchId) return null
  const branch = await db.branch.findFirst({ where: { id: branchId, companyId } })
  if (!branch) throw new HttpError(404, 'Branch not found')
  return branch.id
}

async function resolveRelated(companyId, userId, departmentId, jobTitleId) {
  if (userId) {
    const user = await db.user.findFirst({ where: { id: userId, companyId }, select: { id: true } })
    if (!user) throw new HttpError(404, 'User not found')
  }
  if (departmentId) {
    const department = await db.department.findFirst({ where: { id: departmentId, companyId }, select: { id: true } })
    if (!department) throw new HttpError(404, 'Department not found')
  }
  if (jobTitleId) {
    const jobTitle = await db.jobTitle.findFirst({ where: { id: jobTitleId, companyId }, select: { id: true } })
    if (!jobTitle) throw new HttpError(404, 'Job title not found')
  }
}

function dateRangeWhere(field, query) {
  if (!query.from && !query.to) return {}
  return {
    [field]: {
      ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
      ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
    },
  }
}

// ---------------------------------------------------------------- employees

export async function listEmployees(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.employee.findMany({
    where: listWhere(principal, query, {
      ...(query.branchId ? { branchId: query.branchId } : {}),
    }),
    orderBy: [{ employeeNumber: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toEmployeeDto)
}

export async function getEmployee(id, actor = null) {
  return toEmployeeDto(await findRecord('employee', id, 'Employee', actor))
}

function encryptedFields(input, data) {
  if (Object.hasOwn(input, 'bankName')) {
    data.bankNameEncrypted = input.bankName ? encryptString(input.bankName) : null
  }
  if (Object.hasOwn(input, 'bankAccount')) {
    data.bankAccountEncrypted = input.bankAccount ? encryptString(input.bankAccount) : null
  }
  if (Object.hasOwn(input, 'kraPin')) {
    data.kraPinEncrypted = input.kraPin ? encryptString(input.kraPin) : null
  }
  return data
}

export async function createEmployee(input, actor = null) {
  const principal = principalOf(actor)
  await resolveRelated(principal.companyId, input.userId, input.departmentId, input.jobTitleId)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const data = {
    companyId: principal.companyId,
    branchId,
    employeeNumber: input.employeeNumber,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email || null,
    phone: input.phone || null,
    userId: input.userId || null,
    departmentId: input.departmentId || null,
    jobTitleId: input.jobTitleId || null,
    status: input.status || 'PROBATION',
    employmentType: input.employmentType || 'PERMANENT',
    hiredAt: new Date(`${input.hiredAt}T00:00:00.000Z`),
    annualLeaveBalanceDays: input.annualLeaveBalanceDays ?? 0,
    notes: input.notes || null,
    classification: input.classification || 'CONFIDENTIAL',
    createdById: principal.userId,
  }
  encryptedFields(input, data)
  const row = await db.employee.create({ data })
  await auditMutation(actor, 'hr.employee.created', 'Employee', row.id, {
    employeeId: row.id,
    classification: row.classification,
  })
  await hrEvent('EmployeeCreated', {
    entityType: 'EMPLOYEE',
    entityId: row.id,
    employeeId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id, branchId: row.branchId })
  return toEmployeeDto(row)
}

export async function updateEmployee(id, input, actor = null) {
  const existing = await findRecord('employee', id, 'Employee', actor)
  const principal = principalOf(actor)
  await resolveRelated(principal.companyId, input.userId, input.departmentId, input.jobTitleId)
  const data = { updatedAt: new Date() }
  const direct = [
    'firstName', 'lastName', 'email', 'phone', 'userId', 'departmentId', 'jobTitleId',
    'status', 'employmentType', 'annualLeaveBalanceDays', 'notes', 'classification',
  ]
  for (const key of direct) {
    if (Object.hasOwn(input, key)) data[key] = input[key]
  }
  if (Object.hasOwn(input, 'branchId')) data.branchId = await resolveBranch(principal.companyId, input.branchId)
  if (Object.hasOwn(input, 'hiredAt')) data.hiredAt = new Date(`${input.hiredAt}T00:00:00.000Z`)
  if (Object.hasOwn(input, 'terminatedAt')) {
    data.terminatedAt = input.terminatedAt ? new Date(`${input.terminatedAt}T00:00:00.000Z`) : null
  }
  encryptedFields(input, data)
  const row = await db.employee.update({ where: { id: existing.id }, data })
  await auditMutation(actor, 'hr.employee.updated', 'Employee', row.id, {
    employeeId: row.id,
    classification: row.classification,
  })
  return toEmployeeDto(row)
}

// ------------------------------------------------------------------ contracts

export async function listContracts(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.employmentContract.findMany({
    where: listWhere(principal, query, {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toContractDto)
}

export async function getContract(id, actor = null) {
  return toContractDto(await findRecord('employmentContract', id, 'Employment contract', actor))
}

export async function createContract(input, actor = null) {
  const principal = principalOf(actor)
  await resolveEmployee(principal.companyId, input.employeeId)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`)
  const endDate = input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null
  if (endDate && endDate < startDate) throw new HttpError(400, 'Contract end date must not precede its start date')
  const row = await createWithNumber('employmentContract', 'EMP', (number) => ({
    companyId: principal.companyId,
    branchId,
    employeeId: input.employeeId,
    number,
    status: 'DRAFT',
    employmentType: input.employmentType || 'PERMANENT',
    startDate,
    endDate,
    basicSalaryCents: assertSafeIntegerCents(input.basicSalaryCents, 'Basic salary'),
    allowancesCents: assertSafeIntegerCents(input.allowancesCents ?? 0, 'Allowances'),
    currency: input.currency || 'KES',
    notes: input.notes || null,
    classification: input.classification || 'CONFIDENTIAL',
    createdById: principal.userId,
  }), principal.companyId)
  await auditMutation(actor, 'hr.contract.created', 'EmploymentContract', row.id, {
    contractId: row.id,
    employeeId: row.employeeId,
    classification: row.classification,
  })
  return toContractDto(row)
}

const CONTRACT_TRANSITIONS = Object.freeze({
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['EXPIRED', 'TERMINATED', 'CANCELLED'],
  EXPIRED: [],
  TERMINATED: [],
  CANCELLED: [],
})

/** Pure lifecycle guard shared with contract tests. */
export function assertContractTransition(from, to) {
  if (!CONTRACT_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot change contract from ${from} to ${to}`)
  }
  return true
}

export async function transitionContract(id, status, actor = null) {
  const row = await findRecord('employmentContract', id, 'Employment contract', actor)
  assertContractTransition(row.status, status)
  const stamped = {
    ...(status === 'ACTIVE' ? { activatedAt: new Date() } : {}),
    ...(status === 'TERMINATED' ? { terminatedAt: new Date() } : {}),
    ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
  }
  const updated = await db.employmentContract.update({
    where: { id: row.id },
    data: { status, ...stamped, updatedAt: new Date() },
  })
  await auditMutation(actor, `hr.contract.${status.toLowerCase()}`, 'EmploymentContract', row.id, {
    contractId: row.id,
    employeeId: row.employeeId,
    classification: row.classification,
  })
  return toContractDto(updated)
}

// -------------------------------------------------------------- payroll rates

export async function listPayrollRates(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.payrollRate.findMany({
    where: listWhere(principal, query, {
      ...(query.kind ? { kind: query.kind } : {}),
    }),
    orderBy: [{ effectiveFrom: 'desc' }, { kind: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toRateDto)
}

export async function getPayrollRate(id, actor = null) {
  return toRateDto(await findRecord('payrollRate', id, 'Payroll rate', actor))
}

export async function createPayrollRate(input, actor = null) {
  const principal = principalOf(actor)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const row = await db.payrollRate.create({
    data: {
      companyId: principal.companyId,
      branchId,
      kind: input.kind,
      rateBps: assertBps(input.rateBps, 'Rate'),
      effectiveFrom: new Date(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : null,
      sourceReference: input.sourceReference,
      verificationNote: input.verificationNote || null,
      // Creation can never yield a usable statutory rate.
      status: 'UNVERIFIED',
      verifiedById: null,
      verifiedAt: null,
      classification: input.classification || 'CONFIDENTIAL',
      createdById: principal.userId,
    },
  })
  await auditMutation(actor, 'hr.payrollrate.created', 'PayrollRate', row.id, {
    payrollRateId: row.id,
    classification: row.classification,
  })
  return toRateDto(row)
}

export async function verifyPayrollRate(id, input, actor = null) {
  const row = await findRecord('payrollRate', id, 'Payroll rate', actor)
  if (row.status === 'VERIFIED') throw new HttpError(409, 'Payroll rate is already verified')
  const principal = principalOf(actor)
  if (!principal.userId) throw new HttpError(409, 'An authenticated principal is required to verify payroll rates')
  const verificationNote = String(input.verificationNote || '').trim()
  if (verificationNote.length < 5) throw new HttpError(400, 'Verification note is required')
  const updated = await db.payrollRate.update({
    where: { id: row.id },
    data: {
      status: 'VERIFIED',
      verificationNote,
      verifiedById: principal.userId,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'hr.payrollrate.verified', 'PayrollRate', row.id, {
    payrollRateId: row.id,
    classification: row.classification,
  })
  await hrEvent('PayrollRateVerified', {
    entityType: 'PAYROLL_RATE',
    entityId: row.id,
    payrollRateId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id, branchId: row.branchId })
  return toRateDto(updated)
}

// -------------------------------------------------------------------- leave

export async function listLeaveRequests(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.leaveRequest.findMany({
    where: listWhere(principal, query, {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
    }),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toLeaveDto)
}

export async function getLeaveRequest(id, actor = null) {
  return toLeaveDto(await findRecord('leaveRequest', id, 'Leave request', actor))
}

export async function createLeaveRequest(input, actor = null) {
  const principal = principalOf(actor)
  await resolveEmployee(principal.companyId, input.employeeId)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const startDate = new Date(`${input.startDate}T00:00:00.000Z`)
  const endDate = new Date(`${input.endDate}T00:00:00.000Z`)
  if (endDate < startDate) throw new HttpError(400, 'Leave end date must not precede its start date')
  const inclusiveDays = Math.floor((endDate - startDate) / 86_400_000) + 1
  if (input.days > inclusiveDays) throw new HttpError(400, 'Leave days exceed the requested date range')
  const row = await createWithNumber('leaveRequest', 'LEV', (number) => ({
    companyId: principal.companyId,
    branchId,
    employeeId: input.employeeId,
    number,
    type: input.type,
    status: 'SUBMITTED',
    startDate,
    endDate,
    days: input.days,
    reason: input.reason,
    classification: input.classification || 'CONFIDENTIAL',
    createdById: principal.userId,
  }), principal.companyId)
  await auditMutation(actor, 'hr.leave.created', 'LeaveRequest', row.id, {
    leaveRequestId: row.id,
    employeeId: row.employeeId,
    classification: row.classification,
  })
  return toLeaveDto(row)
}

const LEAVE_DECISION_TRANSITIONS = Object.freeze({
  APPROVE: ['DRAFT', 'SUBMITTED'],
  REJECT: ['DRAFT', 'SUBMITTED'],
})

/** Pure decision guard so approval rules are unit-testable without a database. */
export function assertLeaveDecision(from, decision) {
  if (!LEAVE_DECISION_TRANSITIONS[decision]?.includes(from)) {
    throw new HttpError(409, `Cannot ${decision.toLowerCase()} leave from ${from}`)
  }
  return true
}

export async function decideLeaveRequest(id, input, actor = null) {
  const row = await findRecord('leaveRequest', id, 'Leave request', actor)
  assertLeaveDecision(row.status, input.decision)
  const principal = principalOf(actor)
  if (input.decision === 'APPROVE') {
    if (row.type === 'ANNUAL') {
      const employee = await db.employee.findFirst({
        where: { id: row.employeeId, companyId: principal.companyId },
        select: { annualLeaveBalanceDays: true },
      })
      if (!employee) throw new HttpError(404, 'Employee not found')
      if (employee.annualLeaveBalanceDays < row.days) {
        throw new HttpError(409, 'Insufficient annual leave balance')
      }
      await db.employee.update({
        where: { id: row.employeeId },
        data: { annualLeaveBalanceDays: { decrement: row.days } },
      })
    }
    const updated = await db.leaveRequest.update({
      where: { id: row.id },
      data: {
        status: 'APPROVED',
        approvedById: principal.userId,
        approvedAt: new Date(),
        classification: row.classification,
      },
    })
    await auditMutation(actor, 'hr.leave.approved', 'LeaveRequest', row.id, {
      leaveRequestId: row.id,
      employeeId: row.employeeId,
      classification: row.classification,
    })
    await hrEvent('LeaveApproved', {
      entityType: 'LEAVE_REQUEST',
      entityId: row.id,
      leaveRequestId: row.id,
      employeeId: row.employeeId,
      classification: row.classification,
    }, { aggregateId: row.id, branchId: row.branchId })
    return toLeaveDto(updated)
  }

  const updated = await db.leaveRequest.update({
    where: { id: row.id },
    data: { status: 'REJECTED', rejectedAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'hr.leave.rejected', 'LeaveRequest', row.id, {
    leaveRequestId: row.id,
    employeeId: row.employeeId,
    classification: row.classification,
  })
  return toLeaveDto(updated)
}

// ---------------------------------------------------------------- attendance

export async function listAttendance(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.attendanceRecord.findMany({
    where: listWhere(principal, query, {
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...dateRangeWhere('date', query),
    }),
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toAttendanceDto)
}

export async function getAttendance(id, actor = null) {
  return toAttendanceDto(await findRecord('attendanceRecord', id, 'Attendance record', actor))
}

export async function upsertAttendance(input, actor = null) {
  const principal = principalOf(actor)
  await resolveEmployee(principal.companyId, input.employeeId)
  const branchId = await resolveBranch(principal.companyId, input.branchId)
  const date = new Date(`${input.date}T00:00:00.000Z`)
  const data = {
    companyId: principal.companyId,
    branchId,
    employeeId: input.employeeId,
    date,
    hoursWorkedMinutes: input.hoursWorkedMinutes ?? 0,
    checkInAt: input.checkInAt ? new Date(input.checkInAt) : null,
    checkOutAt: input.checkOutAt ? new Date(input.checkOutAt) : null,
    notes: input.notes || null,
    classification: input.classification || 'CONFIDENTIAL',
    createdById: principal.userId,
  }
  const row = await db.attendanceRecord.upsert({
    where: {
      companyId_employeeId_date: {
        companyId: principal.companyId,
        employeeId: input.employeeId,
        date,
      },
    },
    create: data,
    update: {
      hoursWorkedMinutes: data.hoursWorkedMinutes,
      checkInAt: data.checkInAt,
      checkOutAt: data.checkOutAt,
      notes: data.notes,
      branchId: data.branchId,
      classification: data.classification,
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'hr.attendance.recorded', 'AttendanceRecord', row.id, {
    attendanceId: row.id,
    employeeId: row.employeeId,
    classification: row.classification,
  })
  return toAttendanceDto(row)
}

// ------------------------------------------------------------------- payroll

export async function listPayrollRuns(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.payrollRun.findMany({
    where: listWhere(principal, query),
    orderBy: [{ number: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map((row) => toPayrollRunDto(row))
}

export async function getPayrollRun(id, actor = null) {
  const row = await findRecord('payrollRun', id, 'Payroll run', actor)
  const lines = await db.payrollLine.findMany({
    where: { companyId: row.companyId, runId: row.id },
    orderBy: [{ employeeId: 'asc' }],
  })
  return toPayrollRunDto(row, lines)
}

export async function createPayrollRun(input, actor = null) {
  const principal = principalOf(actor)
  const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`)
  const periodEnd = new Date(`${input.periodEnd}T23:59:59.999Z`)
  if (periodEnd < periodStart) throw new HttpError(400, 'Payroll period end must not precede its start')
  const branchId = await resolveBranch(principal.companyId, input.branchId)

  let employeeIds = input.employeeIds || []
  if (employeeIds.length) {
    const found = await db.employee.findMany({
      where: { companyId: principal.companyId, id: { in: employeeIds } },
      select: { id: true, status: true },
    })
    if (found.length !== new Set(employeeIds).size) throw new HttpError(404, 'One or more employees were not found')
    if (found.some((employee) => employee.status === 'TERMINATED')) {
      throw new HttpError(409, 'Terminated employees cannot be included in a payroll run')
    }
    employeeIds = [...new Set(employeeIds)]
  } else {
    const active = await db.employee.findMany({
      where: {
        ...hrTenantWhere(principal.companyId, principal.branchId),
        status: { in: ['ACTIVE', 'PROBATION', 'ON_LEAVE'] },
      },
      select: { id: true },
      orderBy: [{ employeeNumber: 'asc' }],
    })
    employeeIds = active.map((employee) => employee.id)
  }
  if (!employeeIds.length) throw new HttpError(409, 'No eligible employees for this payroll run')

  const row = await createWithNumber('payrollRun', 'PAY', (number) => ({
    companyId: principal.companyId,
    branchId,
    number,
    periodStart,
    periodEnd,
    employeeIds,
    status: 'DRAFT',
    currency: 'KES',
    notes: input.notes || null,
    classification: input.classification || 'CONFIDENTIAL',
    createdById: principal.userId,
  }), principal.companyId)
  await auditMutation(actor, 'hr.payroll.created', 'PayrollRun', row.id, {
    payrollRunId: row.id,
    classification: row.classification,
  })
  return toPayrollRunDto(row)
}

export async function calculatePayrollRun(id, actor = null) {
  const row = await findRecord('payrollRun', id, 'Payroll run', actor)
  if (row.status !== 'DRAFT') throw new HttpError(409, 'Only draft payroll runs can be calculated')

  const effectiveDate = endOfDayInstant(row.periodEnd)
  const storedRates = await db.payrollRate.findMany({
    where: {
      companyId: row.companyId,
      status: 'VERIFIED',
      effectiveFrom: { lte: new Date(effectiveDate) },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date(effectiveDate) } }],
    },
  })
  const rates = resolvePayrollRates(storedRates, effectiveDate)

  const lineData = []
  for (const employeeId of row.employeeIds || []) {
    // eslint-disable-next-line no-await-in-loop
    const employee = await db.employee.findFirst({
      where: { id: employeeId, companyId: row.companyId, status: { not: 'TERMINATED' } },
      select: { id: true },
    })
    if (!employee) throw new HttpError(409, 'An employee on this run is no longer eligible')
    // eslint-disable-next-line no-await-in-loop
    const contract = await db.employmentContract.findFirst({
      where: {
        companyId: row.companyId,
        employeeId,
        status: 'ACTIVE',
        startDate: { lte: new Date(effectiveDate) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(isoDay(row.periodStart)) } }],
      },
      orderBy: [{ startDate: 'desc' }],
    })
    if (!contract) throw new HttpError(409, 'An active employment contract is required for each payroll line')
    const calculated = calculatePayrollLine({
      basicCents: contract.basicSalaryCents,
      allowancesCents: contract.allowancesCents,
      rates,
    })
    lineData.push({
      companyId: row.companyId,
      branchId: row.branchId,
      runId: row.id,
      employeeId,
      ...calculated,
      classification: row.classification,
    })
  }

  const totals = lineData.reduce((sum, line) => ({
    grossCents: sum.grossCents + line.grossCents,
    deductionsCents: sum.deductionsCents + line.deductionsCents,
    employerCostCents: sum.employerCostCents + line.employerCostCents,
    netCents: sum.netCents + line.netCents,
  }), { grossCents: 0, deductionsCents: 0, employerCostCents: 0, netCents: 0 })
  if (Object.values(totals).some((value) => !Number.isSafeInteger(value))) {
    throw new HttpError(409, 'Payroll totals exceed safe integer cents')
  }

  // Each statement goes through the tenant proxy so RLS is applied. A raw
  // $transaction array would bypass set_config and must not be used here.
  await db.payrollLine.deleteMany({ where: { runId: row.id, companyId: row.companyId } })
  await db.payrollLine.createMany({ data: lineData })
  await db.payrollRun.update({
    where: { id: row.id },
    data: { ...totals, status: 'CALCULATED', calculatedAt: new Date(), updatedAt: new Date() },
  })
  await auditMutation(actor, 'hr.payroll.calculated', 'PayrollRun', row.id, {
    payrollRunId: row.id,
    classification: row.classification,
  })
  await hrEvent('PayrollRunCalculated', {
    entityType: 'PAYROLL_RUN',
    entityId: row.id,
    payrollRunId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id, branchId: row.branchId })
  return getPayrollRun(row.id, actor)
}

export async function approvePayrollRun(id, actor = null) {
  const row = await findRecord('payrollRun', id, 'Payroll run', actor)
  if (row.status !== 'CALCULATED') throw new HttpError(409, 'Only calculated payroll runs can be approved')
  const principal = principalOf(actor)
  const updated = await db.payrollRun.update({
    where: { id: row.id },
    data: {
      status: 'APPROVED',
      approvedById: principal.userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'hr.payroll.approved', 'PayrollRun', row.id, {
    payrollRunId: row.id,
    classification: row.classification,
  })
  await hrEvent('PayrollRunApproved', {
    entityType: 'PAYROLL_RUN',
    entityId: row.id,
    payrollRunId: row.id,
    classification: row.classification,
  }, { aggregateId: row.id, branchId: row.branchId })
  return toPayrollRunDto(updated, await db.payrollLine.findMany({ where: { runId: row.id } }))
}

async function resolveSystemAccounts(companyId) {
  const codes = ['EXPENSE', 'BANK', 'AP_CONTROL']
  const accounts = await Promise.all(codes.map((systemCode) => db.financeAccount.findFirst({
    where: { companyId, systemCode, isActive: true },
    select: { id: true, systemCode: true },
  })))
  const missing = codes.filter((code, index) => !accounts[index])
  if (missing.length) throw new HttpError(409, `Chart of accounts is missing: ${missing.join(', ')}`)
  return Object.fromEntries(accounts.map((account) => [account.systemCode, account.id]))
}

export async function postPayrollRun(id, actor = null) {
  const row = await findRecord('payrollRun', id, 'Payroll run', actor)
  if (row.status !== 'APPROVED') throw new HttpError(409, 'Only approved payroll runs can be posted')
  if (row.netCents + row.deductionsCents !== row.grossCents) {
    throw new HttpError(409, 'Payroll run totals are not balanced')
  }
  const accounts = await resolveSystemAccounts(row.companyId)
  const journal = await createJournal({
    date: isoDay(row.periodEnd),
    description: `Payroll ${row.number}`,
    classification: 'CONFIDENTIAL',
    referenceType: 'PAYROLL_RUN',
    referenceId: row.id,
    branchId: row.branchId,
    lines: [
      {
        accountId: accounts.EXPENSE,
        debitCents: row.grossCents + row.employerCostCents,
        creditCents: 0,
        memo: 'Payroll gross and employer contributions',
      },
      {
        accountId: accounts.AP_CONTROL,
        debitCents: 0,
        creditCents: row.deductionsCents,
        memo: 'Payroll statutory deductions',
      },
      {
        accountId: accounts.BANK,
        debitCents: 0,
        creditCents: row.netCents,
        memo: 'Payroll net pay',
      },
    ],
  }, actor)
  const postedJournal = await postJournal(journal.id, actor)
  const principal = principalOf(actor)
  const updated = await db.payrollRun.update({
    where: { id: row.id },
    data: {
      status: 'POSTED',
      financeJournalId: postedJournal.id,
      postedById: principal.userId,
      postedAt: new Date(),
      updatedAt: new Date(),
    },
  })
  await auditMutation(actor, 'hr.payroll.posted', 'PayrollRun', row.id, {
    payrollRunId: row.id,
    financeJournalId: postedJournal.id,
    classification: row.classification,
  })
  return toPayrollRunDto(updated, await db.payrollLine.findMany({ where: { runId: row.id } }))
}
