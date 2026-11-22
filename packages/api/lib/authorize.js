// RBAC + ABAC enforcement. Roles arrive on the access token for the fast path;
// custom roles are checked against the database so admin changes take effect
// without waiting for token expiry.

import { hasPermission } from '../../shared/src/permissions.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'
import { db, withTenant } from './tenant.js'
import { verifyAccessToken } from './session.js'

export async function resolvePrincipal(req, _res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (token) {
    try {
      const payload = verifyAccessToken(token)
      const companyId = payload.companyId || DEFAULT_COMPANY_ID
      const principal = await withTenant({ companyId }, async () => {
        const user = await db.user.findFirst({
          where: { id: payload.sub, companyId, status: 'ACTIVE' },
          select: { id: true, companyId: true, branchId: true, role: true, status: true },
        })
        if (!user) return null
        if (payload.sessionId) {
          const session = await db.session.findFirst({
            where: { id: payload.sessionId, userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
            select: { id: true },
          })
          if (!session) return null
        }
        const assignments = await db.userRole.findMany({
          where: { companyId, userId: user.id },
          select: { role: { select: { code: true } } },
        })
        return { user, roles: assignments.map((a) => a.role.code) }
      })

      if (principal) {
        const roles = principal.roles.length ? principal.roles : [principal.user.role]
        req.auth = {
          userId: principal.user.id,
          companyId,
          branchId: principal.user.branchId || null,
          branchIds: payload.branchIds || (principal.user.branchId ? [principal.user.branchId] : []),
          roles,
          role: roles[0],
          sessionId: payload.sessionId || null,
          correlationId: req.correlationId,
        }
      }
    } catch {
      // Invalid tokens are ignored; protected routes still reject via requireAuth.
    }
  }
  return next()
}

export function requirePermission(...codes) {
  return async (req, res, next) => {
    if (!req.auth) return res.status(401).json({ error: 'Authentication required' })
    const roles = req.auth.roles || (req.auth.role ? [req.auth.role] : [])
    if (codes.some((code) => hasPermission(roles, code))) return next()

    try {
      const granted = await db.permission.findMany({
        where: {
          companyId: req.auth.companyId,
          code: { in: codes },
          roles: { some: { role: { users: { some: { userId: req.auth.userId } } } } },
        },
        select: { code: true },
      })
      if (granted.length) return next()
    } catch (error) {
      return next(error)
    }
    return res.status(403).json({ error: 'You do not have permission to do that' })
  }
}

/** ABAC branch check. Null branchId means organisation-wide data. */
export function canAccessBranch(req, branchId) {
  if (!branchId) return true
  const roles = req.auth?.roles || []
  if (roles.includes('ADMIN') || roles.includes('COMPLIANCE')) return true
  return (req.auth?.branchIds || []).includes(branchId)
}
