// Appointment (consultation) booking: create, list mine, cancel, reschedule.

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { requireAuth, optionalAuth } from '../lib/auth.js'
import { bookSchema, rescheduleSchema, cancelSchema } from '../lib/validation.js'
import { generateSlots, timeToMinutes, minutesToTime } from '../lib/slots.js'
import { genBookingCode } from '../lib/util.js'
import { sendMail } from '../lib/mailer.js'

export const appointmentRouter = Router()

function toPublicAppointment(a) {
  return {
    id: a.id,
    code: a.code,
    status: a.status,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    type: a.type,
    notes: a.notes,
    company: a.company ?? null,
    patientName: a.patientName,
    patientEmail: a.patientEmail,
    patientPhone: a.patientPhone ?? null,
    provider: a.provider
      ? {
          id: a.provider.id,
          slug: a.provider.slug,
          name: a.provider.name,
          title: a.provider.title,
          specialty: a.provider.specialty,
          location: a.provider.location,
        }
      : null,
    createdAt: a.createdAt,
  }
}

/** Rebuild { endTime, available } for a proposed slot; returns null if blocked. */
async function assertSlotAvailable(providerId, date, startTime) {
  const provider = await prisma.provider.findFirst({
    where: { id: providerId },
    include: {
      schedules: { where: { dayOfWeek: new Date(`${date}T00:00:00`).getDay() } },
      appointments: { where: { date, status: { in: ['SCHEDULED', 'CONFIRMED'] } } },
    },
  })
  const schedule = provider?.schedules[0]
  if (!provider || !schedule) return null

  const slotLen = schedule.slotMinutes || 30
  const slots = generateSlots({ schedule, date, existing: provider.appointments })
  const match = slots.find((s) => s.start === startTime)
  if (!match || !match.available) return null

  return { endTime: minutesToTime(timeToMinutes(startTime) + slotLen) }
}

// POST /api/appointments — book a consultation. Auth optional; if a client is
// signed in, req.auth (attached by optionalAuth) links the booking to the account.
appointmentRouter.post('/', optionalAuth, async (req, res) => {
  const body = bookSchema.parse(req.body)

  const provider = await prisma.provider.findFirst({
    where: { slug: body.providerSlug, active: true },
  })
  if (!provider) {
    return res.status(404).json({ error: 'Expert not found' })
  }

  const slot = await assertSlotAvailable(provider.id, body.date, body.startTime)
  if (!slot) {
    return res.status(409).json({ error: 'That time has just been taken. Please pick another slot.' })
  }

  const appointment = await prisma.appointment.create({
    data: {
      code: genBookingCode(),
      patientId: req.auth?.userId ?? null,
      patientName: body.patientName,
      patientEmail: body.patientEmail.toLowerCase(),
      patientPhone: body.patientPhone || null,
      company: body.company || null,
      providerId: provider.id,
      date: body.date,
      startTime: body.startTime,
      endTime: slot.endTime,
      type: body.type,
      notes: body.notes || null,
      status: 'SCHEDULED',
    },
    include: { provider: true },
  })

  await sendMail({
    to: body.patientEmail,
    subject: `Consultation confirmed — ${provider.name} (ref ${appointment.code})`,
    text: [
      `Hi ${body.patientName},`,
      '',
      `Your consultation with ${provider.name} (${provider.title}, ${provider.specialty}) is booked.`,
      `Date:    ${body.date}`,
      `Time:    ${appointment.startTime} - ${appointment.endTime} (East Africa Time)`,
      `Ref:     ${appointment.code}`,
      '',
      'Manage or cancel this booking anytime from your Comet Healthcare portal.',
    ].join('\n'),
  })

  return res.status(201).json({ appointment: toPublicAppointment(appointment) })
})

// GET /api/appointments/mine
appointmentRouter.get('/mine', requireAuth, async (req, res) => {
  const items = await prisma.appointment.findMany({
    where: { patientId: req.auth.userId },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    include: { provider: true },
  })
  return res.json({ items: items.map(toPublicAppointment) })
})

// PATCH /api/appointments/:code — cancel or reschedule (owner or admin)
appointmentRouter.patch('/:code', requireAuth, async (req, res) => {
  const appointment = await prisma.appointment.findUnique({
    where: { code: req.params.code },
    include: { provider: true },
  })
  if (!appointment) {
    return res.status(404).json({ error: 'Booking not found' })
  }
  const isOwner = appointment.patientId === req.auth.userId
  const isAdmin = req.auth.role === 'ADMIN'
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'You can only manage your own bookings' })
  }

  // Cancel
  if (req.body?.action === 'cancel') {
    cancelSchema.parse(req.body)
    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: 'CANCELLED' },
      include: { provider: true },
    })
    await sendMail({
      to: appointment.patientEmail,
      subject: `Booking ${appointment.code} cancelled`,
      text: `Hi ${appointment.patientName},\n\nYour consultation with ${appointment.provider.name} on ${appointment.date} at ${appointment.startTime} (ref ${appointment.code}) has been cancelled.\n\nYou can book a new time on our website.`,
    })
    return res.json({ appointment: toPublicAppointment(updated) })
  }

  // Reschedule
  const body = rescheduleSchema.parse(req.body)
  const slot = await assertSlotAvailable(appointment.providerId, body.date, body.startTime)
  if (!slot) {
    return res.status(409).json({ error: 'That time is not available. Please pick another slot.' })
  }
  const updated = await prisma.appointment.update({
    where: { id: appointment.id },
    data: { date: body.date, startTime: body.startTime, endTime: slot.endTime, status: 'SCHEDULED' },
    include: { provider: true },
  })
  await sendMail({
    to: appointment.patientEmail,
    subject: `Booking ${appointment.code} rescheduled`,
    text: [
      `Hi ${appointment.patientName},`,
      '',
      `Your consultation with ${appointment.provider.name} has been moved to:`,
      `Date: ${body.date}`,
      `Time: ${updated.startTime} - ${updated.endTime} (East Africa Time)`,
      `Ref:  ${updated.code}`,
      '',
      'If this no longer works for you, please reschedule or cancel in your portal.',
    ].join('\n'),
  })
  return res.json({ appointment: toPublicAppointment(updated) })
})