// File-object HTTP surface. Validates and audits at the edge; storage, access
// rules and ID-only events live in lib/files.js. Capability-token routes are
// registered before the `/:id` routes so they cannot be shadowed.

import express, { Router } from 'express'
import { config } from '../lib/config.js'
import { optionalAuth, requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import { presignDownload } from '../lib/object-storage.js'
import {
  createNewVersion,
  confirmUpload,
  deleteFile,
  getFileForUser,
  getFileRecordForUser,
  listFiles,
  localDownload,
  localUpload,
  requestUpload,
  safeFileName,
} from '../lib/files.js'
import { HttpError } from '../lib/util.js'
import { fileConfirmSchema, fileListQuerySchema, fileUploadRequestSchema } from '../lib/validation.js'

export const filesRouter = Router()

function actor(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    branchIds: req.auth.branchIds,
    roles: req.auth.roles,
    role: req.auth.role,
    correlationId: req.correlationId,
  }
}

function audit(req, action, resourceId, metadata = {}) {
  return recordRequestAudit(req, { action, resourceType: 'File', resourceId, metadata })
}

// ------------------------------------------------ local signed-URL endpoints

filesRouter.post(
  '/local-upload/:token',
  optionalAuth,
  express.raw({ type: '*/*', limit: config.objects.maxUploadBytes }),
  async (req, res) => {
    const file = await localUpload(req.params.token, req.body, req.auth)
    return res.json({ file })
  }
)

filesRouter.get('/local-download/:token', optionalAuth, async (req, res) => {
  if (!req.auth?.userId) throw new HttpError(401, 'Authentication required')
  const download = await localDownload(req.params.token, req.auth)
  const name = safeFileName(download.name, download.mimeType)
  res.setHeader('Content-Type', download.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
  res.setHeader('Cache-Control', 'no-store')
  return res.send(download.buffer)
})

// ----------------------------------------------------------- authenticated

filesRouter.post('/uploads', requireAuth, requirePermission('files.object.write'), async (req, res) => {
  const body = fileUploadRequestSchema.parse(req.body)
  const result = await requestUpload(body, actor(req))
  await audit(req, 'file.upload_requested', result.file.id, {
    purpose: result.file.purpose,
    classification: result.file.classification,
  })
  return res.status(201).json(result)
})

filesRouter.post('/uploads/:id/confirm', requireAuth, requirePermission('files.object.write'), async (req, res) => {
  const body = fileConfirmSchema.parse(req.body)
  const file = await confirmUpload(req.params.id, body, actor(req))
  await audit(req, 'file.upload_confirmed', file.id, { classification: file.classification })
  return res.json({ file })
})

filesRouter.get('/', requireAuth, requirePermission('files.object.read'), async (req, res) => {
  const query = fileListQuerySchema.parse(req.query)
  return res.json({ files: await listFiles(query, actor(req)) })
})

filesRouter.get('/:id/download', requireAuth, requirePermission('files.object.read'), async (req, res) => {
  const file = await getFileRecordForUser(req.params.id, actor(req))
  const download = presignDownload(file.objectKey)
  await audit(req, 'file.download_requested', file.id)
  return res.json({ download, url: download.url })
})

filesRouter.get('/:id', requireAuth, requirePermission('files.object.read'), async (req, res) => {
  return res.json({ file: await getFileForUser(req.params.id, actor(req)) })
})

filesRouter.post('/:id/versions', requireAuth, requirePermission('files.object.write'), async (req, res) => {
  const body = fileUploadRequestSchema.parse(req.body)
  const result = await createNewVersion(req.params.id, body, actor(req))
  await audit(req, 'file.version_requested', result.file.id, { version: result.file.version })
  return res.status(201).json(result)
})

filesRouter.delete('/:id', requireAuth, requirePermission('files.object.delete'), async (req, res) => {
  const file = await deleteFile(req.params.id, actor(req))
  await audit(req, 'file.deleted', file.id)
  return res.json({ file })
})
