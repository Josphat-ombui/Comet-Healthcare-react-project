// Centralised environment config. Every variable used by the server is read
// here so there is a single place to see what is required/optional.
// See `.env.example` for documentation of each value.

import './env.js'
import { SESSION_POLICY } from '../../shared/src/identity.js'

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const config = {
  port: int(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  databaseUrl: process.env.DATABASE_URL_APP || process.env.DATABASE_URL || '',

  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  // Long-lived tokens remain accepted for the existing storefront flow.
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Defaults to the legacy token lifetime so the storefront keeps working;
  // set JWT_ACCESS_TTL=15m to use short-lived tokens with the refresh cookie.
  jwtAccessTtl: process.env.JWT_ACCESS_TTL || process.env.JWT_EXPIRES_IN || '7d',
  // Reset tokens are only valid this long (seconds).
  resetTokenTtlSeconds: int(process.env.RESET_TOKEN_TTL_SECONDS, 60 * 60 * 4),
  objectEncryptionKey: process.env.OBJECT_ENCRYPTION_KEY || '',

  password: {
    enforceBreach: process.env.PASSWORD_BREACH_ENFORCE === 'true',
  },
  // Internal messaging never calls SMTP. DLP fails closed unless explicitly
  // switched to flag-only mode for a supervised rollout.
  dlp: {
    mode: process.env.DLP_MODE === 'flag' ? 'flag' : 'block',
  },
  realtime: {
    port: int(process.env.REALTIME_PORT, 4001),
    tokenTtl: process.env.REALTIME_TOKEN_TTL || '5m',
    corsOrigins: (process.env.REALTIME_CORS_ORIGINS || 'http://localhost:4000,http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  events: {
    redisUrl: process.env.REDIS_URL || '',
    stream: process.env.REDIS_EVENT_STREAM || 'comet.events',
    outboxPollMs: int(process.env.OUTBOX_POLL_MS, 1000),
  },
  session: {
    refreshTtlSeconds: int(process.env.REFRESH_TOKEN_TTL_SECONDS, SESSION_POLICY.refreshTokenTtlSeconds),
    maxConcurrent: int(process.env.MAX_CONCURRENT_SESSIONS, SESSION_POLICY.maxConcurrentSessions),
  },
  login: {
    maxAttempts: int(process.env.LOGIN_MAX_ATTEMPTS, 10),
    windowSeconds: int(process.env.LOGIN_WINDOW_SECONDS, 15 * 60),
  },
  oidc: {
    issuer: process.env.OIDC_ISSUER || '',
    clientId: process.env.OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.OIDC_REDIRECT_URI || `${process.env.APP_URL || 'http://localhost:5173'}/auth/oidc/callback`,
    companyCode: process.env.OIDC_COMPANY_CODE || 'COMET',
    enabled: Boolean(process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET),
  },

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