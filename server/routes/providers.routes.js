// Expert (provider) directory: list with search/filter, profile, availability.

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { isValidIsoDate, generateSlots } from '../lib/slots.js'
import { getSiteContent } from '../lib/content.js'
import { canonicalizeProvider } from '../../src/lib/experts.js'

export const providerRouter = Router()

function toPublicProvider(p, media) {
  const expert = canonicalizeProvider(p, media)
  return {
    id: expert.id,
    slug: expert.slug,
    name: expert.name,
    title: expert.title,
    specialty: expert.specialty,
    location: expert.location,
    bio: expert.bio,
    image: expert.image,
    photoKey: expert.photoKey || null,
    yearsExperience: expert.yearsExperience,
    rating: Number(expert.rating),
    reviewsCount: expert.reviewsCount,
    email: expert.email,
    phone: expert.phone,
    active: expert.active,
  }
}

async function fetchFilters() {
  const rows = await prisma.provider.findMany({
    where: { active: true },
    select: { specialty: true, location: true },
  })
  const specialties = [...new Set(rows.map((r) => r.specialty).filter(Boolean))].sort()
  const locations = [...new Set(rows.map((r) => r.location).filter(Boolean))].sort()
  return { specialties, locations }
}

// GET /api/providers?q=&specialty=&location=&page=&pageSize=
providerRouter.get('/', async (req, res) => {
  const { q = '', specialty = '', location = '' } = req.query
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(50, Math.max(1, Number.parseInt(req.query.pageSize, 10) || 12))

  const where = { active: true }
  if (specialty) where.specialty = specialty
  if (location) where.location = location
  if (q && String(q).trim()) {
    const term = String(q).trim()
    where.OR = [
      { name: { contains: term } },
      { title: { contains: term } },
      { specialty: { contains: term } },
      { location: { contains: term } },
      { bio: { contains: term } },
    ]
  }

  const [items, total, filters, site] = await Promise.all([
    prisma.provider.findMany({
      where,
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.provider.count({ where }),
    fetchFilters(),
    getSiteContent(prisma),
  ])

  return res.json({
    items: items.map((p) => toPublicProvider(p, site.media)),
    total,
    page,
    pageSize,
    meta: filters,
  })
})

// GET /api/providers/:slug
providerRouter.get('/:slug', async (req, res) => {
  const provider = await prisma.provider.findFirst({
    where: { slug: req.params.slug, active: true },
    include: { schedules: true },
  })
  if (!provider) {
    return res.status(404).json({ error: 'Expert not found' })
  }
  const site = await getSiteContent(prisma)
  return res.json({ provider: toPublicProvider(provider, site.media), schedules: provider.schedules })
})

// GET /api/providers/:slug/slots?date=2026-09-14
providerRouter.get('/:slug/slots', async (req, res) => {
  const { date } = req.query
  if (!isValidIsoDate(date)) {
    return res.status(400).json({ error: 'Provide a valid ?date=YYYY-MM-DD' })
  }
  const provider = await prisma.provider.findFirst({
    where: { slug: req.params.slug, active: true },
    include: {
      schedules: true,
      appointments: { where: { date } },
    },
  })
  if (!provider) {
    return res.status(404).json({ error: 'Expert not found' })
  }

  const weekday = new Date(`${date}T00:00:00`).getDay()
  const schedule = provider.schedules.find((s) => s.dayOfWeek === weekday)
  const slots = schedule
    ? generateSlots({ schedule, date, existing: provider.appointments })
    : []

  return res.json({ date, provider: { id: provider.id, slug: provider.slug, name: provider.name }, slots })
})