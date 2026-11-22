// Client-facing document endpoints (authenticated). Admin management lives in
// admin.routes.js; PDFs are rendered on demand from the stored data + company
// template snapshot, so no binaries are kept in the database.
//
//   GET /api/documents/kinds          -> document kind metadata (for forms)
//   GET /api/documents                -> my documents (admin: all with ?all=1)
//   POST /api/documents/generate       -> queue document generation
//   GET /api/documents/jobs/:id        -> queue job status
//   GET /api/documents/:code/download  -> stored PDF download URL
//   GET /api/documents/:code           -> document metadata
//   GET /api/documents/:code/pdf       -> branded PDF (inline)

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import { db } from '../lib/tenant.js'
import { enqueueJob, getJobStatus } from '../lib/queues.js'
import { presignDownload } from '../lib/object-storage.js'
import { documentGenerateSchema } from '../lib/validation.js'
import { documentDownloadName } from '../lib/files.js'
import { documentKindList, renderBusinessDocumentPdf, toPublicDocument } from '../lib/documents.js'

export const documentsRouter = Router()
documentsRouter.use(requireAuth)

function canView(user, doc) {
  return user.role === 'ADMIN' || doc.clientEmail?.toLowerCase() === user.email.toLowerCase()
}

documentsRouter.get('/kinds', (_req, res) => {
  return res.json({ kinds: documentKindList() })
})

documentsRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
  const admin = user.role === 'ADMIN'
  const rows = await prisma.businessDocument.findMany({
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: 400,
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  })
  const items = rows.filter((d) => admin && req.query.all === '1' || d.clientEmail?.toLowerCase() === user.email.toLowerCase())
  return res.json({ items: items.map(toPublicDocument) })
})

// ------------------------------------------------------- queued generation

documentsRouter.post('/generate', requirePermission('documents.write'), async (req, res) => {
  const payload = documentGenerateSchema.parse(req.body)
  const { id: jobId } = await enqueueJob('documents.generate', {
    payload,
    companyId: req.auth.companyId,
    actorId: req.auth.userId,
    correlationId: req.correlationId,
  })
  // Only the kind is audited — client names/emails stay out of the audit trail.
  await recordRequestAudit(req, {
    action: 'document.generation_requested',
    resourceType: 'Document',
    resourceId: jobId || 'queued',
    metadata: { kind: payload.kind },
  })
  return res.status(202).json({ jobId, status: 'QUEUED' })
})

documentsRouter.get('/jobs/:id', requirePermission('documents.read'), async (req, res) => {
  const job = await getJobStatus('documents.generate', req.params.id)
  if (!job) return res.status(404).json({ error: 'Job not found' })
  // Both forms are returned: the nested `job` is the canonical envelope while
  // the flattened fields keep simple job-status pollers working.
  return res.json({ ...job, job })
})

documentsRouter.get('/:code/download', requirePermission('documents.read'), async (req, res) => {
  const doc = await db.businessDocument.findFirst({
    where: { number: req.params.code, companyId: req.auth.companyId, deletedAt: null },
  })
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  const user = await db.user.findFirst({
    where: { id: req.auth.userId, companyId: req.auth.companyId },
    select: { id: true, email: true, role: true },
  })
  if (!user || !canView(user, doc)) return res.status(403).json({ error: 'You do not have access to this document' })

  const file = await db.fileObject.findFirst({
    where: {
      companyId: req.auth.companyId,
      purpose: 'DOCUMENT',
      name: { startsWith: doc.number },
      deletedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!file) return res.status(409).json({ error: 'Document generation is still queued' })

  const download = presignDownload(file.objectKey)
  await recordRequestAudit(req, {
    action: 'document.download_requested',
    resourceType: 'Document',
    resourceId: doc.id,
  })
  return res.json({
    download,
    url: download.url,
    fileName: documentDownloadName(doc.number, file.mimeType),
  })
})

documentsRouter.get('/:code', async (req, res) => {
  const doc = await prisma.businessDocument.findUnique({
    where: { number: req.params.code },
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  })
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
  if (!canView(user, doc)) return res.status(403).json({ error: 'You do not have access to this document' })
  return res.json({ document: toPublicDocument(doc) })
})

documentsRouter.get('/:code/pdf', async (req, res) => {
  const doc = await prisma.businessDocument.findUnique({ where: { number: req.params.code } })
  if (!doc) return res.status(404).json({ error: 'Document not found' })
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
  if (!canView(user, doc)) return res.status(403).json({ error: 'You do not have access to this document' })
  if (doc.status === 'DRAFT' && user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'This document has not been issued yet' })
  }

  try {
    const pdf = await renderBusinessDocumentPdf(doc)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${doc.number}.pdf"`)
    res.setHeader('Cache-Control', 'no-store')
    return res.send(pdf)
  } catch (err) {
    console.error('PDF render failed:', err)
    return res.status(500).json({ error: 'Could not generate the PDF' })
  }
})