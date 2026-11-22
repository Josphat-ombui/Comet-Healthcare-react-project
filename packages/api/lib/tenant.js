// Tenant context for Phase 3.
//
// A request's company/branch/actor are stored in AsyncLocalStorage. `db` is a
// thin Prisma proxy: every model operation opens a short transaction, applies
// `SET LOCAL` via set_config(..., true), and runs on that transaction client.
// This keeps RLS per-query without holding a connection open for the whole
// HTTP request, which matters with PgBouncer transaction pooling.

import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from './prisma.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

const storage = new AsyncLocalStorage()
const delegateCache = new WeakMap()

export function getTenantContext() {
  return storage.getStore() || null
}

export function runWithTenant(context, callback) {
  const current = storage.getStore() || {}
  const ctx = {
    companyId: context?.companyId || current.companyId || DEFAULT_COMPANY_ID,
    branchId: context?.branchId ?? current.branchId ?? '',
    actorId: context?.actorId ?? current.actorId ?? null,
    correlationId: context?.correlationId ?? current.correlationId ?? null,
  }
  return storage.run(ctx, callback)
}

export function withTenant(context, callback) {
  return runWithTenant(context, callback)
}

async function inScopedTransaction(work) {
  const ctx = storage.getStore()
  if (!ctx) return prisma.$transaction(work)
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${ctx.companyId}, true)`
    await tx.$executeRaw`SELECT set_config('app.branch_id', ${ctx.branchId || ''}, true)`
    return work(tx)
  })
}

function modelDelegate(client, model) {
  return new Proxy(client, {
    get(delegate, method) {
      if (method === 'then') return undefined
      const value = delegate[method]
      if (typeof value !== 'function') return value
      return (...args) => inScopedTransaction((tx) => tx[model][method](...args))
    },
  })
}

// All model delegates and raw queries on `db` are tenant-scoped. Explicit
// transaction and lifecycle helpers stay bound to the underlying client.
export const db = new Proxy(prisma, {
  get(target, prop) {
    if (prop === '$transaction') return target.$transaction.bind(target)
    if (prop === '$connect' || prop === '$disconnect' || prop === '$on' || prop === '$use') {
      return target[prop].bind(target)
    }
    if (typeof prop === 'string' && prop.startsWith('$')) {
      return (...args) => inScopedTransaction((tx) => tx[prop](...args))
    }
    const value = target[prop]
    if (!value || typeof value !== 'object') return value
    if (!delegateCache.has(value)) delegateCache.set(value, modelDelegate(value, prop))
    return delegateCache.get(value)
  },
})

/** Express middleware: adopt the principal resolved from the bearer token. */
export function tenantContextMiddleware(req, _res, next) {
  return runWithTenant(
    {
      companyId: req.auth?.companyId,
      branchId: req.auth?.branchId,
      actorId: req.auth?.userId,
      correlationId: req.correlationId,
    },
    next
  )
}
