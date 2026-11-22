// Public auth endpoints: register, login, who-am-I, password reset.

import { Router } from 'express'
import { prisma } from '../lib/prisma.js'
import { hashPassword, verifyPassword, signToken, requireAuth, createResetToken, sha256, toPublicUser } from '../lib/auth.js'
import { registerSchema, loginSchema, resetRequestSchema, resetPasswordSchema } from '../lib/validation.js'
import { config } from '../lib/config.js'
import { sendMail } from '../lib/mailer.js'

export const authRouter = Router()

function signInResponse(user) {
  return { token: signToken(user), user: toPublicUser(user) }
}

authRouter.post('/register', async (req, res) => {
  const body = registerSchema.parse(req.body)
  const existing = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' })
  }
  const passwordHash = await hashPassword(body.password)
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      passwordHash,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone || null,
      company: body.company || null,
      role: 'PATIENT',
    },
  })
  return res.status(201).json(signInResponse(user))
})

authRouter.post('/login', async (req, res) => {
  const body = loginSchema.parse(req.body)
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
  // Same response for "no such user" and "wrong password" to avoid email enumeration.
  const ok = user ? await verifyPassword(body.password, user.passwordHash) : false
  if (!user || !ok) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  return res.json(signInResponse(user))
})

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.auth.userId } })
  if (!user) return res.status(401).json({ error: 'Account not found' })
  return res.json({ user: toPublicUser(user) })
})

authRouter.post('/forgot-password', async (req, res) => {
  const body = resetRequestSchema.parse(req.body)
  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } })
  // Always respond the same, regardless of whether the email exists.
  if (user) {
    const { raw, hash, expiresAt } = createResetToken()
    await prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: hash, resetTokenExp: expiresAt },
    })
    // If SMTP is unset this just prints the link (dev mail mode).
    await sendMail({
      to: user.email,
      subject: 'Reset your Comet Healthcare password',
      text: `Hi ${user.firstName},\n\nWe received a request to reset your password.\nOpen the link below to choose a new one (valid for ${Math.round(config.resetTokenTtlSeconds / 3600)} hours):\n\n${config.appUrl}/reset-password?token=${raw}\n\nIf you did not request this, you can safely ignore this email.`,
    })
  }
  return res.json({ message: 'If that email is registered, a reset link has been sent.' })
})

authRouter.post('/reset-password', async (req, res) => {
  const body = resetPasswordSchema.parse(req.body)
  const user = await prisma.user.findFirst({
    where: { resetTokenHash: sha256(body.token) },
  })
  if (!user || !user.resetTokenExp || user.resetTokenExp < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' })
  }
  const passwordHash = await hashPassword(body.password)
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetTokenHash: null, resetTokenExp: null },
  })
  return res.json({ message: 'Password updated. You can now sign in.' })
})