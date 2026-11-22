// Phase 6 finance ledger service.
//
// Money is integer cents everywhere. Statutory rates come only from VERIFIED
// StatutoryRate rows; event/audit payloads carry IDs and classification only.
// All reads and writes go through the tenant-scoped `db` proxy.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { encryptString } from './crypto.js'
import { enqueueJob } from './queues.js'
import { config } from './config.js'
import { buildEtimsPayload } from './etims.js'
import { inspectText, findingTypes, redactText } from '../../shared/src/dlp.js'
import * as sharedEvents from '../../shared/src/events.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

const MAX_LIST = 200
const EPOCH = '1970-01-01'

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || DEFAULT_COMPANY_ID
}

function limitOf(value, fallback = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), MAX_LIST)
}

function asDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'Invalid date')
  return date
}

/** Finance dates are stored as ISO day strings (YYYY-MM-DD) in the DB. */
function isoDay(value) {
  return asDate(value).toISOString().slice(0, 10)
}

/** Decimal amount -> integer cents (no floating-point statutory arithmetic). */
export function toCents(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new HttpError(400, 'Invalid amount')
    return Math.round(value * 100)
  }
  const text = String(value ?? '').trim()
  const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new HttpError(400, 'Invalid amount')
  const sign = match[1] === '-' ? -1 : 1
  const whole = Number(match[2])
  const fraction = Number((match[3] || '').padEnd(2, '0'))
  if (!Number.isSafeInteger(whole)) throw new HttpError(400, 'Invalid amount')
  return sign * (whole * 100 + fraction)
}

/** Integer cents -> decimal amount for display only. */
export function fromCents(cents) {
  const value = Number(cents)
  if (!Number.isFinite(value)) throw new HttpError(400, 'Invalid amount')
  return Math.round(value) / 100
}

function requireCents(value, label) {
  const amount = Number(value)
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new HttpError(400, `${label} must be a non-negative integer number of cents`)
  }
  return amount
}

/**
 * Line calculation. `rateBps` is always supplied by a verified statutory rate
 * (or an injected fixture in unit tests) — never a hardcoded tax percentage.
 */
export function calculateLine({ qty, unitPriceCents, rateBps, taxInclusive } = {}) {
  const quantity = Number(qty)
  const price = Number(unitPriceCents)
  const bps = Number(rateBps)
  if (!Number.isFinite(quantity) || quantity <= 0) throw new HttpError(400, 'Quantity must be greater than zero')
  if (!Number.isSafeInteger(price) || price <= 0) throw new HttpError(400, 'Unit price must be a positive integer number of cents')
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) throw new HttpError(400, 'Invalid statutory rate')

  const base = Math.round(quantity * price)
  if (taxInclusive) {
    const netCents = Math.round(base * 10000 / (10000 + bps))
    return { netCents, taxCents: base - netCents, grossCents: base }
  }
  const netCents = base
  const taxCents = Math.round(base * bps / 10_000)
  return { netCents, taxCents, grossCents: netCents + taxCents }
}

function dlpFailure(value, allowWholeKraPin = false) {
  if (!value) return null
  const findings = inspectText(String(value))
  if (!findings.length) return null
  const types = findingTypes(findings)
  const wholeKraPin = allowWholeKraPin
    && types.length === 1
    && types[0] === 'KRA_PIN'
    && findings.length === 1
    && findings[0].start === 0
    && findings[0].end === String(value).length
  if (wholeKraPin) return null
  return types
}

/** Never include the matched value in an error, log or audit entry. */
function assertDlpSafe(value, allowWholeKraPin = false) {
  const types = dlpFailure(value, allowWholeKraPin)
  if (!types) return
  const error = new HttpError(422, `Contains restricted data (${types.join(', ')})`)
  error.findingTypes = types
  error.types = types
  throw error
}

function principalOf(actor) {
  const ctx = getTenantContext() || {}
  return {
    userId: actor?.userId ?? ctx.actorId ?? null,
    companyId: actor?.companyId || ctx.companyId || DEFAULT_COMPANY_ID,
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

async function financeEvent(type, data, options = {}) {
  // The shared contract may export the event name as a constant; fall back to
  // the literal name while the shared package is being extended.
  const eventType = sharedEvents[type] || type
  return emitEvent(eventType, data, { aggregateType: 'Finance', ...options })
}

function isNumberConflict(error) {
  if (error?.code !== 'P2002') return false
  const target = error?.meta?.target
  if (!target) return true
  return (Array.isArray(target) ? target : [target]).some((part) => String(part).includes('number'))
}

async function nextNumber(model, prefix) {
  const year = new Date().getUTCFullYear()
  const pattern = `${prefix}-${year}-`
  const count = await db[model].count({ where: { number: { startsWith: pattern } } })
  for (let offset = 0; offset < 1000; offset += 1) {
    const candidate = `${pattern}${String(count + 1 + offset).padStart(4, '0')}`
    // eslint-disable-next-line no-await-in-loop
    const existing = await db[model].findFirst({ where: { number: candidate }, select: { id: true } })
    if (!existing) return candidate
  }
  throw new HttpError(409, 'Unable to allocate a document number')
}

async function createWithNumber(model, prefix, buildData, attempts = 5) {
  let lastError
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const number = await nextNumber(model, prefix)
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

async function findRecord(model, id, label) {
  const row = await db[model].findFirst({ where: { id, companyId: tenantId() } })
  if (!row) throw new HttpError(404, `${label} not found`)
  return row
}

async function resolveControlAccount(systemCode, companyId = tenantId()) {
  const account = await db.financeAccount.findFirst({
    where: { companyId, systemCode },
    select: { id: true },
  })
  if (!account) throw new HttpError(409, `Chart of accounts is missing ${systemCode}`)
  return account.id
}

function validateBalancedLines(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new HttpError(400, 'A journal needs at least one line')
  let debitTotal = 0
  let creditTotal = 0
  lines.forEach((line, position) => {
    const debitCents = requireCents(line.debitCents, `Line ${position + 1} debit`)
    const creditCents = requireCents(line.creditCents, `Line ${position + 1} credit`)
    if ((debitCents > 0) === (creditCents > 0)) {
      throw new HttpError(400, 'Each journal line must have exactly one positive side')
    }
    debitTotal += debitCents
    creditTotal += creditCents
  })
  if (debitTotal <= 0 || debitTotal !== creditTotal) {
    throw new HttpError(400, 'Journal debits and credits must be equal and greater than zero')
  }
  return { debitTotal, creditTotal }
}

// ------------------------------------------------------------------- DTOs

function journalLineDto(line) {
  return {
    id: line.id ?? null,
    accountId: line.accountId,
    partyId: line.partyId ?? null,
    debitCents: line.debitCents,
    creditCents: line.creditCents,
    memo: line.memo ?? null,
    position: line.position ?? null,
  }
}

function invoiceLineDto(line) {
  return {
    id: line.id ?? null,
    description: line.description,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    taxRateId: line.taxRateId ?? null,
    netCents: line.netCents,
    taxCents: line.taxCents,
    grossCents: line.grossCents,
    position: line.position ?? null,
  }
}

export function toAccountDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    normalBalance: row.normalBalance,
    systemCode: row.systemCode ?? null,
    parentId: row.parentId ?? null,
    currency: row.currency,
    isActive: row.isActive,
    classification: row.classification,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

/** Party DTOs expose only a presence flag and a fixed encrypted marker. */
export function toPartyDto(row) {
  if (!row) return null
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    legalName: row.legalName ?? null,
    hasTaxPin: Boolean(row.taxPinCiphertext),
    taxPinMasked: '[ENCRYPTED]',
    email: row.email ?? null,
    phone: row.phone ?? null,
    currency: row.currency,
    classification: row.classification,
  }
}

export function toRateDto(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    label: row.label,
    rateBps: row.rateBps,
    effectiveFrom: row.effectiveFrom ?? null,
    effectiveTo: row.effectiveTo ?? null,
    sourceReference: row.sourceReference ?? null,
    verificationNote: row.verificationNote ?? null,
    verifiedBy: row.verifiedBy ?? null,
    verifiedAt: row.verifiedAt ?? null,
    status: row.status,
    createdAt: row.createdAt ?? null,
  }
}

export function toJournalDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    date: row.date ?? null,
    description: row.description,
    status: row.status,
    referenceType: row.referenceType ?? null,
    referenceId: row.referenceId ?? null,
    reversalOfId: row.reversalOfId ?? null,
    postedAt: row.postedAt ?? null,
    postedById: row.postedById ?? null,
    classification: row.classification,
    lines: (lines || row.lines || []).map(journalLineDto),
    createdAt: row.createdAt ?? null,
  }
}

export function toInvoiceDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    direction: row.direction,
    type: row.type,
    status: row.status,
    partyId: row.partyId,
    issueDate: row.issueDate ?? null,
    dueDate: row.dueDate ?? null,
    currency: row.currency,
    taxInclusive: row.taxInclusive,
    taxRateId: row.taxRateId ?? null,
    subtotalCents: row.subtotalCents,
    taxCents: row.taxCents,
    totalCents: row.totalCents,
    paidCents: row.paidCents,
    balanceCents: row.balanceCents,
    notes: row.notes ?? null,
    classification: row.classification,
    sourceInvoiceId: row.sourceInvoiceId ?? null,
    businessDocumentId: row.businessDocumentId ?? null,
    journalId: row.journalId ?? null,
    createdById: row.createdById ?? null,
    issuedAt: row.issuedAt ?? null,
    lines: (lines || row.lines || []).map(invoiceLineDto),
    createdAt: row.createdAt ?? null,
  }
}

export function toPaymentDto(row, allocations) {
  if (!row) return null
  return {
    id: row.id,
    number: row.number,
    direction: row.direction,
    partyId: row.partyId,
    method: row.method,
    amountCents: row.amountCents,
    currency: row.currency,
    paidAt: row.paidAt ?? null,
    reference: row.reference ?? null,
    status: row.status,
    journalId: row.journalId ?? null,
    classification: row.classification,
    createdById: row.createdById ?? null,
    allocations: (allocations || row.allocations || []).map((allocation) => ({
      id: allocation.id ?? null,
      invoiceId: allocation.invoiceId,
      amountCents: allocation.amountCents,
    })),
    createdAt: row.createdAt ?? null,
  }
}

export function toBudgetDto(row, lines) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    period: row.period,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    status: row.status,
    approvedById: row.approvedById ?? null,
    approvedAt: row.approvedAt ?? null,
    classification: row.classification,
    lines: (lines || row.lines || []).map((line) => ({
      id: line.id ?? null,
      accountId: line.accountId,
      amountCents: line.amountCents,
    })),
    createdAt: row.createdAt ?? null,
  }
}

/** Payload is returned only for the single-submission detail endpoint. */
export function toSubmissionDto(row, options = {}) {
  if (!row) return null
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    payloadVersion: row.payloadVersion,
    status: row.status,
    provider: row.provider,
    externalReference: row.externalReference ?? null,
    attempts: row.attempts,
    lastError: row.lastError ? redactText(String(row.lastError)).slice(0, 500) : null,
    queuedAt: row.queuedAt ?? null,
    submittedAt: row.submittedAt ?? null,
    ...(options.includePayload ? { payload: row.payload ?? null } : {}),
  }
}

// ------------------------------------------------------------ child records

async function journalLines(journalId) {
  return db.financeJournalLine.findMany({
    where: { journalId, companyId: tenantId() },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
}

async function invoiceLines(invoiceId) {
  return db.financeInvoiceLine.findMany({
    where: { invoiceId, companyId: tenantId() },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
}

async function paymentAllocations(paymentId) {
  return db.financePaymentAllocation.findMany({
    where: { paymentId, companyId: tenantId() },
    orderBy: [{ id: 'asc' }],
  })
}

async function budgetLines(budgetId) {
  return db.financeBudgetLine.findMany({
    where: { budgetId, companyId: tenantId() },
    orderBy: [{ id: 'asc' }],
  })
}

// -------------------------------------------------------------- chart/party

export async function listAccounts({ type, active, limit } = {}) {
  const rows = await db.financeAccount.findMany({
    where: {
      companyId: tenantId(),
      ...(type ? { type } : {}),
      ...(active === true || active === 'true' ? { isActive: true } : {}),
      ...(active === false || active === 'false' ? { isActive: false } : {}),
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(limit),
  })
  return rows.map(toAccountDto)
}

export async function createAccount(input, actor = null) {
  const companyId = tenantId()
  const code = String(input.code).trim()
  const existing = await db.financeAccount.findFirst({ where: { companyId, code }, select: { id: true } })
  if (existing) throw new HttpError(409, 'Account code already exists')
  if (input.parentId) {
    const parent = await db.financeAccount.findFirst({
      where: { id: input.parentId, companyId },
      select: { id: true },
    })
    if (!parent) throw new HttpError(400, 'Parent account must belong to this company')
  }
  const row = await db.financeAccount.create({
    data: {
      companyId,
      branchId: input.branchId || null,
      code,
      name: input.name,
      type: input.type,
      normalBalance: input.normalBalance,
      systemCode: input.systemCode || null,
      parentId: input.parentId || null,
      currency: input.currency || 'KES',
      isActive: input.isActive ?? true,
      classification: input.classification || 'INTERNAL',
    },
  })
  await auditMutation(actor, 'finance.account.created', 'FinanceAccount', row.id, {
    accountId: row.id,
    classification: row.classification,
  })
  await financeEvent('FinanceAccountCreated', {
    accountId: row.id,
    entityType: 'FINANCE_ACCOUNT',
    entityId: row.id,
    code: row.code,
    type: row.type,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toAccountDto(row)
}

export async function getAccount(id) {
  return toAccountDto(await findRecord('financeAccount', id, 'Account'))
}

export async function listParties({ type, limit } = {}) {
  const rows = await db.financeParty.findMany({
    where: { companyId: tenantId(), ...(type ? { type } : {}) },
    orderBy: [{ name: 'asc' }],
    take: limitOf(limit),
  })
  return rows.map(toPartyDto)
}

export async function createParty(input, actor = null) {
  const companyId = tenantId()
  assertDlpSafe(input.name)
  assertDlpSafe(input.legalName)
  assertDlpSafe(input.taxPin, true)
  const row = await db.financeParty.create({
    data: {
      companyId,
      type: input.type,
      name: input.name,
      legalName: input.legalName || null,
      taxPinCiphertext: input.taxPin ? encryptString(input.taxPin) : null,
      email: input.email || null,
      phone: input.phone || null,
      currency: input.currency || 'KES',
      classification: input.classification || 'INTERNAL',
    },
  })
  await auditMutation(actor, 'finance.party.created', 'FinanceParty', row.id, {
    partyId: row.id,
    classification: row.classification,
  })
  return toPartyDto(row)
}

export async function getParty(id) {
  return toPartyDto(await findRecord('financeParty', id, 'Party'))
}

// --------------------------------------------------------------- VAT rates

export async function resolveVerifiedRate(companyId, onDate, rateId) {
  const date = isoDay(onDate)
  const rate = await db.statutoryRate.findFirst({
    where: {
      companyId,
      kind: 'VAT',
      status: 'VERIFIED',
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      ...(rateId ? { id: rateId } : {}),
    },
    orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }],
  })
  if (!rate) {
    throw new HttpError(409, 'No verified VAT rate is effective for this date; verify a statutory rate first')
  }
  return rate
}

export async function listStatutoryRates({ kind, activeOn, limit } = {}) {
  const date = activeOn ? isoDay(activeOn) : null
  const rows = await db.statutoryRate.findMany({
    where: {
      companyId: tenantId(),
      ...(kind ? { kind } : {}),
      ...(date ? {
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      } : {}),
    },
    orderBy: [{ effectiveFrom: 'desc' }, { code: 'asc' }],
    take: limitOf(limit),
  })
  return rows.map(toRateDto)
}

export async function createStatutoryRate(input, actor = null) {
  const row = await db.statutoryRate.create({
    data: {
      companyId: tenantId(),
      code: input.code,
      kind: input.kind || 'VAT',
      label: input.label,
      rateBps: input.rateBps,
      effectiveFrom: isoDay(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? isoDay(input.effectiveTo) : null,
      sourceReference: input.sourceReference,
      verificationNote: null,
      verifiedBy: null,
      verifiedAt: null,
      status: 'UNVERIFIED',
    },
  })
  await auditMutation(actor, 'finance.statutory.created', 'StatutoryRate', row.id, {
    rateId: row.id,
  })
  return toRateDto(row)
}

export async function verifyStatutoryRate(id, input, actor = null) {
  const existing = await findRecord('statutoryRate', id, 'Statutory rate')
  if (existing.status === 'VERIFIED') throw new HttpError(409, 'Statutory rate is already verified')
  const verifiedBy = String(input.verifiedBy || '').trim()
  const verificationNote = String(input.verificationNote || '').trim()
  if (!verifiedBy || !verificationNote) throw new HttpError(400, 'Verifier and verification note are required')
  const row = await db.statutoryRate.update({
    where: { id: existing.id },
    data: {
      status: 'VERIFIED',
      verifiedBy,
      verificationNote,
      verifiedAt: new Date(),
    },
  })
  await auditMutation(actor, 'finance.statutory.verified', 'StatutoryRate', row.id, {
    rateId: row.id,
  })
  await financeEvent('StatutoryRateVerified', {
    rateId: row.id,
    entityType: 'STATUTORY_RATE',
    entityId: row.id,
    code: row.code,
    kind: row.kind,
    effectiveFrom: row.effectiveFrom,
    classification: 'INTERNAL',
  }, { aggregateId: row.id })
  return toRateDto(row)
}

// ----------------------------------------------------------------- journals

export async function listJournals({ status, limit } = {}) {
  const rows = await db.financeJournal.findMany({
    where: { companyId: tenantId(), ...(status ? { status } : {}) },
    orderBy: [{ date: 'desc' }, { number: 'desc' }],
    take: limitOf(limit),
  })
  return rows.map((row) => toJournalDto(row))
}

export async function getJournal(id) {
  const row = await findRecord('financeJournal', id, 'Journal')
  return toJournalDto(row, await journalLines(row.id))
}

export async function createJournal(input, actor = null) {
  validateBalancedLines(input.lines)
  const principal = principalOf(actor)
  const normalizedLines = input.lines.map((line, position) => ({
    accountId: line.accountId,
    partyId: line.partyId || null,
    debitCents: requireCents(line.debitCents, 'debitCents'),
    creditCents: requireCents(line.creditCents, 'creditCents'),
    memo: line.memo || null,
    position,
  }))
  const row = await createWithNumber('financeJournal', 'JRN', (number) => ({
    companyId: principal.companyId,
    branchId: input.branchId || null,
    number,
    date: isoDay(input.date),
    description: input.description,
    status: 'DRAFT',
    referenceType: input.referenceType || null,
    referenceId: input.referenceId || null,
    reversalOfId: null,
    postedAt: null,
    postedById: null,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    lines: {
      create: normalizedLines.map((line) => ({
        companyId: principal.companyId,
        accountId: line.accountId,
        partyId: line.partyId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
        position: line.position,
      })),
    },
  }))
  await auditMutation(actor, 'finance.journal.created', 'FinanceJournal', row.id, {
    journalId: row.id,
    classification: row.classification,
  })
  return toJournalDto(row, normalizedLines)
}

export async function postJournal(id, actor = null) {
  const existing = await findRecord('financeJournal', id, 'Journal')
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft journals can be posted')
  const lines = await journalLines(existing.id)
  validateBalancedLines(lines)
  const principal = principalOf(actor)
  const row = await db.financeJournal.update({
    where: { id: existing.id },
    data: { status: 'POSTED', postedAt: new Date(), postedById: principal.userId },
  })
  await auditMutation(actor, 'finance.journal.posted', 'FinanceJournal', row.id, {
    journalId: row.id,
    classification: row.classification,
  })
  await financeEvent('JournalPosted', {
    journalId: row.id,
    entityType: 'FINANCE_JOURNAL',
    entityId: row.id,
    number: row.number,
    status: 'POSTED',
    lineCount: lines.length,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toJournalDto(row, lines)
}

export async function reverseJournal(id, actor = null) {
  const existing = await findRecord('financeJournal', id, 'Journal')
  if (existing.status !== 'POSTED') throw new HttpError(409, 'Only a posted journal can be reversed')
  const originalLines = await journalLines(existing.id)
  validateBalancedLines(originalLines)
  const mirrored = originalLines.map((line, position) => ({
    accountId: line.accountId,
    partyId: line.partyId,
    debitCents: line.creditCents,
    creditCents: line.debitCents,
    memo: line.memo,
    position,
  }))
  const principal = principalOf(actor)
  const reversal = await createWithNumber('financeJournal', 'JRN', (number) => ({
    companyId: principal.companyId,
    branchId: existing.branchId,
    number,
    date: isoDay(new Date()),
    description: `Reversal of ${existing.number}`,
    status: 'POSTED',
    referenceType: 'REVERSAL',
    referenceId: existing.id,
    reversalOfId: existing.id,
    postedAt: new Date(),
    postedById: principal.userId,
    classification: existing.classification,
    createdById: principal.userId,
    lines: {
      create: mirrored.map((line) => ({
        companyId: principal.companyId,
        accountId: line.accountId,
        partyId: line.partyId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
        position: line.position,
      })),
    },
  }))
  await db.financeJournal.update({
    where: { id: existing.id },
    data: { status: 'REVERSED' },
  })
  await auditMutation(actor, 'finance.journal.reversed', 'FinanceJournal', reversal.id, {
    journalId: reversal.id,
    originalJournalId: existing.id,
    classification: reversal.classification,
  })
  await financeEvent('JournalPosted', {
    journalId: reversal.id,
    entityType: 'FINANCE_JOURNAL',
    entityId: reversal.id,
    number: reversal.number,
    status: 'POSTED',
    lineCount: mirrored.length,
    classification: reversal.classification,
  }, { aggregateId: reversal.id })
  return toJournalDto(reversal, mirrored)
}

// ---------------------------------------------------------- invoice journals

async function invoiceJournalLines(invoice) {
  const subtotalCents = invoice.subtotalCents
  const taxCents = invoice.taxCents
  const totalCents = invoice.totalCents
  const isSales = invoice.direction === 'SALES'
  const isCreditNote = invoice.type === 'CREDIT_NOTE'
  const linesOut = []
  const add = async (systemCode, debitCents, creditCents, partyId = null) => {
    linesOut.push({
      accountId: await resolveControlAccount(systemCode),
      debitCents,
      creditCents,
      partyId,
      memo: null,
    })
  }

  if (isSales && !isCreditNote) {
    await add('AR_CONTROL', totalCents, 0, invoice.partyId)
    await add('SALES', 0, subtotalCents)
    if (taxCents > 0) await add('VAT_OUTPUT', 0, taxCents)
  } else if (isSales) {
    await add('SALES', subtotalCents, 0)
    if (taxCents > 0) await add('VAT_OUTPUT', taxCents, 0)
    await add('AR_CONTROL', 0, totalCents, invoice.partyId)
  } else if (!isCreditNote) {
    await add('PURCHASES', subtotalCents, 0)
    if (taxCents > 0) await add('VAT_INPUT', taxCents, 0)
    await add('AP_CONTROL', 0, totalCents, invoice.partyId)
  } else {
    await add('AP_CONTROL', totalCents, 0, invoice.partyId)
    await add('PURCHASES', 0, subtotalCents)
    if (taxCents > 0) await add('VAT_INPUT', 0, taxCents)
  }
  return linesOut
}

// ----------------------------------------------------------------- invoices

export async function listInvoices({ direction, status, partyId, limit } = {}) {
  const rows = await db.financeInvoice.findMany({
    where: {
      companyId: tenantId(),
      ...(direction ? { direction } : {}),
      ...(status ? { status } : {}),
      ...(partyId ? { partyId } : {}),
    },
    orderBy: [{ issueDate: 'desc' }, { number: 'desc' }],
    take: limitOf(limit),
  })
  return rows.map((row) => toInvoiceDto(row))
}

export async function getInvoice(id) {
  const row = await findRecord('financeInvoice', id, 'Invoice')
  return toInvoiceDto(row, await invoiceLines(row.id))
}

async function queueEtimsSubmission(submission, invoice, actor) {
  const principal = principalOf(actor)
  try {
    await enqueueJob('finance.etims.submit', {
      submissionId: submission.id,
      companyId: principal.companyId,
      invoiceId: invoice.id,
      correlationId: principal.correlationId,
    })
  } catch (error) {
    // A minimal deployment may not register this queue name yet. The row stays
    // QUEUED so a worker can still pick it up by polling the submissions table.
    console.error(`Could not enqueue eTIMS submission ${submission.id}: ${error?.message || 'unknown error'}`)
  }
}

export async function createInvoice(input, actor = null) {
  const companyId = tenantId()
  const expectedPartyType = input.direction === 'SALES' ? 'CUSTOMER' : 'SUPPLIER'
  const party = await db.financeParty.findFirst({
    where: { id: input.partyId, companyId, type: expectedPartyType },
    select: { id: true },
  })
  if (!party) throw new HttpError(404, `${expectedPartyType} party not found`)

  let rate = null
  if (input.taxRateId) {
    rate = await db.statutoryRate.findFirst({
      where: { id: input.taxRateId, companyId },
    })
    if (!rate) throw new HttpError(404, 'Statutory rate not found')
  }

  const bps = rate?.rateBps ?? 0
  const lines = input.lines.map((line, position) => ({
    companyId,
    description: line.description,
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    taxRateId: rate?.id ?? null,
    ...calculateLine({ qty: line.qty, unitPriceCents: line.unitPriceCents, rateBps: bps, taxInclusive: input.taxInclusive }),
    position,
  }))
  const subtotalCents = lines.reduce((sum, line) => sum + line.netCents, 0)
  const taxCents = lines.reduce((sum, line) => sum + line.taxCents, 0)
  const totalCents = lines.reduce((sum, line) => sum + line.grossCents, 0)
  const principal = principalOf(actor)
  const prefix = input.direction === 'SALES' ? 'INV' : 'BILL'
  const row = await createWithNumber('financeInvoice', prefix, (number) => ({
    companyId,
    branchId: input.branchId || null,
    number,
    direction: input.direction,
    type: input.type || 'INVOICE',
    status: 'DRAFT',
    partyId: input.partyId,
    issueDate: isoDay(input.issueDate),
    dueDate: input.dueDate ? isoDay(input.dueDate) : null,
    currency: input.currency || 'KES',
    taxInclusive: input.taxInclusive ?? false,
    taxRateId: rate?.id ?? null,
    subtotalCents,
    taxCents,
    totalCents,
    paidCents: 0,
    balanceCents: totalCents,
    notes: input.notes || null,
    classification: input.classification || 'INTERNAL',
    sourceInvoiceId: input.sourceInvoiceId || null,
    businessDocumentId: input.businessDocumentId || null,
    journalId: null,
    createdById: principal.userId,
    issuedAt: null,
    lines: { create: lines },
  }))
  await auditMutation(actor, 'finance.invoice.created', 'FinanceInvoice', row.id, {
    invoiceId: row.id,
    classification: row.classification,
  })
  return toInvoiceDto(row, lines)
}

export async function issueInvoice(id, input = {}, actor = null) {
  const invoice = await findRecord('financeInvoice', id, 'Invoice')
  if (invoice.status !== 'DRAFT') throw new HttpError(409, 'Only draft invoices can be issued')
  const rate = await resolveVerifiedRate(invoice.companyId, invoice.issueDate, input.taxRateId || invoice.taxRateId || undefined)
  const existingLines = await invoiceLines(invoice.id)
  if (!existingLines.length) throw new HttpError(409, 'Invoice has no lines')

  const recomputed = []
  for (const line of existingLines) {
    const calculation = calculateLine({
      qty: line.qty,
      unitPriceCents: line.unitPriceCents,
      rateBps: rate.rateBps,
      taxInclusive: invoice.taxInclusive,
    })
    // eslint-disable-next-line no-await-in-loop
    await db.financeInvoiceLine.update({
      where: { id: line.id },
      data: { ...calculation, taxRateId: rate.id },
    })
    recomputed.push({ ...line, ...calculation, taxRateId: rate.id })
  }

  const subtotalCents = recomputed.reduce((sum, line) => sum + line.netCents, 0)
  const taxCents = recomputed.reduce((sum, line) => sum + line.taxCents, 0)
  const totalCents = recomputed.reduce((sum, line) => sum + line.grossCents, 0)
  const totals = { subtotalCents, taxCents, totalCents, balanceCents: totalCents }
  const postingTotals = { ...invoice, ...totals }

  const journalLinesList = await invoiceJournalLines(postingTotals)
  const principal = principalOf(actor)
  const journal = await createWithNumber('financeJournal', 'JRN', (number) => ({
    companyId: invoice.companyId,
    branchId: invoice.branchId,
    number,
    date: isoDay(invoice.issueDate),
    description: `${invoice.direction} invoice ${invoice.number}`,
    status: 'POSTED',
    referenceType: 'INVOICE',
    referenceId: invoice.id,
    reversalOfId: null,
    postedAt: new Date(),
    postedById: principal.userId,
    classification: invoice.classification,
    createdById: principal.userId,
    lines: {
      create: journalLinesList.map((line, position) => ({
        companyId: invoice.companyId,
        accountId: line.accountId,
        partyId: line.partyId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
        position,
      })),
    },
  }))

  const updated = await db.financeInvoice.update({
    where: { id: invoice.id },
    data: {
      status: 'ISSUED',
      taxRateId: rate.id,
      issuedAt: new Date(),
      journalId: journal.id,
      ...totals,
    },
  })
  await auditMutation(actor, 'finance.invoice.issued', 'FinanceInvoice', updated.id, {
    invoiceId: updated.id,
    journalId: journal.id,
    classification: updated.classification,
  })
  await financeEvent('InvoiceIssued', {
    invoiceId: updated.id,
    entityType: 'FINANCE_INVOICE',
    entityId: updated.id,
    number: updated.number,
    direction: updated.direction,
    type: updated.type,
    status: updated.status,
    classification: updated.classification,
  }, { aggregateId: updated.id })

  if (invoice.direction === 'SALES') {
    const payload = await buildEtimsPayload({ ...updated, lines: recomputed }, {
      lines: recomputed,
      taxRate: rate,
    })
    const financeCfg = config.finance || {}
    const submission = await db.etimsSubmission.create({
      data: {
        companyId: invoice.companyId,
        branchId: invoice.branchId,
        invoiceId: updated.id,
        payloadVersion: financeCfg.etimsPayloadVersion || '1.0',
        provider: financeCfg.etimsProvider || 'KRA_ETIMS',
        status: 'QUEUED',
        externalReference: null,
        attempts: 0,
        lastError: null,
        payload,
        queuedAt: new Date(),
        submittedAt: null,
      },
    })
    await queueEtimsSubmission(submission, updated, actor)
    await auditMutation(actor, 'finance.etims.queued', 'EtimsSubmission', submission.id, {
      submissionId: submission.id,
      invoiceId: updated.id,
    })
    await financeEvent('EtimsSubmissionQueued', {
      submissionId: submission.id,
      invoiceId: updated.id,
      entityType: 'ETIMS_SUBMISSION',
      entityId: submission.id,
      status: 'QUEUED',
      classification: updated.classification,
    }, { aggregateId: submission.id })
  }

  return toInvoiceDto(updated, recomputed)
}

// ----------------------------------------------------------------- payments

export async function listPayments({ direction, limit } = {}) {
  const rows = await db.financePayment.findMany({
    where: { companyId: tenantId(), ...(direction ? { direction } : {}) },
    orderBy: [{ paidAt: 'desc' }, { number: 'desc' }],
    take: limitOf(limit),
  })
  return rows.map((row) => toPaymentDto(row))
}

export async function getPayment(id) {
  const row = await findRecord('financePayment', id, 'Payment')
  return toPaymentDto(row, await paymentAllocations(row.id))
}

export async function createPayment(input, actor = null) {
  const companyId = tenantId()
  const principal = principalOf(actor)
  assertDlpSafe(input.reference)

  const expectedPartyType = input.direction === 'INCOMING' ? 'CUSTOMER' : 'SUPPLIER'
  const party = await db.financeParty.findFirst({
    where: { id: input.partyId, companyId, type: expectedPartyType },
    select: { id: true },
  })
  if (!party) throw new HttpError(404, `${expectedPartyType} party not found`)

  // A payment may only allocate once per invoice (unique paymentId/invoiceId).
  const allocationTotals = new Map()
  for (const item of input.allocations || []) {
    allocationTotals.set(item.invoiceId, (allocationTotals.get(item.invoiceId) || 0) + item.amountCents)
  }
  const allocations = [...allocationTotals].map(([invoiceId, amountCents]) => ({ invoiceId, amountCents }))
  const totalAllocated = allocations.reduce((sum, item) => sum + item.amountCents, 0)
  if (totalAllocated > input.amountCents) {
    throw new HttpError(400, 'Allocations cannot exceed the payment amount')
  }

  const balances = new Map()
  for (const allocation of allocations) {
    // eslint-disable-next-line no-await-in-loop
    const invoice = await db.financeInvoice.findFirst({
      where: {
        id: allocation.invoiceId,
        companyId,
        direction: input.direction === 'INCOMING' ? 'SALES' : 'PURCHASE',
      },
    })
    if (!invoice) throw new HttpError(404, 'Allocation invoice not found')
    if (invoice.currency !== input.currency) throw new HttpError(400, 'Allocation currency does not match the payment')
    if (!['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice.status)) {
      throw new HttpError(409, 'Invoice is not open for payment')
    }
    const available = (balances.get(invoice.id) ?? invoice.balanceCents) - allocation.amountCents
    if (available < 0) throw new HttpError(400, 'Allocation exceeds the invoice balance')
    balances.set(invoice.id, available)
  }

  const systemCodes = input.direction === 'INCOMING' ? ['BANK', 'AR_CONTROL'] : ['AP_CONTROL', 'BANK']
  const accountIds = {}
  for (const code of systemCodes) {
    // eslint-disable-next-line no-await-in-loop
    accountIds[code] = await resolveControlAccount(code, companyId)
  }
  const [debitCode, creditCode] = systemCodes
  const journalLinesList = [{
    accountId: accountIds[debitCode],
    partyId: input.direction === 'OUTGOING' ? input.partyId : null,
    debitCents: input.amountCents,
    creditCents: 0,
    memo: null,
  }, {
    accountId: accountIds[creditCode],
    partyId: input.direction === 'INCOMING' ? input.partyId : null,
    debitCents: 0,
    creditCents: input.amountCents,
    memo: null,
  }]

  const journal = await createWithNumber('financeJournal', 'JRN', (number) => ({
    companyId,
    branchId: input.branchId || null,
    number,
    date: isoDay(input.paidAt || new Date()),
    description: `${input.direction} payment`,
    status: 'POSTED',
    referenceType: 'PAYMENT',
    referenceId: null,
    reversalOfId: null,
    postedAt: new Date(),
    postedById: principal.userId,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    lines: {
      create: journalLinesList.map((line, position) => ({
        companyId,
        accountId: line.accountId,
        partyId: line.partyId,
        debitCents: line.debitCents,
        creditCents: line.creditCents,
        memo: line.memo,
        position,
      })),
    },
  }))

  const prefix = input.direction === 'INCOMING' ? 'PAY' : 'DIS'
  const createdAllocations = allocations.map((allocation) => ({
    companyId,
    invoiceId: allocation.invoiceId,
    amountCents: allocation.amountCents,
  }))
  const payment = await createWithNumber('financePayment', prefix, (number) => ({
    companyId,
    branchId: input.branchId || null,
    number,
    direction: input.direction,
    partyId: input.partyId,
    method: input.method,
    amountCents: input.amountCents,
    currency: input.currency || 'KES',
    paidAt: input.paidAt ? asDate(input.paidAt) : new Date(),
    reference: input.reference || null,
    status: 'COMPLETED',
    journalId: journal.id,
    classification: input.classification || 'INTERNAL',
    createdById: principal.userId,
    allocations: { create: createdAllocations },
  }))

  for (const allocation of allocations) {
    const invoice = await db.financeInvoice.findFirst({
      where: { id: allocation.invoiceId, companyId },
      select: { paidCents: true, balanceCents: true },
    })
    const remaining = Math.max(0, invoice.balanceCents - allocation.amountCents)
    // eslint-disable-next-line no-await-in-loop
    await db.financeInvoice.update({
      where: { id: allocation.invoiceId },
      data: {
        paidCents: invoice.paidCents + allocation.amountCents,
        balanceCents: remaining,
        status: remaining === 0 ? 'PAID' : 'PARTIALLY_PAID',
      },
    })
  }

  await auditMutation(actor, 'finance.payment.recorded', 'FinancePayment', payment.id, {
    paymentId: payment.id,
    journalId: journal.id,
    classification: payment.classification,
  })
  await financeEvent('PaymentRecorded', {
    paymentId: payment.id,
    entityType: 'FINANCE_PAYMENT',
    entityId: payment.id,
    number: payment.number,
    direction: payment.direction,
    method: payment.method,
    classification: payment.classification,
  }, { aggregateId: payment.id })
  return toPaymentDto(payment, createdAllocations)
}

// ------------------------------------------------------------------- budgets

export async function listBudgets({ limit } = {}) {
  const rows = await db.financeBudget.findMany({
    where: { companyId: tenantId() },
    orderBy: [{ startDate: 'desc' }, { code: 'asc' }],
    take: limitOf(limit),
  })
  return rows.map((row) => toBudgetDto(row))
}

export async function getBudget(id) {
  const row = await findRecord('financeBudget', id, 'Budget')
  return toBudgetDto(row, await budgetLines(row.id))
}

export async function createBudget(input, actor = null) {
  const companyId = tenantId()
  for (const line of input.lines) {
    // eslint-disable-next-line no-await-in-loop
    const account = await db.financeAccount.findFirst({
      where: { id: line.accountId, companyId },
      select: { id: true },
    })
    if (!account) throw new HttpError(400, 'Budget account must belong to this company')
  }
  // Budget lines are unique per account; merge repeats from the request.
  const lineTotals = new Map()
  for (const line of input.lines) {
    lineTotals.set(line.accountId, (lineTotals.get(line.accountId) || 0) + requireCents(line.amountCents, 'Budget amount'))
  }
  const lineData = [...lineTotals].map(([accountId, amountCents]) => ({
    companyId,
    accountId,
    amountCents,
  }))
  const row = await db.financeBudget.create({
    data: {
      companyId,
      branchId: input.branchId || null,
      code: input.code,
      name: input.name,
      period: input.period,
      startDate: isoDay(input.startDate),
      endDate: isoDay(input.endDate),
      status: 'DRAFT',
      approvedById: null,
      approvedAt: null,
      classification: input.classification || 'INTERNAL',
      lines: { create: lineData },
    },
  })
  await auditMutation(actor, 'finance.budget.created', 'FinanceBudget', row.id, {
    budgetId: row.id,
    classification: row.classification,
  })
  return toBudgetDto(row, lineData)
}

export async function approveBudget(id, actor = null) {
  const existing = await findRecord('financeBudget', id, 'Budget')
  if (existing.status !== 'DRAFT') throw new HttpError(409, 'Only draft budgets can be approved')
  const principal = principalOf(actor)
  const row = await db.financeBudget.update({
    where: { id: existing.id },
    data: { status: 'APPROVED', approvedById: principal.userId, approvedAt: new Date() },
  })
  await auditMutation(actor, 'finance.budget.approved', 'FinanceBudget', row.id, {
    budgetId: row.id,
    classification: row.classification,
  })
  await financeEvent('BudgetApproved', {
    budgetId: row.id,
    entityType: 'FINANCE_BUDGET',
    entityId: row.id,
    code: row.code,
    classification: row.classification,
  }, { aggregateId: row.id })
  return toBudgetDto(row, await budgetLines(row.id))
}

export async function getBudgetUsage(id) {
  const budget = await findRecord('financeBudget', id, 'Budget')
  const lines = await budgetLines(budget.id)
  const accounts = await db.financeAccount.findMany({
    where: { companyId: budget.companyId, id: { in: lines.map((line) => line.accountId) } },
    select: { id: true, normalBalance: true },
  })
  const normalBalances = new Map(accounts.map((account) => [account.id, account.normalBalance]))
  const journals = await db.financeJournal.findMany({
    where: {
      companyId: budget.companyId,
      status: 'POSTED',
      date: { gte: isoDay(budget.startDate), lte: isoDay(budget.endDate) },
    },
    select: { id: true },
  })
  const journalIds = journals.map((journal) => journal.id)
  const activity = journalIds.length
    ? await db.financeJournalLine.findMany({
      where: {
        companyId: budget.companyId,
        journalId: { in: journalIds },
        accountId: { in: lines.map((line) => line.accountId) },
      },
      select: { accountId: true, debitCents: true, creditCents: true },
    })
    : []
  const actualByAccount = new Map()
  for (const line of activity) {
    const normal = normalBalances.get(line.accountId) || 'DEBIT'
    const delta = normal === 'CREDIT'
      ? line.creditCents - line.debitCents
      : line.debitCents - line.creditCents
    actualByAccount.set(line.accountId, (actualByAccount.get(line.accountId) || 0) + delta)
  }
  const usageLines = lines.map((line) => {
    const budgetCents = line.amountCents
    const actualCents = actualByAccount.get(line.accountId) || 0
    return {
      accountId: line.accountId,
      budgetCents,
      actualCents,
      varianceCents: budgetCents - actualCents,
    }
  })
  return {
    lines: usageLines,
    totals: {
      budgetCents: usageLines.reduce((sum, line) => sum + line.budgetCents, 0),
      actualCents: usageLines.reduce((sum, line) => sum + line.actualCents, 0),
      varianceCents: usageLines.reduce((sum, line) => sum + line.varianceCents, 0),
    },
  }
}

// ---------------------------------------------------------------- statements

async function postedJournalIds(from, to) {
  const journals = await db.financeJournal.findMany({
    where: { companyId: tenantId(), status: 'POSTED', date: { gte: from, lte: to } },
    select: { id: true },
  })
  return journals.map((journal) => journal.id)
}

async function accountSummary(types, from, to) {
  const accounts = await db.financeAccount.findMany({
    where: { companyId: tenantId(), ...(types ? { type: { in: types } } : {}) },
    orderBy: [{ code: 'asc' }],
  })
  const ids = await postedJournalIds(from, to)
  const activity = ids.length
    ? await db.financeJournalLine.findMany({
      where: { companyId: tenantId(), journalId: { in: ids }, accountId: { in: accounts.map((account) => account.id) } },
      select: { accountId: true, debitCents: true, creditCents: true },
    })
    : []
  const sums = new Map()
  for (const line of activity) {
    const current = sums.get(line.accountId) || { debitCents: 0, creditCents: 0 }
    current.debitCents += line.debitCents
    current.creditCents += line.creditCents
    sums.set(line.accountId, current)
  }
  const rows = accounts.map((account) => {
    const sum = sums.get(account.id) || { debitCents: 0, creditCents: 0 }
    const netCents = account.normalBalance === 'CREDIT'
      ? sum.creditCents - sum.debitCents
      : sum.debitCents - sum.creditCents
    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      debitCents: sum.debitCents,
      creditCents: sum.creditCents,
      netCents,
    }
  })
  return {
    title: '',
    columns: ['account', 'code', 'type', 'debit', 'credit', 'net'],
    rows,
    totals: {
      debitCents: rows.reduce((sum, row) => sum + row.debitCents, 0),
      creditCents: rows.reduce((sum, row) => sum + row.creditCents, 0),
      netCents: rows.reduce((sum, row) => sum + row.netCents, 0),
    },
  }
}

function ageingBucket(daysOverdue) {
  if (daysOverdue <= 0) return 'CURRENT'
  if (daysOverdue <= 30) return '1-30'
  if (daysOverdue <= 60) return '31-60'
  if (daysOverdue <= 90) return '61-90'
  return '90+'
}

export async function getStatement(kind, filters = {}) {
  const tenant = tenantId()
  if (kind === 'trial-balance') {
    const asOf = isoDay(filters.asOf || new Date())
    const report = await accountSummary(null, EPOCH, asOf)
    return { report: { ...report, title: 'Trial balance', columns: report.columns } }
  }
  if (kind === 'income') {
    const from = filters.from ? isoDay(filters.from) : EPOCH
    const to = isoDay(filters.to || new Date())
    const report = await accountSummary(['INCOME', 'EXPENSE'], from, to)
    return { report: { ...report, title: 'Income statement' } }
  }
  if (kind === 'balance-sheet') {
    const asOf = isoDay(filters.asOf || new Date())
    const report = await accountSummary(['ASSET', 'LIABILITY', 'EQUITY'], EPOCH, asOf)
    return { report: { ...report, title: 'Balance sheet' } }
  }
  if (kind === 'ageing') {
    const asOf = filters.asOf ? asDate(filters.asOf) : new Date()
    const asOfDay = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())
    const invoices = await db.financeInvoice.findMany({
      where: {
        companyId: tenant,
        balanceCents: { gt: 0 },
        status: { not: 'CANCELLED' },
        ...(filters.direction ? { direction: filters.direction } : {}),
      },
      select: { id: true, number: true, direction: true, partyId: true, dueDate: true, balanceCents: true },
    })
    const buckets = ['CURRENT', '1-30', '31-60', '61-90', '90+']
    const byBucket = new Map(buckets.map((bucket) => [bucket, { bucket, invoiceCount: 0, balanceCents: 0 }]))
    for (const invoice of invoices) {
      const due = invoice.dueDate ? asDate(invoice.dueDate) : asOf
      const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
      const daysOverdue = Math.floor((asOfDay - dueDay) / 86_400_000)
      const row = byBucket.get(ageingBucket(daysOverdue))
      row.invoiceCount += 1
      row.balanceCents += invoice.balanceCents
    }
    return {
      report: {
        title: 'Receivables ageing',
        columns: ['bucket', 'invoices', 'balance'],
        rows: buckets.map((bucket) => byBucket.get(bucket)),
        totals: {
          invoiceCount: invoices.length,
          balanceCents: invoices.reduce((sum, invoice) => sum + invoice.balanceCents, 0),
        },
      },
    }
  }
  throw new HttpError(400, 'Unknown statement kind')
}

// --------------------------------------------------------------------- eTIMS

export async function listEtimsSubmissions({ invoiceId, limit } = {}) {
  const rows = await db.etimsSubmission.findMany({
    where: { companyId: tenantId(), ...(invoiceId ? { invoiceId } : {}) },
    orderBy: [{ queuedAt: 'desc' }, { id: 'desc' }],
    take: limitOf(limit),
  })
  return rows.map((row) => toSubmissionDto(row))
}

export async function getEtimsSubmission(id) {
  return toSubmissionDto(await findRecord('etimsSubmission', id, 'eTIMS submission'), { includePayload: true })
}

export async function getEtimsPayload(invoiceId) {
  const invoice = await findRecord('financeInvoice', invoiceId, 'Invoice')
  return buildEtimsPayload(invoice, { lines: await invoiceLines(invoice.id) })
}

export async function retryEtimsSubmission(id, actor = null) {
  const existing = await findRecord('etimsSubmission', id, 'eTIMS submission')
  if (existing.status === 'SUBMITTED') throw new HttpError(409, 'Submission has already been submitted')
  const row = await db.etimsSubmission.update({
    where: { id: existing.id },
    data: {
      status: 'QUEUED',
      attempts: (existing.attempts || 0) + 1,
      lastError: null,
      queuedAt: new Date(),
    },
  })
  await queueEtimsSubmission(row, { id: row.invoiceId }, actor)
  await auditMutation(actor, 'finance.etims.retried', 'EtimsSubmission', row.id, {
    submissionId: row.id,
    invoiceId: row.invoiceId,
  })
  await financeEvent('EtimsSubmissionQueued', {
    submissionId: row.id,
    invoiceId: row.invoiceId,
    entityType: 'ETIMS_SUBMISSION',
    entityId: row.id,
    status: 'QUEUED',
    classification: 'INTERNAL',
  }, { aggregateId: row.id })
  return toSubmissionDto(row)
}
