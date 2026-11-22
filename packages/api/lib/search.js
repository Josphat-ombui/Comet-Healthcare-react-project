// Phase 5 search index and permission-aware full-text search.
//
// PostgreSQL FTS runs over tenant-scoped SearchDocument rows. Visibility is
// enforced twice: in bound SQL parameters and again with the pure projection
// helper below. No caller string is ever concatenated into SQL.

import { db, getTenantContext } from './tenant.js'
import { emitEvent } from './events.js'
import { HttpError } from './util.js'
import { DEFAULT_COMPANY_ID } from '../../shared/src/constants.js'

function tenantId() {
  const ctx = getTenantContext() || {}
  return ctx.companyId || DEFAULT_COMPANY_ID
}

function isPrivileged(roles) {
  const list = Array.isArray(roles) ? roles : []
  return list.includes('ADMIN') || list.includes('COMPLIANCE')
}

/**
 * Pure ACL check for one search projection.
 * - RESTRICTED is visible only when the caller supplied includeRestricted.
 * - NULL branchId is org-wide; a branch row needs branch membership unless the
 *   caller is ADMIN/COMPLIANCE with no branch scope (or passes allBranches).
 * - A document is visible when both allow lists are empty/null (org-wide), or
 *   the user ID matches, or one of the caller's roles matches. Privileged
 *   roles still obey the document's explicit allow lists.
 */
export function canSeeProjection(row, {
  userId = null,
  roles = [],
  branchIds = [],
  includeRestricted = false,
  allBranches = false,
} = {}) {
  if (!row) return false
  if (row.classification === 'RESTRICTED' && !includeRestricted) return false

  const roleList = Array.isArray(roles) ? roles : []
  const branchList = Array.isArray(branchIds) ? branchIds : []
  const unrestrictedBranches = Boolean(
    allBranches || (isPrivileged(roleList) && branchList.length === 0)
  )
  if (row.branchId && !unrestrictedBranches && !branchList.includes(row.branchId)) return false

  const users = Array.isArray(row.allowedUserIds) ? row.allowedUserIds.filter(Boolean) : []
  const roleCodes = Array.isArray(row.allowedRoleCodes) ? row.allowedRoleCodes.filter(Boolean) : []
  if (!users.length && !roleCodes.length) return true
  if (userId && users.includes(userId)) return true
  return roleCodes.some((code) => roleList.includes(code))
}

function toSearchDto(row) {
  return {
    id: row.id,
    entityType: row.entityType,
    entityId: row.entityId,
    title: row.title,
    summary: row.summary ?? null,
    classification: row.classification,
    branchId: row.branchId ?? null,
    updatedAt: row.updatedAt ?? null,
  }
}

/** Upsert a search projection using the tenant compound key. Callers pass
 *  metadata only — object keys, secrets and bodies must never be indexed. */
export async function indexEntity({
  entityType,
  entityId,
  title,
  summary = null,
  classification = 'INTERNAL',
  branchId = null,
  allowedUserIds = null,
  allowedRoleCodes = null,
}) {
  if (!entityType || !entityId) throw new HttpError(400, 'entityType and entityId are required')
  const companyId = tenantId()
  const data = {
    title,
    summary: summary || null,
    classification,
    branchId: branchId || null,
    allowedUserIds: allowedUserIds ?? null,
    allowedRoleCodes: allowedRoleCodes ?? null,
  }
  const row = await db.searchDocument.upsert({
    where: { companyId_entityType_entityId: { companyId, entityType, entityId } },
    update: data,
    create: { companyId, entityType, entityId, ...data },
  })
  await emitEvent('SearchIndexUpdated', {
    entityType,
    entityId,
    classification,
  }, {
    aggregateType: 'SearchDocument',
    aggregateId: row.id,
  })
  return toSearchDto(row)
}

/**
 * Full-text search with bound parameters only. The tenant filter is explicit
 * in addition to RLS, and the SQL mirrors canSeeProjection exactly.
 */
export async function search({
  query = '',
  userId = null,
  roles = [],
  branchIds = [],
  limit = 30,
  types = [],
  allBranches = false,
  includeRestricted = false,
} = {}) {
  const q = String(query || '').trim().slice(0, 200)
  const roleList = Array.isArray(roles) ? roles : []
  const branchList = Array.isArray(branchIds) ? branchIds : []
  const typeList = Array.isArray(types) ? types : []
  const parsedLimit = Number(limit)
  const take = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(Math.floor(parsedLimit), 100)
    : 30
  const privileged = isPrivileged(roleList)
  const unrestrictedBranches = Boolean(allBranches || (privileged && branchList.length === 0))
  const allowRestricted = Boolean(includeRestricted && privileged)

  const rows = await db.$queryRaw`
    SELECT
      d."id", d."entityType", d."entityId", d."title", d."summary",
      d."classification", d."branchId", d."updatedAt",
      ts_rank(
        to_tsvector('simple', coalesce(d."title", '') || ' ' || coalesce(d."summary", '')),
        plainto_tsquery('simple', ${q})
      ) AS "rank",
      COUNT(*) OVER()::int AS "total"
    FROM "SearchDocument" d
    WHERE d."companyId" = current_setting('app.company_id', true)
      AND (
        ${q} = ''
        OR to_tsvector('simple', coalesce(d."title", '') || ' ' || coalesce(d."summary", ''))
             @@ plainto_tsquery('simple', ${q})
      )
      AND (cardinality(${typeList}::text[]) = 0 OR d."entityType" = ANY(${typeList}::text[]))
      AND (
        d."branchId" IS NULL
        OR ${unrestrictedBranches}::boolean
        OR d."branchId" = ANY(${branchList}::text[])
      )
      AND (d."classification"::text <> 'RESTRICTED' OR ${allowRestricted}::boolean)
      AND (
        (
          jsonb_array_length(coalesce(d."allowedUserIds", '[]'::jsonb)) = 0
          AND jsonb_array_length(coalesce(d."allowedRoleCodes", '[]'::jsonb)) = 0
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(coalesce(d."allowedUserIds", '[]'::jsonb)) AS au(value)
          WHERE au.value = ${userId || ''}
        )
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(coalesce(d."allowedRoleCodes", '[]'::jsonb)) AS ar(value)
          WHERE ar.value = ANY(${roleList}::text[])
        )
      )
    ORDER BY "rank" DESC, d."updatedAt" DESC, d."id" ASC
    LIMIT ${take}
  `

  // Defence in depth: re-check the pure projection rule in case the index has
  // a malformed JSON shape that PostgreSQL silently coerced.
  const visible = rows.filter((row) => canSeeProjection(row, {
    userId,
    roles: roleList,
    branchIds: branchList,
    allBranches: unrestrictedBranches,
    includeRestricted: allowRestricted,
  }))
  return {
    items: visible.map((row) => ({ ...toSearchDto(row), score: Number(row.rank) || 0 })),
    total: visible.length === rows.length ? Number(rows[0]?.total || 0) : visible.length,
  }
}

export async function indexDocument(doc) {
  return indexEntity({
    entityType: 'DOCUMENT',
    entityId: doc.id,
    title: doc.title,
    summary: doc.summary ?? null,
    classification: doc.classification || 'INTERNAL',
    branchId: doc.branchId || null,
    allowedUserIds: doc.allowedUserIds ?? null,
    allowedRoleCodes: doc.allowedRoleCodes ?? null,
  })
}

/** Only the file name and MIME metadata are indexed — never objectKey. */
export async function indexFile(file) {
  return indexEntity({
    entityType: 'FILE',
    entityId: file.id,
    title: file.name,
    summary: file.mimeType || null,
    classification: file.classification || 'INTERNAL',
    branchId: file.branchId || null,
    allowedUserIds: file.allowedUserIds ?? null,
    allowedRoleCodes: file.allowedRoleCodes ?? null,
  })
}

export async function indexUser(user) {
  return indexEntity({
    entityType: 'USER',
    entityId: user.id,
    title: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.id,
    summary: null,
    classification: user.classification || 'INTERNAL',
    branchId: user.branchId || null,
    allowedUserIds: user.allowedUserIds ?? null,
    allowedRoleCodes: user.allowedRoleCodes ?? null,
  })
}
