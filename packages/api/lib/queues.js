// BullMQ queue helpers shared by the API and workers. Imports are lazy so the
// API can still boot in environments where background jobs are disabled.

import { config } from './config.js'
import { db, getTenantContext } from './tenant.js'

const QUEUE_NAMES = ['files.scan', 'notifications.dispatch', 'documents.generate', 'retention.sweep', 'search.index']

function connection() {
  const url = new URL(config.events.redisUrl || 'redis://localhost:6379')
  return {
    host: url.hostname || 'localhost',
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== '/' ? Number(url.pathname.slice(1)) : 0,
  }
}

const queues = new Map()

async function getQueue(name) {
  if (!QUEUE_NAMES.includes(name)) throw new Error(`Unknown queue: ${name}`)
  if (!config.queues.enabled) return null
  if (!queues.has(name)) {
    const { Queue } = await import('bullmq')
    queues.set(name, new Queue(name, { connection: connection(), prefix: config.queues.prefix }))
  }
  return queues.get(name)
}

export async function enqueueJob(name, payload, options = {}) {
  const queue = await getQueue(name)
  if (!queue) return { id: null, status: 'DISABLED' }
  const job = await queue.add('run', payload, {
    attempts: options.attempts || 3,
    backoff: { type: 'exponential', delay: options.backoffMs || 2000 },
    removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
    removeOnFail: { age: 30 * 24 * 3600 },
    ...(options.jobId ? { jobId: options.jobId } : {}),
    ...(options.delayMs ? { delay: options.delayMs } : {}),
  })
  // Keep a tenant-scoped audit trail of queued work. Workers update this row
  // as the job progresses; jobId is unique within a queue.
  const ctx = getTenantContext()
  if (ctx?.companyId) {
    try {
      await db.jobRecord.create({
        data: {
          companyId: ctx.companyId,
          queue: name,
          jobId: String(job.id),
          type: options.type || 'run',
          status: 'QUEUED',
          payload: JSON.parse(JSON.stringify(payload || {})),
        },
      })
    } catch (error) {
      console.error('Could not record queued job:', error.message)
    }
  }
  return { id: job.id, status: 'QUEUED' }
}

export async function getJobStatus(name, id) {
  const queue = await getQueue(name)
  if (!queue || !id) return null
  const job = await queue.getJob(id)
  if (!job) return null
  const state = await job.getState()
  return {
    id: job.id,
    name: queue.name,
    state,
    progress: job.progress,
    failedReason: job.failedReason || null,
    returnvalue: job.returnvalue ?? null,
    createdAt: new Date(job.timestamp).toISOString(),
  }
}

export { QUEUE_NAMES }
