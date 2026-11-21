// Centralised environment config. Every variable used by the server is read
// here so there is a single place to see what is required/optional.
// See `.env.example` for documentation of each value.

import 'dotenv/config'

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const config = {
  port: int(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: process.env.DATABASE_URL || 'file:./dev.db',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Reset tokens are only valid this long (seconds).
  resetTokenTtlSeconds: int(process.env.RESET_TOKEN_TTL_SECONDS, 60 * 60 * 4),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'Comet Healthcare <no-reply@comethealthcare.local>',
    // Comma-separated inboxes that receive inquiry / lead notifications.
    inquiriesTo: (process.env.INQUIRIES_TO || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  appUrl: process.env.APP_URL || 'http://localhost:5173',
}