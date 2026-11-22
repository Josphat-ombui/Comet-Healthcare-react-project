// Outbox publisher (Phase 4). Moves committed domain events into a Redis
// Stream so the realtime service can fan them out to authorised rooms.
// BullMQ remains scheduled for Phase 5; this relay needs no job queue.

import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'
import '../../api/lib/env.js'

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const config = {
  databaseUrl: process.env.DATABASE_URL || process.env.DATABASE_URL_APP || '',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  stream: process.env.REDIS_EVENT_STREAM || 'comet.events',
  pollMs: int(process.env.OUTBOX_POLL_MS, 1000),
  maxAttempts: int(process.env.OUTBOX_MAX_ATTEMPTS, 10),
}

// The publisher is a trusted internal service and reads across tenants, so it
// uses the owner connection rather than the RLS-scoped application role.
const prisma = new PrismaClient({
  datasources: config.databaseUrl ? { db: { url: config.databaseUrl } } : undefined,
})

const redis = createClient({ url: config.redisUrl })
redis.on('error', (error) => console.error('Worker Redis error:', error.message))

let running = false

async function publishBatch() {
  const pending = await prisma.outboxEvent.findMany({
    where: { status: 'PENDING', availableAt: { lte: new Date() } },
    orderBy: { availableAt: 'asc' },
    take: 50,
  })
  if (!pending.length) return

  for (const event of pending) {
    try {
      await redis.xAdd(config.stream, '*', {
        event: JSON.stringify(event.payload),
        type: event.eventType,
        companyId: event.companyId,
        correlationId: event.correlationId,
      })
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      })
    } catch (error) {
      const attempts = event.attempts + 1
      const delayMs = Math.min(attempts * 1000, 60_000)
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          status: attempts >= config.maxAttempts ? 'FAILED' : 'PENDING',
          availableAt: new Date(Date.now() + delayMs),
        },
      })
      console.error(`Outbox event ${event.id} publish failed:`, error.message)
    }
  }
}

async function loop() {
  if (!running) return
  try {
    await publishBatch()
  } catch (error) {
    console.error('Outbox poll failed:', error.message)
  }
  setTimeout(loop, config.pollMs)
}

async function start() {
  await redis.connect()
  running = true
  console.log(`Comet outbox publisher → ${config.stream} (${config.pollMs}ms)`)
  loop()
}

start().catch((error) => {
  console.error('Worker startup failed:', error.message)
  process.exitCode = 1
})
