// Phase 5 file objects.
//
// Routes validate and authorise; this module applies the tenant/branch access
// rules, object-storage policy and ID-only event contracts. No public DTO ever
// contains an object key, checksum or company identifier.

import crypto from 'node:crypto'
import { config } from './config.js'
import { db, withTenant } from './tenant.js'
import { emitEvent } from './events.js'
import { enqueueJob } from './queues.js'
import { HttpError } from './util.js'
import {
  assertSafeKey,
  deleteObject,
  getObject,
  newObjectKey,
  presignUpload,
  putObject,
  storageMode,
  verifyLocalToken,
  verifyMagicNumber,
} from './object-storage.js'

const PRIVILEGED_ROLES = new Set(['ADMIN', 'COMPLIANCE'])
const SCAN_STATUSES = new Set(['PENDING', 'CLEAN', 'INFECTED', 'QUARANTINED'])

function rolesOf(actor) {
  if (Array.isArray(actor?.roles) && actor.roles.length) return actor.roles
  return actor?.role ? [actor.role] : []
}

function isPrivileged(actor) {
  return rolesOf(actor).some((role) => PRIVILEGED_ROLES.has(role))
}

function branchIdsOf(actor) {
  return (actor?.branchIds || (actor?.branchId ? [actor.branchId] : [])).filter(Boolean)
}

function principalOf(actor) {
  if (!actor?.userId || !actor?.companyId) throw new HttpError(401, 'Authentication required')
  return {
    userId: actor.userId,
    companyId: actor.companyId,
    branchId: actor.branchId || null,
    branchIds: branchIdsOf(actor),
    roles: rolesOf(actor),
    correlationId: actor.correlationId || null,
  }
}

function scopeFor(actor, companyId) {
  return {
    companyId: companyId || actor?.companyId || null,
    // An empty branch value disables the RLS branch predicate so ADMIN and
    // COMPLIANCE can honour canReadFile across branches.
    branchId: isPrivileged(actor) ? '' : (actor?.branchId || ''),
    actorId: actor?.userId || null,
    correlationId: actor?.correlationId || null,
  }
}

/** Owner, ADMIN, COMPLIANCE or a member of the file's branch may read. */
export function canReadFile(file, actor) {
  if (!file || file.deletedAt) return false
  if (!actor?.userId) return false
  if (isPrivileged(actor)) return true
  if (file.uploadedById === actor.userId) return true
  if (!file.branchId) return false
  return branchIdsOf(actor).includes(file.branchId)
}

function canWriteFile(file, actor) {
  return canReadFile(file, actor) && (file.uploadedById === actor.userId || rolesOf(actor).includes('ADMIN'))
}

/** Public representation. Deliberately omits objectKey/checksum/companyId. */
export function toFileDto(row) {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    classification: row.classification,
    status: row.status,
    version: row.version,
    purpose: row.purpose,
    folder: row.folder ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    uploadedBy: typeof row.uploadedBy === 'string'
      ? row.uploadedBy
      : (row.uploadedById ?? row.uploadedBy?.id ?? null),
  }
}

const UNSAFE_NAME_CHARS = new Set(['"', "'", ';', ':', '*', '?', '<', '>', '|'])

function sanitizeNamePart(part) {
  let out = ''
  for (const char of part) {
    const code = char.codePointAt(0)
    out += (code < 32 || code === 127 || UNSAFE_NAME_CHARS.has(char)) ? '_' : char
  }
  return out
}

/** Sanitise a name for Content-Disposition without changing its extension. */
export function safeFileName(name, mimeType, fallback = 'download') {
  const safe = String(name || '')
    .split(/[\\/]+/)
    .filter((part) => part && part !== '.' && part !== '..')
    .map(sanitizeNamePart)
    .join('_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180)
  if (safe) return safe
  return mimeType === 'application/pdf' ? 'document.pdf' : fallback
}

/** Stable, path-safe download name for a generated business document. */
export function documentDownloadName(number, mimeType) {
  const safe = safeFileName(number, mimeType, 'document')
  return /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`
}

async function ensureVersionRecord(file, checksum, client = db) {
  return client.fileVersion.upsert({
    where: { fileId_version: { fileId: file.id, version: file.version } },
    create: {
      companyId: file.companyId,
      fileId: file.id,
      version: file.version,
      objectKey: file.objectKey,
      size: file.size,
      checksum: checksum || file.checksum || null,
      createdById: file.uploadedById,
    },
    update: {
      objectKey: file.objectKey,
      size: file.size,
      checksum: checksum || file.checksum || null,
    },
  })
}

// --------------------------------------------------------------- uploads

export async function requestUpload(input, actor) {
  const p = principalOf(actor)
  const companyId = p.companyId
  const branchId = p.branchId || input.branchId || null
  if (input.branchId && !isPrivileged(p) && !branchIdsOf(p).includes(input.branchId)) {
    throw new HttpError(403, 'You cannot upload to this branch')
  }
  const purpose = input.purpose || 'GENERAL'
  const objectKey = assertSafeKey(newObjectKey(companyId, input.name, purpose === 'DOCUMENT' ? 'documents' : 'files'))

  const file = await withTenant({ ...scopeFor(p), branchId: branchId || '' }, () => db.fileObject.create({
    data: {
      companyId,
      branchId,
      uploadedById: p.userId,
      name: input.name,
      objectKey,
      mimeType: input.mimeType,
      size: input.size,
      checksum: input.checksum || null,
      classification: input.classification || 'INTERNAL',
      status: 'PENDING',
      storageProvider: storageMode(),
      version: 1,
      folder: input.folder || null,
      purpose,
    },
  }))

  await withTenant({ ...scopeFor(p), branchId: branchId || '' }, () => emitEvent('FileUploaded', {
    fileId: file.id,
    uploadedById: p.userId,
    classification: file.classification,
    size: file.size,
    entityType: 'FILE',
    entityId: file.id,
  }, {
    companyId,
    branchId,
    actorId: p.userId,
    aggregateType: 'File',
    aggregateId: file.id,
    correlationId: p.correlationId,
  }))

  return { file: toFileDto(file), upload: presignUpload(objectKey) }
}

export async function getFileRecordForUser(id, actor) {
  const p = principalOf(actor)
  const file = await withTenant(scopeFor(p), () => db.fileObject.findFirst({
    where: { id, companyId: p.companyId, deletedAt: null },
  }))
  if (!file) throw new HttpError(404, 'File not found')
  if (!canReadFile(file, p)) throw new HttpError(403, 'You do not have access to this file')
  return file
}

export async function getFileForUser(id, actor) {
  return toFileDto(await getFileRecordForUser(id, actor))
}

export async function listFiles(query = {}, actor) {
  const p = principalOf(actor)
  const where = {
    companyId: p.companyId,
    deletedAt: null,
    ...(query.purpose ? { purpose: query.purpose } : {}),
    ...(query.status ? { status: query.status } : {}),
  }
  if (!isPrivileged(p)) {
    const branches = branchIdsOf(p)
    where.OR = [
      { uploadedById: p.userId },
      ...(branches.length ? [{ branchId: { in: branches } }] : []),
    ]
  }
  const rows = await withTenant(scopeFor(p), () => db.fileObject.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: query.limit || 50,
  }))
  return rows.map(toFileDto)
}

export async function confirmUpload(id, input, actor) {
  const p = principalOf(actor)
  const file = await getFileRecordForUser(id, p)
  if (!canWriteFile(file, p)) {
    throw new HttpError(403, 'Only the uploader or an administrator can confirm this upload')
  }
  if (file.status !== 'PENDING') throw new HttpError(409, 'This upload has already been confirmed')

  const checksum = input.checksum || file.checksum || null
  const size = input.size || file.size
  if (storageMode() === 'LOCAL') {
    const bytes = await getObject(file.objectKey)
    if (bytes.length !== size) throw new HttpError(422, 'Uploaded size does not match the declared size')
    if (checksum && crypto.createHash('sha256').update(bytes).digest('hex') !== checksum) {
      throw new HttpError(422, 'Uploaded checksum does not match')
    }
  }

  const status = SCAN_STATUSES.has(input.status) ? input.status : 'PENDING'
  const updated = await withTenant(scopeFor(p), () => db.fileObject.update({
    where: { id: file.id },
    data: { checksum, size, status },
  }))

  // New versions become part of the history as soon as the object is present;
  // the initial version is recorded by scanFile once the scan is clean.
  if (file.version > 1) {
    await withTenant(scopeFor(p), () => ensureVersionRecord(updated, checksum))
  }

  await enqueueJob('files.scan', {
    fileId: file.id,
    companyId: file.companyId,
    objectKey: file.objectKey,
  })

  return toFileDto(updated)
}

/** Worker-callable scan result. Pass a Prisma client via options.client. */
export async function scanFile(fileId, result = {}, options = {}) {
  const status = SCAN_STATUSES.has(result.status) ? result.status : 'INFECTED'
  const override = options.client || options.prisma || (options.fileObject ? options : null)
  const client = override || db
  const file = await client.fileObject.findUnique({ where: { id: fileId } })
  if (!file) throw new HttpError(404, 'File not found')

  const checksum = result.checksum || file.checksum || null
  const updated = await client.fileObject.update({
    where: { id: fileId },
    data: {
      status,
      checksum,
      ...(result.detectedMime ? { mimeType: result.detectedMime } : {}),
    },
  })
  if (status === 'CLEAN') await ensureVersionRecord(updated, checksum, client)

  await emitEvent('FileScanned', {
    fileId,
    status,
    classification: file.classification,
    uploadedById: file.uploadedById,
    entityType: 'FILE',
    entityId: fileId,
  }, {
    ...(override ? { client: override } : {}),
    companyId: file.companyId,
    branchId: file.branchId,
    actorId: file.uploadedById,
    aggregateType: 'File',
    aggregateId: fileId,
  })

  return toFileDto(updated)
}

export async function createNewVersion(fileId, input, actor) {
  const p = principalOf(actor)
  const existing = await getFileRecordForUser(fileId, p)
  if (!canWriteFile(existing, p)) {
    throw new HttpError(403, 'Only the uploader or an administrator can add a version')
  }
  const purpose = input.purpose || existing.purpose
  const version = existing.version + 1
  const objectKey = assertSafeKey(newObjectKey(
    p.companyId,
    input.name || existing.name,
    purpose === 'DOCUMENT' ? 'documents' : 'files'
  ))

  const file = await withTenant(scopeFor(p), () => db.fileObject.update({
    where: { id: fileId },
    data: {
      objectKey,
      name: input.name || existing.name,
      mimeType: input.mimeType || existing.mimeType,
      size: input.size,
      checksum: null,
      classification: input.classification || existing.classification,
      status: 'PENDING',
      folder: input.folder ?? existing.folder,
      purpose,
      version,
      branchId: existing.branchId || p.branchId || input.branchId || null,
    },
  }))

  await withTenant(scopeFor(p), () => emitEvent('FileUploaded', {
    fileId: file.id,
    uploadedById: p.userId,
    classification: file.classification,
    size: file.size,
    entityType: 'FILE',
    entityId: file.id,
  }, {
    companyId: p.companyId,
    branchId: file.branchId,
    actorId: p.userId,
    aggregateType: 'File',
    aggregateId: file.id,
    correlationId: p.correlationId,
  }))

  return { file: toFileDto(file), upload: presignUpload(objectKey) }
}

export async function deleteFile(id, actor) {
  const p = principalOf(actor)
  const file = await withTenant(scopeFor(p), () => db.fileObject.findFirst({
    where: { id, companyId: p.companyId, deletedAt: null },
  }))
  if (!file) throw new HttpError(404, 'File not found')
  if (file.uploadedById !== p.userId && !rolesOf(p).includes('ADMIN')) {
    throw new HttpError(403, 'Only the uploader or an administrator can delete this file')
  }

  const updated = await withTenant(scopeFor(p), () => db.fileObject.update({
    where: { id },
    data: { deletedAt: new Date() },
  }))
  try {
    await deleteObject(file.objectKey)
  } catch (error) {
    // The row is already soft-deleted; never fail the request on cleanup.
    console.error(`Object cleanup failed for file ${file.id}:`, error.message)
  }
  return toFileDto(updated)
}

// ------------------------------------------------------- local object URLs

export async function localUpload(token, buffer, actor) {
  const payload = verifyLocalToken(token, 'upload')
  if (!payload) throw new HttpError(400, 'Invalid or expired upload token')
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(400, 'No file content received')
  if (buffer.length > config.objects.maxUploadBytes) throw new HttpError(413, 'File is too large')

  const file = await withTenant(scopeFor(actor, payload.companyId), () => db.fileObject.findFirst({
    where: {
      objectKey: payload.key,
      ...(payload.companyId ? { companyId: payload.companyId } : {}),
      deletedAt: null,
    },
  }))
  if (!file) throw new HttpError(404, 'File not found')
  if (actor?.companyId && file.companyId !== actor.companyId) {
    throw new HttpError(403, 'File belongs to a different tenant')
  }
  if (payload.companyId && actor?.companyId && payload.companyId !== actor.companyId) {
    throw new HttpError(403, 'Token belongs to a different tenant')
  }
  if (actor?.userId && file.uploadedById !== actor.userId && !rolesOf(actor).includes('ADMIN')) {
    throw new HttpError(403, 'Only the uploader or an administrator can write this object')
  }
  if (file.status !== 'PENDING') throw new HttpError(409, 'This upload has already been confirmed')

  const magic = verifyMagicNumber(buffer, file.mimeType)
  if (!magic.ok) throw new HttpError(415, magic.reason || 'File type is not allowed')
  await putObject(file.objectKey, buffer, file.mimeType)
  return toFileDto(file)
}

export async function localDownload(token, actor) {
  const payload = verifyLocalToken(token, 'download')
  if (!payload) throw new HttpError(400, 'Invalid or expired download token')

  const file = await withTenant(scopeFor(actor, payload.companyId), () => db.fileObject.findFirst({
    where: {
      objectKey: payload.key,
      ...(payload.companyId ? { companyId: payload.companyId } : {}),
      deletedAt: null,
    },
  }))
  if (!file) throw new HttpError(404, 'File not found')
  if (actor?.companyId && file.companyId !== actor.companyId) {
    throw new HttpError(403, 'File belongs to a different tenant')
  }
  if (actor?.userId && !canReadFile(file, actor)) {
    throw new HttpError(403, 'You do not have access to this file')
  }

  const buffer = await getObject(file.objectKey)
  return { buffer, mimeType: file.mimeType, name: safeFileName(file.name, file.mimeType) }
}
