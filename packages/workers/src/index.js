// Comet workers. The Phase 4 outbox publisher keeps moving committed domain
// events into Redis Streams; Phase 5 adds BullMQ queues for scans, notification
// delivery, document generation, search projection and retention sweeps.

import { PrismaClient } from '@prisma/client'
import { createClient } from 'redis'
import { Queue, Worker } from 'bullmq'
import '../../api/lib/env.js'
import { createProcessors, recordJobFailure } from './jobs.js'

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
  prefix: process.env.BULLMQ_PREFIX || 'comet',
  retentionCron: process.env.RETENTION_SWEEP_CRON || '0 2 * * *',
  queuesEnabled: process.env.QUEUES_ENABLED !== 'false',
}

function redisConnection() {
  const url = new URL(config.redisUrl)
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
  }
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

const QUEUE_NAMES = ['files.scan', 'notifications.dispatch', 'documents.generate', 'search.index', 'retention.sweep', 'finance.etims.submit']

let queueWorkers = []

async function startQueues() {
  if (!config.queuesEnabled) {
    console.log('BullMQ workers disabled (QUEUES_ENABLED=false)')
    return
  }
  const connection = redisConnection()
  const processors = createProcessors(prisma)
  queueWorkers = QUEUE_NAMES.map((name) => new Worker(
    name,
    async (job) => {
      const processor = processors[name]
      if (!processor) throw new Error(`No processor for queue ${name}`)
      try {
        return await processor(job)
      } catch (error) {
        await recordJobFailure(prisma, job, error)
        throw error
      }
    },
    { connection, prefix: config.prefix, concurrency: name === 'files.scan' ? 2 : 5 }
  ))

  for (const worker of queueWorkers) {
    worker.on('error', (error) => console.error(`Queue worker ${worker.name} error:`, error.message))
    worker.on('failed', (job, error) => console.error(`Job ${job?.id} failed in ${worker.name}:`, error.message))
  }

  const scheduler = new Queue('retention.sweep', { connection, prefix: config.prefix })
  await scheduler.add('run', {}, {
    jobId: 'retention-sweep-schedule',
    repeat: { pattern: config.retentionCron },
  })
  console.log(`BullMQ workers registered: ${QUEUE_NAMES.join(', ')}`)
}

async function start() {
  await redis.connect()
  running = true
  console.log(`Comet outbox publisher → ${config.stream} (${config.pollMs}ms)`)
  loop()
  await startQueues().catch((error) => console.error('Queue startup failed:', error.message))
}

start().catch((error) => {
  console.error('Worker startup failed:', error.message)
  process.exitCode = 1
})
