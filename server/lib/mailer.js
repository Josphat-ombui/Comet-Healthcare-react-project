// Mailer — Nodemailer wrapper.
//
// CONFIG: if `SMTP_HOST` is set the server sends real mail through that SMTP
// server. If it is empty the server runs in "dev mail" mode: emails are NOT
// delivered and are printed to the console instead (useful during development).
//
// SWAPPING TO A TRANSACTIONAL API (RESEND / SENDGRID):
// Replace the body of `sendMail` below with a call to your provider. For Resend:
//   const { Resend } = require('resend')
//   const resend = new Resend(process.env.RESEND_API_KEY)   // add to .env
//   await resend.emails.send({ from: config.smtp.from, to, subject, html })
// Resend/null other providers are NOT required for the app to work.

import nodemailer from 'nodemailer'
import { config } from './config.js'

let transporter = null

function getTransporter() {
  if (!config.smtp.host) return null
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth:
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
  })
  return transporter
}

/** Send an email. In dev mode the content is logged instead of delivered. */
export async function sendMail({ to, subject, text, html }) {
  const bareTo = Array.isArray(to) ? to.join(', ') : to
  const active = getTransporter()
  if (!active) {
    // DEV MAIL MODE — do not ship raw mail to a log in production without
    // reviewing what PII appears here. See README -> "Production readiness".
    console.log('\n======================== DEV MAIL ========================')
    console.log(`To:      ${bareTo}`)
    console.log(`Subject: ${subject}`)
    console.log('-----------------------------------------------------------')
    console.log(text || '')
    console.log('===========================================================\n')
    return { dev: true, to: bareTo }
  }
  const result = await active.sendMail({
    from: config.smtp.from,
    to: bareTo,
    subject,
    text,
    html,
  })
  return result
}

/** Notify staff about a new inquiry/lead. Ends up in INQUIRIES_TO inboxes. */
export function notifyStaff(inquiry) {
  const to = config.smtp.inquiriesTo
  if (!to.length) return sendMail({ to: inquiry.email, subject: 'Inquiry received', text: 'We have received your inquiry and will respond within one business day.' })
  return sendMail({
    to,
    subject: `New inquiry (${inquiry.kind}) — ${inquiry.name}`,
    text: [
      `Kind:    ${inquiry.kind}`,
      `Name:    ${inquiry.name}`,
      inquiry.company ? `Company: ${inquiry.company}` : null,
      `Email:   ${inquiry.email}`,
      inquiry.phone ? `Phone:   ${inquiry.phone}` : null,
      inquiry.subject ? `Subject: ${inquiry.subject}` : null,
      '',
      inquiry.message,
    ]
      .filter(Boolean)
      .join('\n'),
  })
}