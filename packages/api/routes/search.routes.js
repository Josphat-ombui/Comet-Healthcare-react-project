// Permission-aware search HTTP surface. The raw query text is never audited.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import { searchQuerySchema } from '../lib/validation.js'
import { search } from '../lib/search.js'

export const searchRouter = Router()

searchRouter.use(requireAuth)

searchRouter.get('/', requirePermission('search.read'), async (req, res) => {
  // Support both ?types=FILE&types=DOCUMENT and ?types=FILE,DOCUMENT.
  const source = { ...req.query }
  if (typeof source.types === 'string') source.types = source.types.split(',').filter(Boolean)
  const query = searchQuerySchema.parse(source)

  const roles = req.auth.roles || []
  const branchIds = req.auth.branchIds || []
  const privileged = roles.includes('ADMIN') || roles.includes('COMPLIANCE')

  const results = await search({
    query: query.q,
    types: query.types || [],
    limit: query.limit,
    userId: req.auth.userId,
    roles,
    branchIds,
    allBranches: privileged && branchIds.length === 0,
    includeRestricted: privileged,
  })

  await recordRequestAudit(req, {
    action: 'search.query',
    resourceType: 'SearchDocument',
    resourceId: 'query',
    metadata: {
      queryLength: query.q.length,
      typeCount: (query.types || []).length,
    },
  })
  return res.json(results)
})
