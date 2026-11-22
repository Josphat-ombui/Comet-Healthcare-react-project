// Public inquiry endpoint — contact / product catalogue / CDMO partnership leads.

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth } from '../lib/auth.js'
import { inquirySchema } from '../lib/validation.js'
import { notifyStaff, sendMail } from '../lib/mailer.js'

export const inquiryRouter = Router()

// GET /api/inquiries?mine=1 — the signed-in client's own inquiries (matched by email).
inquiryRouter.get('/', requireAuth, async (req, res) => {
  if (req.query.mine === '1' || req.query.mine === 'true') {
    const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
    const items = await prisma.inquiry.findMany({
      where: { email: user?.email ?? '' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    return res.json({ items })
  }
  return res.status(400).json({ error: 'Specify ?mine=1' })
})

// POST /api/inquiries
inquiryRouter.post('/', async (req, res) => {
  const body = inquirySchema.parse(req.body)
  const inquiry = await prisma.inquiry.create({
    data: {
      kind: body.kind,
      name: body.name,
      company: body.company || null,
      email: body.email.toLowerCase(),
      phone: body.phone || null,
      subject: body.subject || null,
      message: body.message,
      status: 'NEW',
    },
  })

  // Acknowledge to the sender, and notify staff inboxes (dev mode prints them).
  await sendMail({
    to: body.email,
    subject: 'We received your inquiry',
    text: `Hi ${body.name},\n\nThank you for reaching out to Comet Healthcare. A member of our team will respond within one business day.\n\nReference: ${inquiry.id}`,
  })
  await notifyStaff(inquiry).catch((err) => {
    console.error('Failed to notify staff about inquiry:', err.message)
  })

  return res.status(201).json({ id: inquiry.id, status: inquiry.status })
})