// Phase 14 reporting unit/contract tests. Pure helpers, schemas, DTO guards,
// events and source contracts only - no database or network calls. Cross-tenant
// RLS isolation is verified separately by the deployment probe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  REPORT_KEYS,
  REPORT_FORMATS,
  REPORT_RUN_STATUSES,
  DASHBOARD_WIDGET_TYPES,
  REPORTING_MONEY_FIELDS,
  reportingQuerySpecSchema,
  reportingReportDefinitionCreateSchema,
  reportingRunCreateSchema,
  reportingParametersSchema,
  reportingWidgetCreateSchema,
} from '../lib/validation.js'
import {
  REPORT_SPECS,
  assertReportSpec,
  assertReportParameters,
  assertRunTransition,
  reportingTenantWhere,
  unavailableSummary,
  normalizeResultSummary,
  toDefinitionDto,
  toRunDto,
  toWidgetDto,
} from '../lib/reporting.js'
import {
  DomainEventSchemas,
  ReportRunQueuedDataSchema,
  ReportRunCompletedDataSchema,
  ReportRunFailedDataSchema,
  DashboardUpdatedDataSchema,
} from '../../shared/src/events.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { dispatchEvent } from '../../realtime/src/events.js'

function read(relative) {
  return readFileSync(new URL(relative, import.meta.url), 'utf8')
}

const runEventData = {
  entityType: 'REPORT_RUN',
  entityId: 'run_1',
  runId: 'run_1',
  definitionId: 'def_1',
  classification: 'INTERNAL',
}

// ---------------------------------------------------------------- allow-list

test('report keys are the fixed nine-key allow-list and nothing else', () => {
  assert.deepEqual([...REPORT_KEYS], [
    'finance.trial-balance',
    'finance.income-statement',
    'finance.balance-sheet',
    'finance.receivables-ageing',
    'sales.orders',
    'inventory.stock-value',
    'procurement.purchase-orders',
    'hr.payroll-runs',
    'manufacturing.production-orders',
  ])
  assert.deepEqual(Object.keys(REPORT_SPECS).sort(), [...REPORT_KEYS].sort())
  assert.deepEqual(REPORT_FORMATS, ['JSON', 'CSV', 'PDF_READY'])
  assert.deepEqual(REPORT_RUN_STATUSES, ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'])
  assert.deepEqual(DASHBOARD_WIDGET_TYPES, ['METRIC', 'TABLE', 'CHART'])
  assert.deepEqual(assertReportSpec({ reportKey: 'sales.orders' }), { reportKey: 'sales.orders' })
  assert.throws(() => assertReportSpec({ reportKey: 'hr.salaries' }), /Unknown or invalid report key/)
  assert.throws(() => assertReportSpec({ reportKey: 7 }), /Unknown or invalid report key/)
  assert.throws(() => assertReportSpec('sales.orders'), /must be an object/)
})

test('query specifications reject SQL syntax and every extra property', () => {
  assert.throws(
    () => assertReportSpec({ reportKey: 'sales.orders', sql: 'SELECT 1' }),
    /Free-form SQL is not allowed/,
  )
  assert.throws(
    () => assertReportSpec({ reportKey: 'sales.orders', where: "totalCents > 0" }),
    /Free-form SQL is not allowed/,
  )
  assert.throws(
    () => assertReportSpec({ reportKey: 'sales.orders', table: 'SalesOrder' }),
    /Unknown or invalid report key/,
  )
  assert.equal(reportingQuerySpecSchema.safeParse({ reportKey: 'sales.orders', extra: 1 }).success, false)
})

test('run parameters are typed per key and reject SQL, tenant and unknown fields', () => {
  assert.deepEqual(
    assertReportParameters('finance.income-statement', { from: '2026-01-01', to: '2026-01-31' }),
    { from: '2026-01-01', to: '2026-01-31' },
  )
  assert.deepEqual(assertReportParameters('inventory.stock-value', {}), {})
  assert.throws(() => assertReportParameters('inventory.stock-value', { from: '2026-01-01' }), /not allowed/)
  assert.throws(() => assertReportParameters('sales.orders', { status: 'POSTED' }), /Status is not allowed/)
  assert.throws(() => assertReportParameters('sales.orders', { companyId: 'cmp_other' }), /Invalid report parameters/)
  assert.throws(() => assertReportParameters('sales.orders', { branchId: 'br_1' }), /Invalid report parameters/)
  assert.throws(() => assertReportParameters('sales.orders', { sql: '1=1' }), /Invalid report parameters/)
  assert.throws(() => assertReportParameters('nope', {}), /Unknown or invalid report key/)
  assert.throws(
    () => reportingParametersSchema.parse({ from: '2026-02-01', to: '2026-01-01' }),
    /from must not be after to/,
  )
  assert.throws(
    () => reportingRunCreateSchema.parse({ definitionId: 'def_1', parameters: { query: 'select 1' } }),
    /unrecognized/i,
  )
})

// --------------------------------------------------------------- DLP & tenant

test('reporting free text fails closed on card data and secrets', () => {
  const base = { name: 'Trial balance', querySpec: { reportKey: 'finance.trial-balance' } }
  assert.throws(
    () => reportingReportDefinitionCreateSchema.parse({ ...base, name: 'Card 4111111111111111' }),
    /CARD/i,
  )
  assert.throws(
    () => reportingReportDefinitionCreateSchema.parse({ ...base, description: 'token sk_live_abcdefghijklmnop' }),
    /TOKEN|SECRET/i,
  )
  assert.throws(
    () => reportingWidgetCreateSchema.parse({
      title: 'Card 4111111111111111',
      reportKey: 'finance.trial-balance',
    }),
    /CARD/i,
  )
})

test('reporting tenant scope allows branch-wide rows but never another company', () => {
  assert.deepEqual(reportingTenantWhere('cmp_a', null), { companyId: 'cmp_a' })
  assert.deepEqual(reportingTenantWhere('cmp_a', 'br_1'), {
    companyId: 'cmp_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(reportingTenantWhere('cmp_a', 'br_1')).includes('cmp_other'), false)
})

// ------------------------------------------------------------------- summaries

test('available summaries keep only safe integer counts and integer cents', () => {
  const summary = normalizeResultSummary({
    dataAvailable: true,
    counts: { records: 3 },
    totalsCents: { totalCents: 1250, taxCents: 100 },
    totalsAvailable: true,
  }, 'sales.orders')
  assert.equal(summary.dataAvailable, true)
  assert.equal(summary.reportKey, 'sales.orders')
  assert.deepEqual(summary.counts, { records: 3 })
  assert.deepEqual(summary.totalsCents, { totalCents: 1250, taxCents: 100 })
  assert.equal(summary.totalsAvailable, true)
  assert.match(summary.generatedAt, /^\d{4}-\d{2}-\d{2}T/)

  assert.throws(() => normalizeResultSummary({
    dataAvailable: true, counts: { records: 1 }, totalsCents: { totalCents: 12.5 },
  }, 'sales.orders'), /cents/)
  assert.throws(() => normalizeResultSummary({
    dataAvailable: true, counts: { records: 1.5 }, totalsCents: { totalCents: 100 },
  }, 'sales.orders'), /counts/)
  assert.throws(() => normalizeResultSummary({
    dataAvailable: true, counts: { records: 1 }, totalsCents: { total: 100 },
  }, 'sales.orders'), /cents field/)
  assert.throws(() => normalizeResultSummary({
    dataAvailable: true, counts: { records: 1 }, totalsCents: { totalCents: 100 }, sql: 'x',
  }, 'sales.orders'), /summary field/)
})

test('count-only sources are explicit and never fabricate a zero-cent total', () => {
  const summary = normalizeResultSummary({
    dataAvailable: true,
    counts: { records: 4 },
    totalsCents: {},
    totalsAvailable: false,
  }, 'manufacturing.production-orders')
  assert.equal(summary.dataAvailable, true)
  assert.deepEqual(summary.counts, { records: 4 })
  assert.deepEqual(summary.totalsCents, {})
  assert.equal(summary.totalsAvailable, false)
  assert.equal(JSON.stringify(summary).includes('plannedUnitsCents'), false)
  assert.throws(() => normalizeResultSummary({
    dataAvailable: true, counts: { records: 4 }, totalsCents: {},
  }, 'manufacturing.production-orders'), /inconsistent totals/)
  assert.throws(() => normalizeResultSummary({
    dataAvailable: true, counts: { records: 4 }, totalsCents: { plannedUnitsCents: 0 }, totalsAvailable: false,
  }, 'manufacturing.production-orders'), /inconsistent totals/)
})

test('unavailable summaries expose metadata but no counts, totals or source errors', () => {
  const summary = normalizeResultSummary({ dataAvailable: false, reason: 'NO_SOURCE_ROWS' }, 'inventory.stock-value')
  assert.deepEqual(summary, {
    dataAvailable: false,
    reason: 'NO_SOURCE_ROWS',
    reportKey: 'inventory.stock-value',
  })
  assert.equal(Object.hasOwn(summary, 'counts'), false)
  assert.equal(Object.hasOwn(summary, 'totalsCents'), false)
  assert.deepEqual(unavailableSummary('x', 'NO_RUN_YET'), {
    dataAvailable: false, reason: 'NO_RUN_YET', reportKey: 'x',
  })
  assert.throws(() => unavailableSummary('x', 'SOURCE_ERROR_DETAIL'), /Invalid unavailability reason/)
  for (const field of REPORTING_MONEY_FIELDS) assert.match(field, /Cents$/)
})

test('run status transitions cannot skip or revive a terminal run', () => {
  assert.equal(assertRunTransition('QUEUED', 'RUNNING'), true)
  assert.equal(assertRunTransition('RUNNING', 'COMPLETED'), true)
  assert.equal(assertRunTransition('RUNNING', 'FAILED'), true)
  assert.throws(() => assertRunTransition('QUEUED', 'COMPLETED'), /Cannot change report run/)
  assert.throws(() => assertRunTransition('COMPLETED', 'RUNNING'), /Cannot change report run/)
  assert.throws(() => assertRunTransition('FAILED', 'QUEUED'), /Cannot change report run/)
})

// ------------------------------------------------------------------------ DTOs

test('DTOs expose IDs and classification without echoing unvalidated source data', () => {
  const definition = toDefinitionDto({
    id: 'def_1', code: 'RPT-1', name: 'Trial balance', reportKey: 'finance.trial-balance',
    querySpec: { reportKey: 'finance.trial-balance', sql: 'SELECT 1' },
    format: 'JSON', classification: 'INTERNAL',
  })
  assert.deepEqual(definition.querySpec, { reportKey: 'finance.trial-balance' })
  assert.equal(JSON.stringify(definition).includes('SELECT 1'), false)

  const run = toRunDto({
    id: 'run_1', definitionId: 'def_1', number: 'RUN-1', reportKey: 'finance.trial-balance',
    format: 'JSON', status: 'COMPLETED', parameters: { from: '2026-01-01' },
    resultSummary: { dataAvailable: false, reason: 'NO_SOURCE_ROWS' },
    jobId: 'job_1', fileObjectId: null, classification: 'INTERNAL',
  })
  assert.equal(run.jobId, 'job_1')
  assert.equal(run.fileObjectId, null)
  assert.deepEqual(run.resultSummary, { dataAvailable: false, reason: 'NO_SOURCE_ROWS' })

  const widget = toWidgetDto({
    id: 'wdg_1', dashboardId: 'dash_1', definitionId: 'def_1', code: 'WDG-1',
    title: 'Widget', type: 'METRIC', reportKey: 'finance.trial-balance',
    position: 0, classification: 'INTERNAL',
  })
  assert.equal(widget.definitionId, 'def_1')
  assert.equal(widget.reportKey, 'finance.trial-balance')
})

// ---------------------------------------------------------------- events/sockets

test('reporting event schemas are strict and ID/classification-only', () => {
  const types = ['ReportRunQueued', 'ReportRunCompleted', 'ReportRunFailed']
  for (const type of types) {
    assert.equal(DomainEventSchemas[type].parse(runEventData).runId, 'run_1')
    for (const extra of [
      { totalCents: 1250 },
      { parameters: { from: '2026-01-01' } },
      { reportKey: 'finance.trial-balance' },
      { fileObjectId: 'file_1' },
      { status: 'COMPLETED' },
    ]) {
      assert.throws(() => DomainEventSchemas[type].parse({ ...runEventData, ...extra }), /unrecognized/i)
    }
  }
  const dashboardEvent = {
    entityType: 'DASHBOARD', entityId: 'dash_1', dashboardId: 'dash_1', classification: 'INTERNAL',
  }
  assert.equal(DomainEventSchemas.DashboardUpdated.parse(dashboardEvent).dashboardId, 'dash_1')
  assert.throws(
    () => DomainEventSchemas.DashboardUpdated.parse({ ...dashboardEvent, title: 'Secret dashboard' }),
    /unrecognized/i,
  )
  assert.equal(typeof ReportRunQueuedDataSchema.parse, 'function')
  assert.equal(typeof ReportRunCompletedDataSchema.parse, 'function')
  assert.equal(typeof ReportRunFailedDataSchema.parse, 'function')
  assert.equal(typeof DashboardUpdatedDataSchema.parse, 'function')
})

test('reporting events map to two company-room-only ERP socket channels', () => {
  const emitted = []
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }
  const base = {
    companyId: 'cmp_comet',
    branchId: 'br_1',
    occurredAt: '2026-11-23T00:00:00.000Z',
    correlationId: 'cor_1',
  }
  for (const [type, data] of [
    ['ReportRunCompleted', runEventData],
    ['DashboardUpdated', { entityType: 'DASHBOARD', entityId: 'dash_1', dashboardId: 'dash_1', classification: 'INTERNAL' }],
  ]) {
    emitted.length = 0
    assert.equal(dispatchEvent(io, { ...base, type, data }), 1)
    assert.equal(emitted[0].room, 'company:cmp_comet')
    assert.equal(emitted[0].event, type === 'ReportRunCompleted' ? 'reporting:run' : 'reporting:dashboard')
    assert.equal(JSON.stringify(emitted[0].payload).includes('br_1'), false)
    assert.equal(JSON.stringify(emitted[0].payload).includes('totalCents'), false)
  }
  assert.equal(dispatchEvent(io, { ...base, type: 'UnknownEvent', data: runEventData }), 0)
})

// ------------------------------------------------------------------ permissions

test('reporting exposes exactly six scoped permissions with separated duties', () => {
  const keys = Object.keys(PERMISSIONS).filter((key) => key.startsWith('reporting.'))
  assert.equal(keys.length, 6)
  assert.deepEqual(keys.sort(), [
    'reporting.dashboard.read', 'reporting.dashboard.write',
    'reporting.definition.read', 'reporting.definition.write',
    'reporting.run.read', 'reporting.run.write',
  ])
  for (const key of keys) assert.equal(ROLE_PERMISSIONS.ADMIN.includes(key), true)
  for (const key of ['reporting.definition.read', 'reporting.run.read', 'reporting.dashboard.read']) {
    assert.equal(ROLE_PERMISSIONS.MANAGER.includes(key), true)
    assert.equal(ROLE_PERMISSIONS.STAFF.includes(key), true)
    assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes(key), true)
  }
  for (const key of ['reporting.definition.write', 'reporting.dashboard.write']) {
    assert.equal(ROLE_PERMISSIONS.MANAGER.includes(key), true)
    assert.equal(ROLE_PERMISSIONS.STAFF.includes(key), false)
    assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes(key), false)
  }
  assert.equal(ROLE_PERMISSIONS.COMPLIANCE.includes('reporting.run.write'), true)
  assert.equal(ROLE_PERMISSIONS.STAFF.includes('reporting.run.write'), false)
})

// --------------------------------------------------------------- source contract

test('reporting service has no SQL surface and no dynamic client input', () => {
  const source = read('../lib/reporting.js')
  assert.doesNotMatch(source, /\$queryRaw|\$executeRaw/)
  assert.doesNotMatch(source, /client\[\s*(ctx|input|params)\./)
  assert.doesNotMatch(source, /companyId:\s*(input|params)\./)
  assert.match(source, /assertReportSpec/)
  assert.match(source, /assertReportParameters/)
  assert.match(source, /dataAvailable:\s*false/)
})

test('API router, queues, worker and ERP tab are wired exactly once', () => {
  const api = read('../index.js')
  assert.match(api, /app\.use\('\/api\/reporting', reportingRouter\)/)
  assert.equal((api.match(/app\.use\('\/api\/reporting'/g) || []).length, 1)

  const routes = read('../routes/reporting.routes.js')
  assert.match(routes, /requirePermission\('reporting\.definition\.write'\)/)
  assert.match(routes, /requirePermission\('reporting\.run\.write'\)/)
  assert.match(routes, /requirePermission\('reporting\.dashboard\.write'\)/)
  assert.equal((routes.match(/reportingRouter\.use\(requireAuth\)/g) || []).length, 1)

  const apiQueues = read('../lib/queues.js')
  const workerIndex = read('../../workers/src/index.js')
  assert.match(apiQueues, /'reporting\.run'/)
  assert.match(workerIndex, /'reporting\.run'/)

  const workerJobs = read('../../workers/src/jobs.js')
  assert.match(workerJobs, /'reporting\.run':\s*runReport/)
  assert.match(workerJobs, /runWithTenant/)
  assert.match(workerJobs, /const result = \{ reportRunId: run\.id \}/)
  assert.doesNotMatch(workerJobs, /resultSummary:\s*result/)

  const html = read('../../erp/public/index.html')
  assert.match(html, /id="tabReporting"/)
  assert.match(html, /id="reportingView"/)
  assert.match(html, /id="reportingDefinitionRows"/)
  assert.match(html, /id="reportingRunRows"/)

  const app = read('../../erp/public/app.js')
  assert.match(app, /reporting:run/)
  assert.match(app, /reporting:dashboard/)
  assert.match(app, /function onReportingEvent\(\)/)
  assert.match(app, /function reportingParameters\(definition\)/)

  const seed = read('../../../prisma/seed.js')
  assert.match(seed, /reportDefinition\.upsert/)
  assert.match(seed, /dashboard\.upsert/)
  assert.match(seed, /dashboardWidget\.upsert/)
})

test('migration enables RLS for every new reporting table', () => {
  const migration = read('../../../prisma/migrations/20261123000800_phase14_reporting/migration.sql')
  for (const table of ['ReportDefinition', 'ReportRun', 'Dashboard', 'DashboardWidget']) {
    assert.match(migration, new RegExp(`'${table}'`))
  }
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /tenant_branch_scope/)
  assert.match(migration, /app\.company_id/)
  assert.match(migration, /app\.branch_id/)
})
