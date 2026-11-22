// Admin endpoints — everything here is ADMIN-only (see index.js mounting).
// Gives the admin shell a real read/manage surface for appointments, inquiries
// and a stats overview.

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireRole } from '../lib/auth.js'
import { appointmentStatusSchema, inquiryStatusSchema, documentGenerateSchema, documentPatchSchema, companyProfileSchema, siteContentSchema } from '../lib/validation.js'
import { addDays, localIsoDay } from '../lib/slots.js'
import { DOCUMENT_KINDS, getCompanyProfile, upsertCompanyProfile, nextDocumentNumber, computeLine, computeTotals, toPublicDocument } from '../lib/documents.js'
import { DEFAULT_SITE_CONTENT, getSiteContent, setSiteContent } from '../lib/content.js'
import { listMedia, saveMedia, deleteMedia, ALLOWED_MIME } from '../lib/media.js'
import { DEFAULT_MEDIA } from '../../web/src/lib/media.js'
import express from 'express'

// Factory photos are committed source files referenced by the CMS defaults.
// Collect their URLs once so they can never be deleted from the media library
// (which would leave the site broken after a Content Studio reset).
function collectGalleryUrls(value, out = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith('/images/gallery/')) out.add(value)
  } else if (Array.isArray(value)) {
    for (const item of value) collectGalleryUrls(item, out)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectGalleryUrls(item, out)
  }
  return out
}
const FACTORY_MEDIA_URLS = collectGalleryUrls({ site: DEFAULT_SITE_CONTENT, media: DEFAULT_MEDIA })

export const adminRouter = Router()
adminRouter.use(requireRole('ADMIN'))

// GET /api/admin/stats
adminRouter.get('/stats', async (_req, res) => {
  const [appointments, inquiries, users, providers, documents] = await Promise.all([
    prisma.appointment.count(),
    prisma.inquiry.count(),
    prisma.user.count(),
    prisma.provider.count({ where: { active: true } }),
    prisma.businessDocument.count(),
  ])
  const [byStatus, byInquiryStatus, upcoming] = await Promise.all([
    prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.inquiry.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.appointment.findMany({
      where: { status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 5,
      select: { id: true, code: true, date: true, startTime: true, patientName: true },
    }),
  ])
  const [docsByStatus, docsByKind] = await Promise.all([
    prisma.businessDocument.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.businessDocument.groupBy({ by: ['kind'], _count: { _all: true } }),
  ])
  const appointmentsByStatus = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all]))
  const inquiriesByStatus = Object.fromEntries(byInquiryStatus.map((r) => [r.status, r._count._all]))
  const documentsByStatus = Object.fromEntries(docsByStatus.map((r) => [r.status, r._count._all]))
  const documentsByKind = Object.fromEntries(docsByKind.map((r) => [r.kind, r._count._all]))

  return res.json({
    totals: { appointments, inquiries, users, providers, documents },
    appointmentsByStatus,
    inquiriesByStatus,
    documentsByStatus,
    documentsByKind,
    upcoming,
  })
})

// GET /api/admin/appointments?status=&q=&page=&pageSize=
adminRouter.get('/appointments', async (req, res) => {
  const { status = '', q = '' } = req.query
  const where = {}
  if (status) where.status = status
  if (q && String(q).trim()) {
    const term = String(q).trim()
    where.OR = [
      { patientName: { contains: term } },
      { patientEmail: { contains: term } },
      { code: { contains: term } },
      { company: { contains: term } },
    ]
  }
  const items = await prisma.appointment.findMany({
    where,
    orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
    take: 100,
    include: { provider: { select: { id: true, name: true, title: true, specialty: true } } },
  })
  return res.json({ items })
})

// PATCH /api/admin/appointments/:id — set status (CONFIRM / COMPLETE / CANCEL)
adminRouter.patch('/appointments/:id', async (req, res) => {
  const { status } = appointmentStatusSchema.parse(req.body)
  const existing = await prisma.appointment.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Booking not found' })
  const item = await prisma.appointment.update({
    where: { id: existing.id },
    data: { status },
    include: { provider: { select: { id: true, name: true, title: true, specialty: true } } },
  })
  return res.json({ item })
})

// GET /api/admin/inquiries?status=&q=
adminRouter.get('/inquiries', async (req, res) => {
  const { status = '', q = '' } = req.query
  const where = {}
  if (status) where.status = status
  if (q && String(q).trim()) {
    const term = String(q).trim()
    where.OR = [
      { name: { contains: term } },
      { email: { contains: term } },
      { company: { contains: term } },
      { subject: { contains: term } },
    ]
  }
  const items = await prisma.inquiry.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
  })
  return res.json({ items })
})

// GET /api/admin/users?role=
adminRouter.get('/users', async (req, res) => {
  const { role = '' } = req.query
  const where = role ? { role } : {}
  const items = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, email: true, firstName: true, lastName: true,
      company: true, role: true, createdAt: true,
    },
  })
  return res.json({ items })
})

// PATCH /api/admin/inquiries/:id
adminRouter.patch('/inquiries/:id', async (req, res) => {
  const { status } = inquiryStatusSchema.parse(req.body)
  const existing = await prisma.inquiry.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Inquiry not found' })
  const item = await prisma.inquiry.update({ where: { id: existing.id }, data: { status } })
  return res.json({ item })
})

// ---------------------------------------------------------------- documents

// GET /api/admin/documents?kind=&status=&q=
adminRouter.get('/documents', async (req, res) => {
  const { kind = '', status = '', q = '' } = req.query
  const where = {}
  if (kind) where.kind = kind
  if (status) where.status = status
  if (q && String(q).trim()) {
    const term = String(q).trim()
    where.OR = [
      { number: { contains: term } },
      { title: { contains: term } },
      { clientName: { contains: term } },
      { clientCompany: { contains: term } },
      { clientEmail: { contains: term } },
    ]
  }
  const items = await prisma.businessDocument.findMany({
    where,
    orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  })
  return res.json({ items: items.map(toPublicDocument) })
})

// POST /api/admin/documents — generate a new business document
adminRouter.post('/documents', async (req, res) => {
  const body = documentGenerateSchema.parse(req.body)
  const kindMeta = DOCUMENT_KINDS[body.kind]

  if (kindMeta.financial && (!body.items || body.items.length === 0)) {
    return res.status(400).json({ error: `A ${kindMeta.label} needs at least one line item` })
  }
  if (body.kind === 'COA' && (!body.params || body.params.length === 0)) {
    return res.status(400).json({ error: 'A Certificate of Analysis needs at least one test parameter' })
  }
  if ((body.kind === 'CDMO_SLA' || body.kind === 'NDA') && (!body.clauses || body.clauses.length === 0)) {
    return res.status(400).json({ error: 'An agreement needs at least one clause' })
  }

  const creator = await prisma.user.findUnique({ where: { id: req.auth.userId } })
  const company = await getCompanyProfile()
  const issueDate = body.issueDate || localIsoDay()
  const days = kindMeta.days
  const dueDate = body.dueDate || (days ? addDays(issueDate, days) : null)
  const validUntil = body.validUntil || (body.kind === 'QUOTATION' ? addDays(issueDate, 30) : null)
  const items = (body.items || []).map(computeLine)
  const { subtotal, tax, total } = computeTotals(items, company.taxRate)
  const number = await nextDocumentNumber(body.kind)

  const doc = await prisma.businessDocument.create({
    data: {
      number,
      kind: body.kind,
      title: body.title || kindMeta.defaultTitle,
      status: 'DRAFT',
      currency: company.currency,
      taxRate: company.taxRate,
      issueDate,
      dueDate,
      validUntil,
      clientName: body.clientName,
      clientCompany: body.clientCompany,
      clientEmail: body.clientEmail.toLowerCase(),
      clientPhone: body.clientPhone || null,
      notes: body.notes || null,
      subtotal,
      tax,
      total,
      data: { items, clauses: body.clauses || [], params: body.params || [], productInfo: body.productInfo || null },
      company,
      createdById: creator?.id,
    },
  })

  return res.status(201).json({
    document: toPublicDocument(doc),
    pdfUrl: `/api/documents/${doc.number}/pdf`,
  })
})

// PATCH /api/admin/documents/:id — issue / void / adjust dates
adminRouter.patch('/documents/:id', async (req, res) => {
  const { status, dueDate, validUntil } = documentPatchSchema.parse(req.body)
  const existing = await prisma.businessDocument.findUnique({ where: { id: req.params.id } })
  if (!existing) return res.status(404).json({ error: 'Document not found' })
  const data = {}
  if (status) data.status = status
  if (dueDate !== undefined || validUntil !== undefined) {
    data.dueDate = dueDate || null
    data.validUntil = validUntil || null
  }
  const doc = await prisma.businessDocument.update({
    where: { id: existing.id },
    data,
    include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
  })
  return res.json({ document: toPublicDocument(doc) })
})

// ----------------------------------------------------------- company profile

// GET /api/admin/company — current letterhead / template settings
adminRouter.get('/company', async (_req, res) => {
  const profile = await getCompanyProfile()
  return res.json({ company: profile })
})

// PATCH /api/admin/company — update the letterhead template
adminRouter.patch('/company', async (req, res) => {
  const body = companyProfileSchema.parse(req.body)
  const profile = await upsertCompanyProfile(body)
  return res.json({ company: profile })
})

// ------------------------------------------------------- site content (CMS)

// GET /api/admin/content — the full resolved site content tree.
adminRouter.get('/content', async (_req, res) => {
  const site = await getSiteContent(prisma)
  return res.json({ site })
})

// PUT /api/admin/content — save an edit. Accepts either the whole content
// tree or a partial (`{ site: {...} }` is also accepted); defaults fill gaps.
adminRouter.put('/content', async (req, res) => {
  const body = req.body?.site ?? req.body
  const parsed = siteContentSchema.safeParse(body)
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid content payload',
      details: parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'content'}: ${issue.message}`),
    })
  }
  const site = await setSiteContent(prisma, parsed.data)
  return res.json({ site })
})

// POST /api/admin/content/reset — restore the factory defaults.
adminRouter.post('/content/reset', async (_req, res) => {
  const site = await setSiteContent(prisma, {})
  return res.json({ site })
})

// GET /api/admin/media — the photo library.
adminRouter.get('/media', async (_req, res) => {
  return res.json({ items: listMedia() })
})

// POST /api/admin/media/upload — raw image upload
// (send file bytes with Content-Type image/*, ?name=photo.jpg).
adminRouter.post(
  '/media/upload',
  express.raw({ type: [...ALLOWED_MIME], limit: '25mb' }),
  async (req, res) => {
    const contentType = req.headers['content-type'] || ''
    const allowed = [...ALLOWED_MIME].some((m) => contentType.startsWith(m))
    if (!allowed) return res.status(415).json({ error: 'Only JPG, PNG, WebP or GIF uploads are supported' })
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: 'Empty upload' })
    }
    const ext = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    }[contentType.split(';')[0].trim()]
    const name = String(req.query.name || '')
    const url = saveMedia(req.body, ext, name)
    return res.status(201).json({ url, name: url.split('/').pop(), items: listMedia() })
  }
)

// POST /api/admin/media/delete — { url } removes a photo from the library.
adminRouter.post('/media/delete', async (req, res) => {
  const url = req.body?.url
  if (typeof url !== 'string' || !url.startsWith('/images/gallery/')) {
    return res.status(400).json({ error: 'Invalid media url' })
  }
  if (typeof req.auth?.userId === 'string' && listMedia().some((m) => m.url === url)) {
    // Built-in gallery photos back the factory content and media registry —
    // deleting one would break the defaults and cannot be undone from the UI.
    if (FACTORY_MEDIA_URLS.has(url)) {
      return res.status(409).json({ error: 'This is one of Comet’s built-in photos and cannot be deleted.' })
    }
    // Guard: never delete the last copy of an image still referenced in content.
    const site = await getSiteContent(prisma)
    const used = JSON.stringify(site).includes(url)
    if (used) return res.status(409).json({ error: 'This photo is still used on the site. Remove it from the hero/products first, then delete.' })
  }
  const ok = deleteMedia(url)
  return res.json({ ok, items: listMedia() })
})