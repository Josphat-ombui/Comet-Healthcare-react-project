// Public content endpoints — testimonials + the CMS-driven site content.
// The whole marketing surface (text + photos) is served from here, so site
// text rendered by every page reflects what the admin saves via /api/admin.

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { getSiteContent } from '../lib/content.js'
import { listMedia } from '../lib/media.js'

export const contentRouter = Router()

// GET /api/testimonials — only approved testimonials, newest first.
contentRouter.get('/testimonials', async (_req, res) => {
  const items = await prisma.testimonial.findMany({
    where: { approved: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, name: true, role: true, quote: true, rating: true },
  })
  return res.json({ items })
})

// GET /api/content/site — full resolved site content (defaults + edits).
contentRouter.get('/site', async (_req, res) => {
  const site = await getSiteContent(prisma)
  return res.json({ site })
})

// GET /api/content/media — photo library (pool for hero/product sliders).
contentRouter.get('/media', async (_req, res) => {
  return res.json({ items: listMedia() })
})