// Phase 14 reporting HTTP surface. Routes only validate, authorise and audit;
// the allow-list, integer-cent collectors, tenant scoping and ID-only events
// live in lib/reporting.js. No route accepts SQL, a table name, a field name,
// companyId or branchId from a client.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  REPORT_KEYS,
  reportingReportDefinitionCreateSchema,
  reportingReportDefinitionUpdateSchema,
  reportingDefinitionQuerySchema,
  reportingRunCreateSchema,
  reportingRunQuerySchema,
  reportingDashboardCreateSchema,
  reportingDashboardUpdateSchema,
  reportingDashboardQuerySchema,
  reportingWidgetCreateSchema,
  reportingWidgetUpdateSchema,
} from '../lib/validation.js'
import {
  listDefinitions,
  getDefinition,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  listRuns,
  getRun,
  getRunJobStatus,
  createRun,
  listDashboards,
  getDashboard,
  getDashboardSummary,
  createDashboard,
  updateDashboard,
  listWidgets,
  getWidget,
  createWidget,
  updateWidget,
  deleteWidget,
} from '../lib/reporting.js'

export const reportingRouter = Router()

reportingRouter.use(requireAuth)

function actor(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    roles: req.auth.roles,
    correlationId: req.correlationId,
    req,
  }
}

async function auditRead(req, action, resourceType, resourceId) {
  return recordRequestAudit(req, {
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata: { resourceId: String(resourceId), classification: 'INTERNAL' },
  })
}

// OPTIONS is exposed for the allow-listed query specification only. It is a
// static contract response, not a query endpoint.
reportingRouter.get('/report-keys', requirePermission('reporting.definition.read'), async (_req, res) => {
  return res.json({ reportKeys: REPORT_KEYS })
})

// --------------------------------------------------------------- definitions

reportingRouter.get('/definitions', requirePermission('reporting.definition.read'), async (req, res) => {
  const query = reportingDefinitionQuerySchema.parse(req.query)
  return res.json({ definitions: await listDefinitions(query, actor(req)) })
})

reportingRouter.post('/definitions', requirePermission('reporting.definition.write'), async (req, res) => {
  const body = reportingReportDefinitionCreateSchema.parse(req.body)
  return res.status(201).json({ definition: await createDefinition(body, actor(req)) })
})

reportingRouter.get('/definitions/:id', requirePermission('reporting.definition.read'), async (req, res) => {
  const definition = await getDefinition(req.params.id, actor(req))
  await auditRead(req, 'reporting.definition.read', 'ReportDefinition', req.params.id)
  return res.json({ definition })
})

reportingRouter.patch('/definitions/:id', requirePermission('reporting.definition.write'), async (req, res) => {
  const body = reportingReportDefinitionUpdateSchema.parse(req.body)
  return res.json({ definition: await updateDefinition(req.params.id, body, actor(req)) })
})

reportingRouter.delete('/definitions/:id', requirePermission('reporting.definition.write'), async (req, res) => {
  return res.json({ definition: await deleteDefinition(req.params.id, actor(req)) })
})

// ---------------------------------------------------------------- report runs

reportingRouter.get('/runs', requirePermission('reporting.run.read'), async (req, res) => {
  const query = reportingRunQuerySchema.parse(req.query)
  return res.json({ runs: await listRuns(query, actor(req)) })
})

reportingRouter.post('/runs', requirePermission('reporting.run.write'), async (req, res) => {
  const body = reportingRunCreateSchema.parse(req.body)
  return res.status(201).json({ run: await createRun(body, actor(req)) })
})

reportingRouter.get('/runs/:id', requirePermission('reporting.run.read'), async (req, res) => {
  const run = await getRun(req.params.id, actor(req))
  await auditRead(req, 'reporting.run.read', 'ReportRun', req.params.id)
  return res.json({ run })
})

reportingRouter.get('/runs/:id/job', requirePermission('reporting.run.read'), async (req, res) => {
  return res.json({ job: await getRunJobStatus(req.params.id, actor(req)) })
})

// ----------------------------------------------------------------- dashboards

reportingRouter.get('/dashboards', requirePermission('reporting.dashboard.read'), async (req, res) => {
  const query = reportingDashboardQuerySchema.parse(req.query)
  return res.json({ dashboards: await listDashboards(query, actor(req)) })
})

reportingRouter.post('/dashboards', requirePermission('reporting.dashboard.write'), async (req, res) => {
  const body = reportingDashboardCreateSchema.parse(req.body)
  return res.status(201).json({ dashboard: await createDashboard(body, actor(req)) })
})

reportingRouter.get('/dashboards/:id', requirePermission('reporting.dashboard.read'), async (req, res) => {
  const dashboard = await getDashboard(req.params.id, actor(req))
  await auditRead(req, 'reporting.dashboard.read', 'Dashboard', req.params.id)
  return res.json({ dashboard })
})

reportingRouter.patch('/dashboards/:id', requirePermission('reporting.dashboard.write'), async (req, res) => {
  const body = reportingDashboardUpdateSchema.parse(req.body)
  return res.json({ dashboard: await updateDashboard(req.params.id, body, actor(req)) })
})

reportingRouter.get('/dashboards/:id/summary', requirePermission('reporting.dashboard.read'), async (req, res) => {
  return res.json({ summary: await getDashboardSummary(req.params.id, actor(req)) })
})

// -------------------------------------------------------------------- widgets

reportingRouter.get('/dashboards/:dashboardId/widgets', requirePermission('reporting.dashboard.read'), async (req, res) => {
  return res.json({ widgets: await listWidgets(req.params.dashboardId, actor(req)) })
})

reportingRouter.post('/dashboards/:dashboardId/widgets', requirePermission('reporting.dashboard.write'), async (req, res) => {
  const body = reportingWidgetCreateSchema.parse(req.body)
  return res.status(201).json({ widget: await createWidget(req.params.dashboardId, body, actor(req)) })
})

reportingRouter.get('/widgets/:id', requirePermission('reporting.dashboard.read'), async (req, res) => {
  const widget = await getWidget(req.params.id, actor(req))
  await auditRead(req, 'reporting.dashboard.read', 'DashboardWidget', req.params.id)
  return res.json({ widget })
})

reportingRouter.patch('/widgets/:id', requirePermission('reporting.dashboard.write'), async (req, res) => {
  const body = reportingWidgetUpdateSchema.parse(req.body)
  return res.json({ widget: await updateWidget(req.params.id, body, actor(req)) })
})

reportingRouter.delete('/widgets/:id', requirePermission('reporting.dashboard.write'), async (req, res) => {
  return res.json({ widget: await deleteWidget(req.params.id, actor(req)) })
})
