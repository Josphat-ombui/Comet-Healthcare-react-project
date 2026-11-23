// Phase 14 reporting service.
//
// Report definitions store a strict, allow-listed JSON query specification:
// { "reportKey": "finance.income-statement" }. No SQL, table name, column name,
// predicate or free-form filter is ever accepted from a client. Run parameters
// are restricted to a small typed vocabulary declared per report key. Source
// data is read through the tenant-scoped Prisma proxy (`db`) or existing domain
// helpers; when a source has no rows or cannot supply values, the run completes
// with an explicit dataAvailable: false summary and no counts or totals. Money
// is always integer cents. Events, sockets and audit metadata carry IDs only.

import { randomBytes } from 'node:crypto'
import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { recordAudit, recordRequestAudit } from './audit.js'
import { HttpError } from './util.js'
import { enqueueJob, getJobStatus } from './queues.js'
import { getStatement } from './finance.js'
import {
  REPORT_KEYS,
  reportingQuerySpecSchema,
  reportingParametersSchema,
} from './validation.js'

const MAX_LIST = 200
const UNAVAILABLE_REASONS = new Set([
  'NO_SOURCE_ROWS',
  'NO_RUN_YET',
  'SOURCE_UNAVAILABLE',
  'SOURCE_ERROR',
  'INVALID_SOURCE_TOTALS',
  'INVALID_REPORT_SPEC',
  'EXECUTION_ERROR',
])

// ------------------------------------------------------------- small helpers

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || 'cmp_comet'
}

function branchIdOf(options = {}) {
  const ctx = getTenantContext() || {}
  return options.branchId ?? ctx.branchId ?? null
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

/** Tenant + optional branch scope. A NULL branchId is visible to every branch. */
export function reportingTenantWhere(companyId, branchId) {
  const scope = { companyId: companyId || tenantId() }
  if (branchId) return { ...scope, OR: [{ branchId: null }, { branchId }] }
  return scope
}

function limitOf(value, fallback = 50) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), MAX_LIST)
}

function idOf(value, label) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!id) throw new HttpError(400, `${label} is required`)
  return id
}

function isoOrNullDto(value) {
  return value ? new Date(value).toISOString() : null
}

function dayInstant(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `Invalid ${label}`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, `Invalid ${label}`)
  }
  return date
}

function generateCode(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(2).toString('hex').toUpperCase()}`
}

function translatePrisma(error, label) {
  if (error?.code === 'P2002') throw new HttpError(409, `${label} already exists`)
  throw error
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

async function auditRead(req, action, resourceType, resourceId) {
  return recordRequestAudit(req, {
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata: { resourceId: String(resourceId), classification: 'INTERNAL' },
  })
}

async function reportingEvent(type, data, aggregateId, options = {}) {
  return emitEvent(type, data, {
    companyId: options.companyId || tenantId(),
    client: options.client || db,
    branchId: options.branchId ?? null,
    aggregateType: options.aggregateType || 'ReportRun',
    aggregateId,
  })
}

// ------------------------------------------------------------- allow-list core

/**
 * Validate a stored or supplied query specification. The specification is a
 * single allow-listed key and nothing else; a string with SQL syntax or an
 * extra property is a contract violation.
 */
export function assertReportSpec(spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new HttpError(400, 'Report query specification must be an object')
  }
  const text = JSON.stringify(spec)
  if (/\b(select|insert|update|delete|drop|alter|union|where|from|join|exec)\b|;|--|\/\*/i.test(text)) {
    throw new HttpError(400, 'Free-form SQL is not allowed in a report specification')
  }
  let parsed
  try {
    parsed = reportingQuerySpecSchema.parse(spec)
  } catch {
    throw new HttpError(400, 'Unknown or invalid report key')
  }
  if (!REPORT_KEYS.includes(parsed.reportKey)) {
    throw new HttpError(400, 'Unknown or invalid report key')
  }
  return { reportKey: parsed.reportKey }
}

/**
 * The complete set of report keys. Each spec declares only the parameter names
 * and status values that are meaningful for its source. Everything else is
 * rejected before a query is built.
 */
export const REPORT_SPECS = Object.freeze({
  'finance.trial-balance': {
    module: 'finance',
    params: ['asOf'],
    statuses: [],
  },
  'finance.income-statement': {
    module: 'finance',
    params: ['from', 'to'],
    statuses: [],
  },
  'finance.balance-sheet': {
    module: 'finance',
    params: ['asOf'],
    statuses: [],
  },
  'finance.receivables-ageing': {
    module: 'finance',
    params: ['asOf', 'direction'],
    statuses: [],
  },
  'sales.orders': {
    module: 'sales',
    params: ['from', 'to', 'status'],
    statuses: ['DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED'],
  },
  'inventory.stock-value': {
    module: 'inventory',
    params: [],
    statuses: [],
  },
  'procurement.purchase-orders': {
    module: 'procurement',
    params: ['from', 'to', 'status'],
    statuses: ['DRAFT', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  },
  'hr.payroll-runs': {
    module: 'hr',
    params: ['from', 'to', 'status'],
    statuses: ['DRAFT', 'CALCULATED', 'APPROVED', 'POSTED', 'CANCELLED'],
  },
  'manufacturing.production-orders': {
    module: 'manufacturing',
    params: ['status'],
    statuses: ['DRAFT', 'RELEASED', 'IN_PROGRESS', 'QUALITY_HOLD', 'COMPLETED', 'CANCELLED'],
  },
})

/** Validate and normalise run parameters for the report's allow-listed key. */
export function assertReportParameters(reportKey, input = {}) {
  const spec = REPORT_SPECS[reportKey]
  if (!spec) throw new HttpError(400, 'Unknown or invalid report key')
  let parsed
  try {
    parsed = reportingParametersSchema.parse(input || {})
  } catch {
    throw new HttpError(400, 'Invalid report parameters')
  }
  const normalised = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (!spec.params.includes(key)) {
      throw new HttpError(400, `Parameter ${key} is not allowed for ${reportKey}`)
    }
    if (key === 'status' && !spec.statuses.includes(value)) {
      throw new HttpError(400, `Status is not allowed for ${reportKey}`)
    }
    normalised[key] = value
  }
  return normalised
}

export function unavailableSummary(reportKey, reason = 'SOURCE_UNAVAILABLE') {
  if (!UNAVAILABLE_REASONS.has(reason)) throw new HttpError(500, 'Invalid unavailability reason')
  return { dataAvailable: false, reason, reportKey }
}

function assertSafeCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(500, `Invalid report counts for ${label}`)
  }
  return value
}

function assertSafeCents(value, label) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new HttpError(500, `Invalid report cents for ${label}`)
  }
  return value
}

/**
 * Final gate before persistence. A summary either has real integer counts and
 * cents, or explicitly has neither. No decimal, NaN, string or fabricated
 * placeholder value can reach the database.
 */
export function normalizeResultSummary(summary, reportKey) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    throw new HttpError(500, 'Invalid report summary')
  }
  const allowedFields = new Set([
    'dataAvailable', 'reason', 'reportKey', 'counts', 'totalsCents', 'totalsAvailable', 'generatedAt',
  ])
  for (const field of Object.keys(summary)) {
    if (!allowedFields.has(field)) throw new HttpError(500, `Invalid report summary field: ${field}`)
  }
  if (summary.dataAvailable !== true) {
    return unavailableSummary(reportKey, summary.reason || 'SOURCE_UNAVAILABLE')
  }
  if (!summary.counts || typeof summary.counts !== 'object' || Array.isArray(summary.counts)) {
    throw new HttpError(500, 'Invalid report counts')
  }
  if (!summary.totalsCents || typeof summary.totalsCents !== 'object' || Array.isArray(summary.totalsCents)) {
    throw new HttpError(500, 'Invalid report totals')
  }
  const counts = {}
  for (const [key, value] of Object.entries(summary.counts)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) throw new HttpError(500, 'Invalid report count field')
    counts[key] = assertSafeCount(value, key)
  }
  const totalsCents = {}
  for (const [key, value] of Object.entries(summary.totalsCents)) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*Cents$/.test(key)) throw new HttpError(500, 'Invalid report cents field')
    totalsCents[key] = assertSafeCents(value, key)
  }
  if (!Object.keys(counts).length) throw new HttpError(500, 'Report summary is incomplete')
  const totalsAvailable = Object.keys(totalsCents).length > 0
  // A count-only source (for example production orders) may legitimately have
  // no money columns. It must say so explicitly; an empty totals object with
  // totalsAvailable: true is never accepted.
  if (totalsAvailable !== (summary.totalsAvailable !== false)) {
    throw new HttpError(500, 'Report summary has inconsistent totals')
  }
  return {
    dataAvailable: true,
    reportKey,
    counts,
    totalsCents,
    totalsAvailable,
    generatedAt: new Date().toISOString(),
  }
}

export function assertRunTransition(current, next) {
  const allowed = {
    QUEUED: ['RUNNING', 'FAILED'],
    RUNNING: ['COMPLETED', 'FAILED'],
    FAILED: [],
    COMPLETED: [],
  }
  if (!allowed[current]?.includes(next)) {
    throw new HttpError(409, `Cannot change report run status from ${current} to ${next}`)
  }
  return true
}

// --------------------------------------------------------------- DTO helpers

export function toDefinitionDto(row) {
  if (!row) return null
  // A stored row may carry legacy/extra properties. Never echo them: only the
  // allow-listed key is projected, and even that is revalidated on the way out.
  const key = row.querySpec && typeof row.querySpec === 'object' && !Array.isArray(row.querySpec)
    ? row.querySpec.reportKey
    : null
  const spec = assertReportSpec({ reportKey: key })
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    reportKey: spec.reportKey,
    querySpec: spec,
    format: row.format,
    branchId: row.branchId ?? null,
    classification: row.classification,
    createdByUserId: row.createdByUserId ?? null,
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toRunDto(row) {
  if (!row) return null
  return {
    id: row.id,
    definitionId: row.definitionId,
    number: row.number,
    reportKey: row.reportKey,
    format: row.format,
    status: row.status,
    parameters: row.parameters && typeof row.parameters === 'object' ? row.parameters : {},
    resultSummary: row.resultSummary ?? null,
    failureReasonCode: row.failureReasonCode ?? null,
    jobId: row.jobId ?? null,
    fileObjectId: row.fileObjectId ?? null,
    branchId: row.branchId ?? null,
    requestedByUserId: row.requestedByUserId ?? null,
    classification: row.classification,
    createdAt: isoOrNullDto(row.createdAt),
    startedAt: isoOrNullDto(row.startedAt),
    completedAt: isoOrNullDto(row.completedAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toDashboardDto(row, widgets = null) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    branchId: row.branchId ?? null,
    classification: row.classification,
    createdByUserId: row.createdByUserId ?? null,
    widgets: Array.isArray(widgets) ? widgets.map(toWidgetDto) : [],
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

export function toWidgetDto(row) {
  if (!row) return null
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    definitionId: row.definitionId ?? null,
    code: row.code,
    title: row.title,
    type: row.type,
    reportKey: row.reportKey,
    position: row.position,
    branchId: row.branchId ?? null,
    classification: row.classification,
    createdAt: isoOrNullDto(row.createdAt),
    updatedAt: isoOrNullDto(row.updatedAt),
  }
}

// ------------------------------------------------------------ data collection
// Only literal model names, literal field names and validated scalar values
// reach Prisma. No string assembled from client input is ever used as a query.

function aggregateShape(model, moneyFields, extraWhere = {}) {
  return { model, moneyFields, extraWhere }
}

async function collectAggregate(client, companyId, branchId, shape) {
  const where = {
    ...reportingTenantWhere(companyId, branchId),
    ...shape.extraWhere,
  }
  const sums = {}
  for (const field of shape.moneyFields) sums[field] = true
  const aggregate = await client[shape.model].aggregate({
    where,
    _count: { _all: true },
    ...(Object.keys(sums).length ? { _sum: sums } : {}),
  })
  const records = aggregate?._count?._all ?? 0
  if (records === 0) return unavailableSummary(null, 'NO_SOURCE_ROWS')
  const totalsCents = {}
  for (const field of shape.moneyFields) {
    const value = aggregate?._sum?.[field] ?? 0
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      return unavailableSummary(null, 'INVALID_SOURCE_TOTALS')
    }
    totalsCents[field] = value
  }
  if (!shape.moneyFields.length) {
    return { dataAvailable: true, counts: { records }, totalsCents: {}, totalsAvailable: false }
  }
  return { dataAvailable: true, counts: { records }, totalsCents, totalsAvailable: true }
}

function dateRange(params) {
  const where = {}
  if (params.from) where.gte = params.from
  if (params.to) where.lte = params.to
  return where
}

function instantRange(params) {
  const where = {}
  if (params.from) where.gte = dayInstant(params.from, 'from')
  if (params.to) where.lte = dayInstant(params.to, 'to')
  return where
}

async function collectFinance(kind, params) {
  try {
    const filters = {
      ...(kind === 'ageing'
        ? { asOf: params.asOf, ...(params.direction ? { direction: params.direction } : {}) }
        : {}),
      ...(kind === 'trial-balance' || kind === 'balance-sheet' ? { asOf: params.asOf } : {}),
      ...(kind === 'income' ? { from: params.from, to: params.to } : {}),
    }
    const result = await getStatement(kind, filters)
    const report = result?.report
    if (!report || !Array.isArray(report.rows)) return unavailableSummary(null, 'SOURCE_UNAVAILABLE')
    if (report.rows.length === 0) return unavailableSummary(null, 'NO_SOURCE_ROWS')
    const totalsCents = {}
    for (const [key, value] of Object.entries(report.totals || {})) {
      if (!key.endsWith('Cents')) continue
      if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
        return unavailableSummary(null, 'INVALID_SOURCE_TOTALS')
      }
      totalsCents[key] = value
    }
    if (!Object.keys(totalsCents).length) return unavailableSummary(null, 'INVALID_SOURCE_TOTALS')
    return { dataAvailable: true, counts: { records: report.rows.length }, totalsCents, totalsAvailable: true }
  } catch {
    // Never leak source errors, SQL, tenant values or row content into a run.
    return unavailableSummary(null, 'SOURCE_ERROR')
  }
}

const COLLECTORS = Object.freeze({
  'finance.trial-balance': (ctx) => collectFinance('trial-balance', ctx.params),
  'finance.income-statement': (ctx) => collectFinance('income', ctx.params),
  'finance.balance-sheet': (ctx) => collectFinance('balance-sheet', ctx.params),
  'finance.receivables-ageing': (ctx) => collectFinance('ageing', ctx.params),
  'sales.orders': (ctx) => collectAggregate(ctx.client, ctx.companyId, ctx.branchId, aggregateShape(
    'salesOrder',
    ['subtotalCents', 'taxCents', 'totalCents'],
    {
      ...(ctx.params.status ? { status: ctx.params.status } : {}),
      ...(ctx.params.from || ctx.params.to ? { orderDate: dateRange(ctx.params) } : {}),
    },
  )),
  'inventory.stock-value': (ctx) => collectAggregate(ctx.client, ctx.companyId, ctx.branchId, aggregateShape(
    'stockBalance',
    ['totalValueCents'],
  )),
  'procurement.purchase-orders': (ctx) => collectAggregate(ctx.client, ctx.companyId, ctx.branchId, aggregateShape(
    'purchaseOrder',
    ['totalCents'],
    {
      ...(ctx.params.status ? { status: ctx.params.status } : {}),
      ...(ctx.params.from || ctx.params.to ? { orderDate: dateRange(ctx.params) } : {}),
    },
  )),
  'hr.payroll-runs': (ctx) => collectAggregate(ctx.client, ctx.companyId, ctx.branchId, aggregateShape(
    'payrollRun',
    ['grossCents', 'deductionsCents', 'employerCostCents', 'netCents'],
    {
      ...(ctx.params.status ? { status: ctx.params.status } : {}),
      ...(ctx.params.from || ctx.params.to ? { periodStart: instantRange(ctx.params) } : {}),
    },
  )),
  'manufacturing.production-orders': (ctx) => collectAggregate(ctx.client, ctx.companyId, ctx.branchId, aggregateShape(
    'productionOrder',
    [],
    { deletedAt: null, ...(ctx.params.status ? { status: ctx.params.status } : {}) },
  )),
})

/**
 * Production orders have no money column. The collector returns a real record
 * count with `totalsCents: {}` and `totalsAvailable: false`; no zero-cent or
 * client-supplied amount is ever invented to fill the money shape.
 */
export async function collectReportData(reportKey, params, options = {}) {
  const collector = COLLECTORS[reportKey]
  if (!collector) throw new HttpError(400, 'Unknown or invalid report key')
  const context = {
    client: options.client || db,
    companyId: options.companyId || tenantId(),
    branchId: options.branchId ?? null,
    params: assertReportParameters(reportKey, params),
  }
  return collector(context)
}

// --------------------------------------------------------------- definitions

async function assertBranch(companyId, branchId) {
  if (!branchId) return null
  const branch = await db.branch.findFirst({ where: { id: branchId, companyId } })
  if (!branch) throw new HttpError(400, 'Invalid branch')
  return branch
}

async function findDefinition(id, actor) {
  const principal = principalOf(actor)
  const row = await db.reportDefinition.findFirst({
    where: {
      id: idOf(id, 'Report definition'),
      ...reportingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
    },
  })
  if (!row) throw new HttpError(404, 'Report definition not found')
  return row
}

export async function listDefinitions(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.reportDefinition.findMany({
    where: {
      ...reportingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
      ...(query.reportKey ? { reportKey: query.reportKey } : {}),
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toDefinitionDto)
}

export async function getDefinition(id, actor = null) {
  return toDefinitionDto(await findDefinition(id, actor))
}

export async function createDefinition(input, actor = null) {
  const principal = principalOf(actor)
  const spec = assertReportSpec(input.querySpec)
  await assertBranch(principal.companyId, input.branchId || null)
  try {
    const row = await db.reportDefinition.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        code: input.code || generateCode('RPT'),
        name: input.name,
        description: input.description || null,
        reportKey: spec.reportKey,
        querySpec: spec,
        format: input.format || 'JSON',
        classification: input.classification || 'INTERNAL',
        createdByUserId: principal.userId,
      },
    })
    await auditMutation(actor, 'reporting.definition.created', 'ReportDefinition', row.id, {
      definitionId: row.id,
      classification: row.classification,
    })
    return toDefinitionDto(row)
  } catch (error) {
    return translatePrisma(error, 'Report definition')
  }
}

export async function updateDefinition(id, input, actor = null) {
  const existing = await findDefinition(id, actor)
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const spec = input.querySpec ? assertReportSpec(input.querySpec) : null
  const row = await db.reportDefinition.update({
    where: { id: existing.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(spec ? { reportKey: spec.reportKey, querySpec: spec } : {}),
      ...(input.format ? { format: input.format } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'reporting.definition.updated', 'ReportDefinition', row.id, {
    definitionId: row.id,
    classification: row.classification,
  })
  return toDefinitionDto(row)
}

export async function deleteDefinition(id, actor = null) {
  const existing = await findDefinition(id, actor)
  const inUse = await db.dashboardWidget.count({
    where: { definitionId: existing.id, companyId: existing.companyId, deletedAt: null },
  })
  if (inUse > 0) throw new HttpError(409, 'Report definition is referenced by dashboard widgets')
  const row = await db.reportDefinition.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  })
  await auditMutation(actor, 'reporting.definition.deleted', 'ReportDefinition', row.id, {
    definitionId: row.id,
    classification: row.classification,
  })
  return toDefinitionDto(row)
}

// --------------------------------------------------------------- report runs

async function findRun(id, options = {}) {
  const client = options.client || db
  const companyId = options.companyId || tenantId()
  const runId = idOf(id, 'Report run')
  const row = await client.reportRun.findFirst({ where: { id: runId, companyId } })
  if (!row) throw new HttpError(404, 'Report run not found')
  const scopeBranch = options.branchId ?? branchIdOf()
  if (row.branchId && scopeBranch && row.branchId !== scopeBranch) {
    throw new HttpError(404, 'Report run not found')
  }
  return row
}

export async function listRuns(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.reportRun.findMany({
    where: {
      ...reportingTenantWhere(principal.companyId, principal.branchId),
      ...(query.status ? { status: query.status } : {}),
      ...(query.definitionId ? { definitionId: query.definitionId } : {}),
      ...(query.reportKey ? { reportKey: query.reportKey } : {}),
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limitOf(query.limit),
  })
  return rows.map(toRunDto)
}

export async function getRun(id, actor = null) {
  const principal = principalOf(actor)
  return toRunDto(await findRun(id, { companyId: principal.companyId, branchId: principal.branchId }))
}

/** Job state is derived from IDs only; no job result content is returned. */
export async function getRunJobStatus(id, actor = null) {
  const run = await findRun(id, actor ? {
    companyId: principalOf(actor).companyId,
    branchId: principalOf(actor).branchId,
  } : {})
  let state = 'LOCAL'
  if (run.jobId) {
    try {
      const job = await getJobStatus('reporting.run', run.jobId)
      state = job?.state || 'UNKNOWN'
    } catch {
      state = 'UNKNOWN'
    }
  }
  return { runId: run.id, jobId: run.jobId, status: run.status, state }
}

export async function createRun(input, actor = null) {
  const principal = principalOf(actor)
  const definition = await findDefinition(input.definitionId, actor)
  const spec = assertReportSpec(definition.querySpec)
  const params = assertReportParameters(spec.reportKey, input.parameters)
  try {
    const row = await db.reportRun.create({
      data: {
        companyId: principal.companyId,
        branchId: definition.branchId || null,
        definitionId: definition.id,
        number: generateCode('RUN'),
        reportKey: spec.reportKey,
        format: definition.format,
        status: 'QUEUED',
        parameters: params,
        classification: definition.classification,
        requestedByUserId: principal.userId,
      },
    })
    await auditMutation(actor, 'reporting.run.queued', 'ReportRun', row.id, {
      runId: row.id,
      definitionId: definition.id,
      classification: row.classification,
    })
    await reportingEvent('ReportRunQueued', {
      entityType: 'REPORT_RUN',
      entityId: row.id,
      runId: row.id,
      definitionId: definition.id,
      classification: row.classification,
    }, row.id, { branchId: row.branchId })

    // The queue payload is IDs only: parameters, summaries and file references
    // never enter BullMQ, JobRecord, outbox events or socket frames.
    let enqueued = null
    try {
      enqueued = await enqueueJob('reporting.run', {
        reportRunId: row.id,
        definitionId: definition.id,
        companyId: principal.companyId,
        branchId: row.branchId || null,
        correlationId: principal.correlationId,
      })
    } catch (error) {
      console.error(`Could not enqueue report run ${row.id}: ${error?.message || 'unknown error'}`)
    }
    if (enqueued?.id) {
      await db.reportRun.update({
        where: { id: row.id },
        data: { jobId: String(enqueued.id) },
      })
      return toRunDto(await db.reportRun.findFirst({ where: { id: row.id } }))
    }

    // No queue is available (QUEUES_ENABLED=false or a minimal deployment):
    // execute synchronously so the run still reaches a real terminal state.
    return toRunDto(await executeReportRun(row.id))
  } catch (error) {
    return translatePrisma(error, 'Report run')
  }
}

/**
 * Execute a queued run once. When `options.client` is supplied (worker owner
 * Prisma client) every query also carries an explicit companyId, so trusted
 * background processing stays tenant-scoped. Replaying a terminal run is a
 * no-op rather than a second execution.
 */
export async function executeReportRun(runId, options = {}) {
  const client = options.client || db
  const companyId = options.companyId || tenantId()
  const branchId = options.branchId ?? branchIdOf()
  const run = await findRun(runId, { client, companyId, branchId })
  if (run.status !== 'QUEUED') return toRunDto(run)

  const eventOptions = { client, companyId, branchId: run.branchId || null }
  await client.reportRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date(), failureReasonCode: null },
  })

  try {
    const definition = await client.reportDefinition.findFirst({
      where: { id: run.definitionId, companyId },
    })
    if (!definition) throw new HttpError(404, 'Report definition not found')
    const spec = assertReportSpec(definition.querySpec)
    const params = assertReportParameters(spec.reportKey, run.parameters || {})
    const collected = await collectReportData(spec.reportKey, params, {
      client,
      companyId,
      branchId: run.branchId || null,
    })
    const summary = normalizeResultSummary(collected, spec.reportKey)
    // Persist the terminal state before emitting. A failed outbox write must
    // never turn a completed run into a failed run or emit a misleading event.
    const updated = await client.reportRun.update({
      where: { id: run.id },
      data: {
        status: 'COMPLETED',
        resultSummary: summary,
        failureReasonCode: null,
        completedAt: new Date(),
      },
    })
    try {
      await reportingEvent('ReportRunCompleted', {
        entityType: 'REPORT_RUN',
        entityId: run.id,
        runId: run.id,
        definitionId: run.definitionId,
        classification: run.classification,
      }, run.id, eventOptions)
    } catch (eventError) {
      console.error(`Could not emit ReportRunCompleted for ${run.id}: ${eventError?.message || 'unknown error'}`)
    }
    return toRunDto(updated)
  } catch (error) {
    const reason = error instanceof HttpError && error.status < 500
      ? 'INVALID_REPORT_SPEC'
      : 'EXECUTION_ERROR'
    const updated = await client.reportRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', failureReasonCode: reason, completedAt: new Date() },
    })
    try {
      await reportingEvent('ReportRunFailed', {
        entityType: 'REPORT_RUN',
        entityId: run.id,
        runId: run.id,
        definitionId: run.definitionId,
        classification: run.classification,
      }, run.id, eventOptions)
    } catch (eventError) {
      console.error(`Could not emit ReportRunFailed for ${run.id}: ${eventError?.message || 'unknown error'}`)
    }
    return toRunDto(updated)
  }
}

// ---------------------------------------------------------------- dashboards

async function findDashboard(id, actor) {
  const principal = principalOf(actor)
  const row = await db.dashboard.findFirst({
    where: {
      id: idOf(id, 'Dashboard'),
      ...reportingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
    },
  })
  if (!row) throw new HttpError(404, 'Dashboard not found')
  return row
}

async function dashboardWidgets(dashboardId, companyId) {
  return db.dashboardWidget.findMany({
    where: { dashboardId, companyId, deletedAt: null },
    orderBy: [{ position: 'asc' }, { code: 'asc' }],
    take: MAX_LIST,
  })
}

export async function listDashboards(query = {}, actor = null) {
  const principal = principalOf(actor)
  const rows = await db.dashboard.findMany({
    where: {
      ...reportingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
    },
    orderBy: [{ code: 'asc' }],
    take: limitOf(query.limit),
  })
  return Promise.all(rows.map(async (row) => (
    toDashboardDto(row, await dashboardWidgets(row.id, row.companyId))
  )))
}

export async function getDashboard(id, actor = null) {
  const row = await findDashboard(id, actor)
  return toDashboardDto(row, await dashboardWidgets(row.id, row.companyId))
}

export async function createDashboard(input, actor = null) {
  const principal = principalOf(actor)
  await assertBranch(principal.companyId, input.branchId || null)
  try {
    const row = await db.dashboard.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        code: input.code || generateCode('DASH'),
        name: input.name,
        description: input.description || null,
        classification: input.classification || 'INTERNAL',
        createdByUserId: principal.userId,
      },
    })
    await auditMutation(actor, 'reporting.dashboard.created', 'Dashboard', row.id, {
      dashboardId: row.id,
      classification: row.classification,
    })
    await reportingEvent('DashboardUpdated', {
      entityType: 'DASHBOARD',
      entityId: row.id,
      dashboardId: row.id,
      classification: row.classification,
    }, row.id, { aggregateType: 'Dashboard', branchId: row.branchId })
    return toDashboardDto(row, [])
  } catch (error) {
    return translatePrisma(error, 'Dashboard')
  }
}

export async function updateDashboard(id, input, actor = null) {
  const existing = await findDashboard(id, actor)
  const principal = principalOf(actor)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const row = await db.dashboard.update({
    where: { id: existing.id },
    data: {
      ...(input.name ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'reporting.dashboard.updated', 'Dashboard', row.id, {
    dashboardId: row.id,
    classification: row.classification,
  })
  await reportingEvent('DashboardUpdated', {
    entityType: 'DASHBOARD',
    entityId: row.id,
    dashboardId: row.id,
    classification: row.classification,
  }, row.id, { aggregateType: 'Dashboard', branchId: row.branchId })
  return toDashboardDto(row, await dashboardWidgets(row.id, row.companyId))
}

/** Latest completed result per widget, with explicit no-run metadata. */
export async function getDashboardSummary(id, actor = null) {
  const dashboard = await findDashboard(id, actor)
  const principal = principalOf(actor)
  const widgets = await dashboardWidgets(dashboard.id, dashboard.companyId)
  const items = []
  for (const widget of widgets) {
    const run = widget.definitionId
      ? await db.reportRun.findFirst({
        where: {
          companyId: principal.companyId,
          definitionId: widget.definitionId,
          status: 'COMPLETED',
        },
        orderBy: [{ completedAt: 'desc' }],
      })
      : null
    items.push({
      widgetId: widget.id,
      reportKey: widget.reportKey,
      latestRunId: run?.id ?? null,
      status: run?.status ?? null,
      resultSummary: run?.resultSummary ?? unavailableSummary(widget.reportKey, 'NO_RUN_YET'),
    })
  }
  return { dashboardId: dashboard.id, widgets: items }
}

// -------------------------------------------------------------------- widgets

async function findWidget(id, actor) {
  const principal = principalOf(actor)
  const row = await db.dashboardWidget.findFirst({
    where: {
      id: idOf(id, 'Dashboard widget'),
      ...reportingTenantWhere(principal.companyId, principal.branchId),
      deletedAt: null,
    },
  })
  if (!row) throw new HttpError(404, 'Dashboard widget not found')
  return row
}

async function assertWidgetDefinition(companyId, definitionId, reportKey) {
  if (!definitionId) return null
  const definition = await db.reportDefinition.findFirst({
    where: { id: definitionId, companyId, deletedAt: null },
  })
  if (!definition) throw new HttpError(404, 'Report definition not found')
  const spec = assertReportSpec(definition.querySpec)
  if (spec.reportKey !== reportKey) {
    throw new HttpError(400, 'Widget report key must match the selected definition')
  }
  return definition
}

export async function listWidgets(dashboardId, actor = null) {
  const dashboard = await findDashboard(dashboardId, actor)
  return (await dashboardWidgets(dashboard.id, dashboard.companyId)).map(toWidgetDto)
}

export async function getWidget(id, actor = null) {
  return toWidgetDto(await findWidget(id, actor))
}

export async function createWidget(dashboardId, input, actor = null) {
  const dashboard = await findDashboard(dashboardId, actor)
  const principal = principalOf(actor)
  await assertWidgetDefinition(principal.companyId, input.definitionId || null, input.reportKey)
  await assertBranch(principal.companyId, input.branchId || null)
  try {
    const row = await db.dashboardWidget.create({
      data: {
        companyId: principal.companyId,
        branchId: input.branchId || null,
        dashboardId: dashboard.id,
        definitionId: input.definitionId || null,
        code: input.code || generateCode('WDG'),
        title: input.title,
        type: input.type || 'METRIC',
        reportKey: input.reportKey,
        position: input.position ?? 0,
        classification: input.classification || 'INTERNAL',
        createdByUserId: principal.userId,
      },
    })
    await auditMutation(actor, 'reporting.widget.created', 'DashboardWidget', row.id, {
      widgetId: row.id,
      dashboardId: dashboard.id,
      classification: row.classification,
    })
    await reportingEvent('DashboardUpdated', {
      entityType: 'DASHBOARD',
      entityId: dashboard.id,
      dashboardId: dashboard.id,
      classification: dashboard.classification,
    }, dashboard.id, { aggregateType: 'Dashboard', branchId: dashboard.branchId })
    return toWidgetDto(row)
  } catch (error) {
    return translatePrisma(error, 'Dashboard widget')
  }
}

export async function updateWidget(id, input, actor = null) {
  const existing = await findWidget(id, actor)
  const principal = principalOf(actor)
  const reportKey = input.reportKey || existing.reportKey
  await assertWidgetDefinition(principal.companyId, input.definitionId ?? existing.definitionId, reportKey)
  if (Object.prototype.hasOwnProperty.call(input, 'branchId')) {
    await assertBranch(principal.companyId, input.branchId || null)
  }
  const row = await db.dashboardWidget.update({
    where: { id: existing.id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.type ? { type: input.type } : {}),
      ...(input.reportKey ? { reportKey: input.reportKey } : {}),
      ...(input.definitionId !== undefined ? { definitionId: input.definitionId || null } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.branchId !== undefined ? { branchId: input.branchId || null } : {}),
      ...(input.classification ? { classification: input.classification } : {}),
    },
  })
  await auditMutation(actor, 'reporting.widget.updated', 'DashboardWidget', row.id, {
    widgetId: row.id,
    dashboardId: row.dashboardId,
    classification: row.classification,
  })
  await reportingEvent('DashboardUpdated', {
    entityType: 'DASHBOARD',
    entityId: row.dashboardId,
    dashboardId: row.dashboardId,
    classification: row.classification,
  }, row.dashboardId, { aggregateType: 'Dashboard', branchId: row.branchId })
  return toWidgetDto(row)
}

export async function deleteWidget(id, actor = null) {
  const existing = await findWidget(id, actor)
  const row = await db.dashboardWidget.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  })
  await auditMutation(actor, 'reporting.widget.deleted', 'DashboardWidget', row.id, {
    widgetId: row.id,
    dashboardId: row.dashboardId,
    classification: row.classification,
  })
  await reportingEvent('DashboardUpdated', {
    entityType: 'DASHBOARD',
    entityId: row.dashboardId,
    dashboardId: row.dashboardId,
    classification: row.classification,
  }, row.dashboardId, { aggregateType: 'Dashboard', branchId: row.branchId })
  return toWidgetDto(row)
}

export { auditRead }
