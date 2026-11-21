// Client-facing document endpoints (authenticated). Admin management lives in
// admin.routes.js; PDFs are rendered on demand from the stored data + company
// template snapshot, so no binaries are kept in the database.
//
//   GET /api/documents/kinds     -> document kind metadata (for forms)
//   GET /api/documents           -> my documents (admin: all with ?all=1)
//   GET /api/documents/:code     -> document metadata
//   GET /api/documents/:code/pdf -> branded PDF (inline)

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'
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