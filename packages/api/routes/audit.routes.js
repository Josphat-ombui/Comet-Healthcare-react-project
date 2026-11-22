// Read-only audit surface. The log is append-only at the database level.

import { Router } from 'express'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'
import { db } from '../lib/tenant.js'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { auditQuerySchema } from '../lib/validation.js'
import { verifyAuditChain } from '../lib/audit.js'

export const auditRouter = Router()

auditRouter.use(requireAuth)

function company(req) {
  return req.auth.companyId || DEFAULT_COMPANY_ID
}

auditRouter.get('/logs', requirePermission('audit.read'), async (req, res) => {
  const query = auditQuerySchema.parse(req.query)
  const where = { companyId: company(req) }
  if (query.action) where.action = query.action
  if (query.actorId) where.actorId = query.actorId
  if (query.resourceType) where.resourceType = query.resourceType
  if (query.from || query.to) {
    where.createdAt = {}
    if (query.from) where.createdAt.gte = new Date(query.from)
    if (query.to) where.createdAt.lte = new Date(query.to)
  }
  const entries = await db.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit,
    select: {
      id: true, actorId: true, action: true, resourceType: true, resourceId: true,
      metadata: true, correlationId: true, createdAt: true,
    },
  })
  return res.json({ entries, count: entries.length })
})

auditRouter.get('/verify', requirePermission('audit.verify'), async (req, res) => {
  const result = await verifyAuditChain(company(req))
  return res.json({ status: result.valid ? 'valid' : 'tampered', ...result })
})
