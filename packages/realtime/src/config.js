import '../../api/lib/env.js'

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const config = {
  port: int(process.env.REALTIME_PORT, 4001),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-do-not-use-in-production',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  stream: process.env.REDIS_EVENT_STREAM || 'comet.events',
  consumerGroup: process.env.REALTIME_CONSUMER_GROUP || 'comet-realtime',
  corsOrigins: (process.env.REALTIME_CORS_ORIGINS || 'http://localhost:4000,http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
}
