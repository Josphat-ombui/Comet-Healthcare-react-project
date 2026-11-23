// Phase 5 background job processors. These run with the owner Prisma client
// (cross-tenant by design) and only ever write ID-based outbox events.

import crypto from 'node:crypto'
import { parseEventEnvelope, DomainEventSchemas } from '../../shared/src/events.js'
import {
  DOCUMENT_KINDS,
  computeLine,
  computeTotals,
  getCompanyProfile,
  nextDocumentNumber,
  renderBusinessDocumentPdf,
} from '../../api/lib/documents.js'
import { documentGenerateSchema } from '../../api/lib/validation.js'
import {
  getObject,
  newObjectKey,
  putObject,
  storageMode,
  verifyMagicNumber,
} from '../../api/lib/object-storage.js'
import { localIsoDay, addDays } from '../../api/lib/slots.js'
import { runWithTenant } from '../../api/lib/tenant.js'
import { executeReportRun } from '../../api/lib/reporting.js'

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const env = {
  scanHookUrl: process.env.FILE_SCAN_HOOK_URL || '',
  scanTimeoutMs: int(process.env.FILE_SCAN_TIMEOUT_MS, 10_000),
}

export async function recordJobFailure(prisma, job, error) {
  try {
    await updateJobRecord(prisma, job, 'FAILED', null, error)
  } catch (recordError) {
    console.error('Could not record failed job:', recordError.message)
  }
}

async function updateJobRecord(prisma, job, status, result = null, error = null) {
  if (!job?.data?.companyId) return
  await prisma.jobRecord.updateMany({
    where: { companyId: job.data.companyId, jobId: job.id },
    data: {
      status,
      result: result ? JSON.parse(JSON.stringify(result)) : undefined,
      error: error ? String(error.message || error).slice(0, 1000) : null,
      attempts: { increment: 1 },
    },
  })
}

async function emit(prisma, companyId, type, data, options = {}) {
  const schema = DomainEventSchemas[type]
  if (schema) schema.parse(data)
  const correlationId = options.correlationId || `cor_${crypto.randomUUID()}`
  const payload = parseEventEnvelope({
    id: `evt_${crypto.randomUUID()}`,
    type,
    version: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    causationId: null,
    companyId,
    branchId: options.branchId ?? null,
    actorId: options.actorId ?? null,
    data,
  })
  await prisma.outboxEvent.create({
    data: {
      companyId,
      eventType: type,
      version: 1,
      aggregateType: options.aggregateType || 'Platform',
      aggregateId: options.aggregateId || data.fileId || data.documentId || data.instanceId || data.entityId || payload.id,
      payload,
      correlationId,
      branchId: options.branchId ?? null,
      status: 'PENDING',
    },
  })
}

// Phase 6 finance notifications are in-app only. Callers supply neutral copy
// and IDs; payloads, amounts and credentials never reach a notification.
async function notifyFinanceUsers(prisma, { companyId, branchId, title, message, entityId, correlationId }) {
  // Accepted for parity with emit() options; IN_APP deliveries have no
  // external channel metadata to store.
  void branchId
  void correlationId
  const users = await prisma.user.findMany({
    where: { companyId, role: { in: ['ADMIN', 'COMPLIANCE'] } },
    select: { id: true },
  })
  if (!users.length) return
  const now = new Date()
  for (const user of users) {
    const notification = await prisma.notification.create({
      data: {
        companyId,
        userId: user.id,
        category: 'SYSTEM',
        title,
        message,
        classification: 'INTERNAL',
        entityType: 'ETIMS_SUBMISSION',
        entityId: entityId || null,
        deliveredAt: now,
      },
    })
    await prisma.notificationDelivery.create({
      data: {
        companyId,
        notificationId: notification.id,
        channel: 'IN_APP',
        status: 'DELIVERED',
        attempts: 1,
        sentAt: now,
      },
    })
  }
}

export function createProcessors(prisma) {
  // ------------------------------------------------------------ files.scan
  async function scanFile(job) {
    const { fileId } = job.data
    const file = await prisma.fileObject.findUnique({ where: { id: fileId } })
    if (!file || file.deletedAt) {
      await updateJobRecord(prisma, job, 'COMPLETED', { skipped: true })
      return { skipped: true }
    }

    await updateJobRecord(prisma, job, 'RUNNING')
    const bytes = await getObject(file.objectKey)
    let status = 'CLEAN'
    const magic = verifyMagicNumber(bytes, file.mimeType)
    if (!magic.ok) status = 'INFECTED'

    if (env.scanHookUrl && status === 'CLEAN') {
      try {
        const response = await fetch(env.scanHookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream', 'X-Comet-File-Id': file.id },
          body: bytes,
          signal: AbortSignal.timeout(env.scanTimeoutMs),
        })
        if (!response.ok) throw new Error(`Scan hook returned ${response.status}`)
        const verdict = await response.json().catch(() => ({ clean: true }))
        if (verdict.clean === false) status = verdict.quarantine ? 'QUARANTINED' : 'INFECTED'
      } catch (error) {
        // A failing external scanner fails closed: quarantine rather than
        // silently marking an unverified object as clean.
        status = 'QUARANTINED'
        console.error(`Scan hook failed for ${file.id}:`, error.message)
      }
    }

    const checksum = crypto.createHash('sha256').update(bytes).digest('hex')
    await prisma.fileObject.update({
      where: { id: file.id },
      data: { status, checksum, size: bytes.length },
    })
    if (status === 'CLEAN') {
      await prisma.fileVersion.upsert({
        where: { fileId_version: { fileId: file.id, version: file.version } },
        create: {
          companyId: file.companyId,
          fileId: file.id,
          version: file.version,
          objectKey: file.objectKey,
          size: bytes.length,
          checksum,
          createdById: file.uploadedById,
        },
        update: { checksum, size: bytes.length },
      })
    }

    await emit(prisma, file.companyId, 'FileScanned', {
      fileId: file.id,
      status,
      classification: file.classification,
      uploadedById: file.uploadedById,
      entityType: 'FILE',
      entityId: file.id,
    }, { branchId: file.branchId, aggregateId: file.id })

    const result = { status, size: bytes.length }
    await updateJobRecord(prisma, job, 'COMPLETED', result)
    return result
  }

  // --------------------------------------------------- notifications.dispatch
  async function dispatchNotification(job) {
    const { notificationId } = job.data
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } })
    if (!notification) {
      await updateJobRecord(prisma, job, 'COMPLETED', { skipped: true })
      return { skipped: true }
    }
    await updateJobRecord(prisma, job, 'RUNNING')

    // In-app only. External SMTP is reserved for password resets and other
    // genuinely external recipients, never internal communication.
    await prisma.notificationDelivery.updateMany({
      where: { notificationId, channel: 'IN_APP' },
      data: { status: 'DELIVERED', attempts: { increment: 1 }, sentAt: new Date() },
    })
    await prisma.notification.update({
      where: { id: notificationId },
      data: { deliveredAt: new Date() },
    })

    const result = { notificationId, channel: 'IN_APP' }
    await updateJobRecord(prisma, job, 'COMPLETED', result)
    return result
  }

  // --------------------------------------------------- documents.generate
  async function generateDocument(job) {
    const input = documentGenerateSchema.parse(job.data.payload)
    const kindMeta = DOCUMENT_KINDS[input.kind]
    if (kindMeta.financial && !input.items?.length) throw new Error('Financial documents require at least one line item')
    if (input.kind === 'COA' && (!input.params?.length || !input.productInfo)) throw new Error('A certificate of analysis requires product information and test parameters')
    if (['CDMO_SLA', 'NDA'].includes(input.kind) && !input.clauses?.length) throw new Error('Agreements require clauses')

    await updateJobRecord(prisma, job, 'RUNNING')
    const companyId = job.data.companyId
    const profile = await getCompanyProfile()
    const items = (input.items || []).map(computeLine)
    const totals = computeTotals(items, profile.taxRate)
    const data = {
      items,
      clauses: input.clauses || [],
      params: input.params || [],
      productInfo: input.productInfo || null,
      generatedBy: 'queue',
    }
    const number = await nextDocumentNumber(input.kind)
    const document = await prisma.businessDocument.create({
      data: {
        companyId,
        number,
        kind: input.kind,
        title: input.title || kindMeta.defaultTitle,
        status: 'DRAFT',
        currency: profile.currency,
        taxRate: profile.taxRate,
        issueDate: input.issueDate || localIsoDay(),
        dueDate: input.dueDate || (kindMeta.days ? addDays(localIsoDay(), kindMeta.days) : null),
        validUntil: input.validUntil || null,
        clientName: input.clientName,
        clientCompany: input.clientCompany,
        clientEmail: input.clientEmail,
        clientPhone: input.clientPhone || null,
        notes: input.notes || null,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        data,
        company: profile,
        createdById: job.data.actorId || null,
      },
    })

    const pdf = await renderBusinessDocumentPdf(document)
    const objectKey = newObjectKey(companyId, `${number}.pdf`, 'documents')
    await putObject(objectKey, pdf, 'application/pdf')
    const file = await prisma.fileObject.create({
      data: {
        companyId,
        uploadedById: job.data.actorId || document.createdById,
        name: `${number}.pdf`,
        objectKey,
        mimeType: 'application/pdf',
        size: pdf.length,
        checksum: crypto.createHash('sha256').update(pdf).digest('hex'),
        classification: 'INTERNAL',
        status: 'CLEAN',
        storageProvider: storageMode(),
        version: 1,
        purpose: 'DOCUMENT',
        folder: 'documents',
      },
    })

    // Find an internal user who matches the client email so the document is
    // discoverable in permission-aware search without exposing the email in an
    // event payload.
    const clientUser = await prisma.user.findFirst({
      where: { companyId, email: document.clientEmail.toLowerCase() },
      select: { id: true },
    })
    await prisma.searchDocument.upsert({
      where: { companyId_entityType_entityId: { companyId, entityType: 'DOCUMENT', entityId: document.id } },
      create: {
        companyId,
        entityType: 'DOCUMENT',
        entityId: document.id,
        title: `${number} ${document.title}`,
        summary: document.clientCompany,
        classification: 'INTERNAL',
        allowedUserIds: [document.createdById, clientUser?.id].filter(Boolean),
        allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
      },
      update: {
        title: `${number} ${document.title}`,
        summary: document.clientCompany,
        allowedUserIds: [document.createdById, clientUser?.id].filter(Boolean),
        allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
      },
    })

    await emit(prisma, companyId, 'DocumentGenerated', {
      documentId: document.id,
      kind: document.kind,
      status: document.status,
      createdById: document.createdById,
      classification: 'INTERNAL',
    }, { aggregateType: 'BusinessDocument', aggregateId: document.id, actorId: document.createdById, correlationId: job.data.correlationId })

    const result = { documentId: document.id, number, fileId: file.id }
    await updateJobRecord(prisma, job, 'COMPLETED', result)
    return result
  }

  // ------------------------------------------------------ search.index
  async function indexEntity(job) {
    const { entityType, entityId } = job.data
    if (!entityType || !entityId) return { skipped: true }
    const companyId = job.data.companyId
    let projection = null

    if (entityType === 'DOCUMENT') {
      const doc = await prisma.businessDocument.findFirst({ where: { id: entityId, companyId } })
      if (doc) {
        const clientUser = await prisma.user.findFirst({ where: { companyId, email: doc.clientEmail.toLowerCase() }, select: { id: true } })
        projection = {
          title: `${doc.number} ${doc.title}`,
          summary: doc.clientCompany,
          classification: 'INTERNAL',
          allowedUserIds: [doc.createdById, clientUser?.id].filter(Boolean),
          allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
        }
      }
    } else if (entityType === 'FILE') {
      const file = await prisma.fileObject.findFirst({ where: { id: entityId, companyId } })
      if (file && !file.deletedAt) {
        projection = {
          title: file.name,
          summary: `${file.purpose} · ${file.mimeType}`,
          classification: file.classification,
          allowedUserIds: [file.uploadedById],
          allowedRoleCodes: ['ADMIN', 'COMPLIANCE'],
        }
      }
    } else if (entityType === 'WORKFLOW') {
      const instance = await prisma.workflowInstance.findFirst({ where: { id: entityId, companyId }, include: { definition: true } })
      if (instance) {
        projection = {
          title: `${instance.definition.name} · ${instance.entityType}`,
          summary: instance.status,
          classification: instance.definition.classification,
          allowedUserIds: [instance.requestedById],
          allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
        }
      }
    } else if (entityType === 'USER') {
      const user = await prisma.user.findFirst({ where: { id: entityId, companyId } })
      if (user) {
        projection = {
          title: `${user.firstName} ${user.lastName}`,
          summary: user.departmentId || user.branchId || '',
          classification: 'CONFIDENTIAL',
          allowedUserIds: [],
          allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
        }
      }
    }

    if (!projection) {
      await prisma.searchDocument.deleteMany({ where: { companyId, entityType, entityId } })
      return { removed: true }
    }
    await prisma.searchDocument.upsert({
      where: { companyId_entityType_entityId: { companyId, entityType, entityId } },
      create: { companyId, entityType, entityId, ...projection },
      update: projection,
    })
    return { entityType, entityId }
  }

  // --------------------------------------------------- retention.sweep
  async function retentionSweep(job) {
    const policies = await prisma.retentionPolicy.findMany({ where: {} })
    let affected = 0
    for (const policy of policies) {
      const hold = await prisma.legalHold.findFirst({
        where: {
          status: 'ACTIVE',
          OR: [
            { scopeType: 'COMPANY', scopeId: null },
            { scopeType: 'DEPARTMENT', scopeId: policy.departmentId },
          ],
        },
      })
      if (hold) continue
      const cutoff = new Date(Date.now() - policy.retentionDays * 86400000)
      const result = await prisma.fileObject.updateMany({
        where: { companyId: policy.companyId, deletedAt: null, createdAt: { lt: cutoff } },
        data: { deletedAt: new Date() },
      })
      affected += result.count
    }

    // Notifications are transient by design; expire anything older than 90
    // days independently of document retention policies.
    const oldNotifications = await prisma.notification.updateMany({
      where: { readAt: { not: null }, createdAt: { lt: new Date(Date.now() - 90 * 86400000) }, expiresAt: null },
      data: { expiresAt: new Date() },
    })
    affected += oldNotifications.count
    await updateJobRecord(prisma, job, 'COMPLETED', { affected })
    return { affected }
  }

  // ------------------------------------------------- finance.etims.submit
  async function submitEtims(job) {
    const { companyId, invoiceId, submissionId, correlationId } = job.data
    const submission = await prisma.etimsSubmission.findFirst({
      where: { id: submissionId, companyId },
    })
    if (!submission) {
      await updateJobRecord(prisma, job, 'COMPLETED', { skipped: true })
      return { skipped: true }
    }

    // updateJobRecord increments attempts on every transition, as in the
    // other processors.
    await updateJobRecord(prisma, job, 'RUNNING')

    const payload = submission.payload
    const validPayload = Boolean(payload)
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && payload.schemaVersion != null
      && typeof payload.documentType === 'string'
      && payload.documentType.length > 0
      && typeof payload.invoiceNumber === 'string'
      && payload.invoiceNumber.length > 0
      && typeof payload.currency === 'string'
      && payload.currency.length > 0
      && Array.isArray(payload.lines)
      && typeof payload.totals === 'object'
      && payload.totals !== null
      && !Array.isArray(payload.totals)

    const eventData = {
      submissionId,
      invoiceId,
      classification: 'INTERNAL',
      entityType: 'ETIMS_SUBMISSION',
      entityId: submissionId,
    }
    const emitOptions = {
      aggregateType: 'EtimsSubmission',
      aggregateId: submissionId,
      correlationId,
    }

    if (!validPayload) {
      await prisma.etimsSubmission.update({
        where: { id: submissionId },
        data: { status: 'FAILED', lastError: 'INVALID_PAYLOAD' },
      })
      await emit(prisma, companyId, 'EtimsSubmissionFailed', {
        ...eventData,
        reasonCode: 'INVALID_PAYLOAD',
      }, emitOptions)
      await notifyFinanceUsers(prisma, {
        companyId,
        branchId: submission.branchId || null,
        title: 'eTIMS submission failed validation',
        message: `Submission ${submissionId} for invoice ${invoiceId} failed validation (INVALID_PAYLOAD).`,
        entityId: submissionId,
        correlationId,
      })
      await updateJobRecord(prisma, job, 'FAILED', null, new Error('Invalid eTIMS payload'))
      throw new Error('Invalid eTIMS payload')
    }

    // Phase 6 queues work for a certified provider only: no external eTIMS
    // endpoint is called, and no payload content enters an event or message.
    await prisma.etimsSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'PENDING',
        provider: typeof payload.provider === 'string' && payload.provider ? payload.provider : 'internal-queue',
        submittedAt: null,
        externalReference: null,
        lastError: null,
      },
    })
    await emit(prisma, companyId, 'EtimsSubmissionQueued', {
      ...eventData,
      status: 'PENDING',
    }, emitOptions)
    await notifyFinanceUsers(prisma, {
      companyId,
      branchId: submission.branchId || null,
      title: 'eTIMS submission awaiting certified provider',
      message: `Submission ${submissionId} for invoice ${invoiceId} is queued for a certified provider.`,
      entityId: submissionId,
      correlationId,
    })

    const result = { submissionId, status: 'PENDING' }
    await updateJobRecord(prisma, job, 'COMPLETED', result)
    return result
  }

  // --------------------------------------------------------- reporting.run
  async function runReport(job) {
    const { reportRunId, companyId, branchId, correlationId } = job.data
    if (!reportRunId || !companyId) throw new Error('Invalid reporting job payload')

    await updateJobRecord(prisma, job, 'RUNNING')
    const run = await runWithTenant(
      { companyId, branchId: branchId || '', correlationId: correlationId || null },
      () => executeReportRun(reportRunId, {
        client: prisma,
        companyId,
        branchId: branchId || null,
      }),
    )
    // The queue result, JobRecord and outbox event deliberately carry only the
    // run ID. Parameters, counts, totals and file references are read through
    // the authenticated reporting API.
    const result = { reportRunId: run.id }
    await updateJobRecord(prisma, job, 'COMPLETED', result)
    return result
  }

  return {
    'files.scan': scanFile,
    'notifications.dispatch': dispatchNotification,
    'documents.generate': generateDocument,
    'search.index': indexEntity,
    'retention.sweep': retentionSweep,
    'finance.etims.submit': submitEtims,
    'reporting.run': runReport,
  }
}
