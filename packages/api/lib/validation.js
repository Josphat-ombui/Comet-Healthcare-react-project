// Zod schemas for every request body. Server-side validation is the single
// source of truth; the frontend mirrors these messages for UX.

import { z } from 'zod'
import { isValidIsoDate, isValidIsoTime, isPastDate, addDays, localIsoDay } from './slots.js'
import { inspectText, findingTypes } from '../../shared/src/dlp.js'

export const emailSchema = z.string().trim().min(3, 'Please enter an email address').max(190).email('Please enter a valid email address')

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')

export const registerSchema = z.object({
  firstName: z.string().trim().min(2, 'First name is required').max(80),
  lastName: z.string().trim().min(2, 'Last name is required').max(80),
  email: emailSchema,
  password: passwordSchema,
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  company: z.string().trim().max(120).optional().or(z.literal('')),
})

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required').max(190),
  password: z.string().min(1, 'Password is required').max(128),
})

export const resetRequestSchema = z.object({
  email: emailSchema,
})

export const resetPasswordSchema = z.object({
  token: z.string().min(10, 'Invalid reset token'),
  password: passwordSchema,
})

// ------------------------------------------------------------ phase 3 identity

export const mfaVerifySchema = z.object({
  challenge: z.string().min(10, 'MFA challenge is required'),
  code: z.string().trim().min(6, 'Enter the 6-digit code or a recovery code').max(40),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
})

export const oidcCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State is required'),
})

export const createUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'COMPLIANCE', 'PATIENT', 'PROVIDER']).default('STAFF'),
  branchId: z.string().max(60).nullable().optional(),
  departmentId: z.string().max(60).nullable().optional(),
  locale: z.enum(['en-KE', 'sw-KE']).default('en-KE'),
  sendInvite: z.boolean().default(true),
})

export const updateUserSchema = createUserSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INVITED', 'SUSPENDED', 'DISABLED']).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'COMPLIANCE', 'PATIENT', 'PROVIDER']).optional(),
})

export const assignRoleSchema = z.object({
  roleCode: z.string().trim().min(2).max(60),
  scopeBranchId: z.string().max(60).nullable().optional(),
})

export const createBranchSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, _ or -'),
  name: z.string().trim().min(2).max(120),
  type: z.enum(['HQ', 'BRANCH', 'PLANT', 'WAREHOUSE', 'WORKSHOP', 'SHOWROOM', 'OFFICE']).default('BRANCH'),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
})

export const createDepartmentSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, _ or -'),
  name: z.string().trim().min(2).max(120),
  internalAddress: z.string().trim().max(120).optional().or(z.literal('')),
})

export const auditQuerySchema = z.object({
  action: z.string().trim().max(80).optional(),
  actorId: z.string().max(60).optional(),
  resourceType: z.string().trim().max(80).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

// ------------------------------------------------------------ phase 4 messaging

const internalRecipientSchema = z.string().trim().min(2).max(200)
  .refine((value) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'External email addresses cannot be used for internal messaging')

const classificationSchema = z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'])
const prioritySchema = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
const optionalIsoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'Enter a valid date and time')

export const createInboxSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, _ or -'),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['PERSONAL', 'DEPARTMENT', 'ROLE', 'BRANCH', 'SHARED']),
  internalAddress: z.string().trim().max(120).optional().or(z.literal('')),
  branchId: z.string().max(60).nullable().optional(),
  departmentId: z.string().max(60).nullable().optional(),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  classification: classificationSchema.default('INTERNAL'),
})

export const createThreadSchema = z.object({
  subject: z.string().trim().min(2, 'Enter a subject').max(220),
  inboxId: z.string().max(60).nullable().optional(),
  channelId: z.string().max(60).nullable().optional(),
  branchId: z.string().max(60).nullable().optional(),
  priority: prioritySchema.default('NORMAL'),
  classification: classificationSchema.default('INTERNAL'),
  recipients: z.array(internalRecipientSchema).max(50).optional(),
})

export const threadQuerySchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  inboxId: z.string().max(60).optional(),
  channelId: z.string().max(60).optional(),
  assignedToId: z.string().max(60).optional(),
  archived: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const updateThreadSchema = z.object({
  status: z.enum(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']).optional(),
  priority: prioritySchema.optional(),
  dueDate: optionalIsoDateTime.nullable().optional(),
  snoozedUntil: optionalIsoDateTime.nullable().optional(),
  archived: z.boolean().optional(),
})

export const assignThreadSchema = z.object({
  assignedToId: z.string().max(60).nullable(),
})

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Enter a message').max(20_000),
  recipients: z.array(internalRecipientSchema).max(50).optional(),
  visibility: z.enum(['RECIPIENT', 'INTERNAL']).default('RECIPIENT'),
  priority: prioritySchema.optional(),
  classification: classificationSchema.optional(),
})

export const editMessageSchema = z.object({
  body: z.string().trim().min(1, 'Enter a message').max(20_000),
  reason: z.string().trim().max(200).optional().or(z.literal('')),
})

export const reactionSchema = z.object({
  emoji: z.string().trim().min(1).max(16).regex(/^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u, 'Use a single emoji'),
})

export const messageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.string().max(60).optional(),
  after: z.string().max(60).optional(),
})

export const createChannelSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  visibility: z.enum(['PUBLIC', 'PRIVATE']).default('PUBLIC'),
  branchId: z.string().max(60).nullable().optional(),
  departmentId: z.string().max(60).nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
})

export const routingEvaluateSchema = z.object({
  subject: z.string().trim().max(220).optional().or(z.literal('')),
  body: z.string().trim().max(4000).optional().or(z.literal('')),
  formType: z.string().trim().max(80).optional().or(z.literal('')),
  senderType: z.string().trim().max(80).optional().or(z.literal('')),
  branchId: z.string().max(60).nullable().optional(),
})

export const visitDateSchema = z
  .string()
  .refine(isValidIsoDate, 'Choose a valid date')
  .refine((v) => !isPastDate(v), 'That date is in the past')
  .refine((v) => v <= addDays(localIsoDay(), 60), 'Bookings are limited to 60 days ahead')

export const bookSchema = z.object({
  providerSlug: z.string().min(1, 'Choose an expert'),
  date: visitDateSchema,
  startTime: z.string().refine(isValidIsoTime, 'Choose a start time'),
  type: z.string().trim().max(80).default('Consultation'),
  patientName: z.string().trim().min(2, 'Full name is required').max(120),
  patientEmail: emailSchema,
  patientPhone: z.string().trim().max(40).optional().or(z.literal('')),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const inquirySchema = z.object({
  kind: z.enum(['CONTACT', 'CATALOG', 'CDMO']),
  name: z.string().trim().min(2, 'Please enter your name').max(120),
  company: z.string().trim().max(120).optional().or(z.literal('')),
  email: emailSchema,
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  subject: z.string().trim().max(160).optional().or(z.literal('')),
  message: z.string().trim().min(10, 'Please tell us a little more (at least 10 characters)').max(4000),
})

export const rescheduleSchema = z.object({
  date: visitDateSchema,
  startTime: z.string().refine(isValidIsoTime, 'Choose a start time'),
})

export const cancelSchema = z.object({
  action: z.literal('cancel'),
})

export const appointmentStatusSchema = z.object({
  status: z.enum(['SCHEDULED', 'CONFIRMED', 'CANCELLED', 'COMPLETED']),
})

export const inquiryStatusSchema = z.object({
  status: z.enum(['NEW', 'REVIEWED', 'ARCHIVED']),
})

// ------------------------------------------------------------ documents

export const documentKindSchema = z.enum([
  'QUOTATION',
  'PROFORMA_INVOICE',
  'INVOICE',
  'ORDER_CONFIRMATION',
  'CDMO_SLA',
  'NDA',
  'COA',
])

export const docItemSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(240),
  qty: z.number().min(0, 'Quantity must be 0 or more'),
  unitPrice: z.number().min(0, 'Unit price must be 0 or more'),
})

export const docClauseSchema = z.object({
  title: z.string().trim().min(1, 'Clause title is required').max(200),
  body: z.string().trim().min(1, 'Clause text is required').max(6000),
})

export const coaParamSchema = z.object({
  parameter: z.string().trim().min(1, 'Parameter is required').max(120),
  method: z.string().trim().max(160).optional().or(z.literal('')),
  result: z.string().trim().min(1, 'Result is required').max(160),
  limit: z.string().trim().min(1, 'Specification limit is required').max(200),
  status: z.enum(['PASS', 'FAIL', 'N/A']).default('PASS'),
})

export const coaProductSchema = z.object({
  product: z.string().trim().min(1, 'Product is required').max(200),
  batch: z.string().trim().max(80).optional().or(z.literal('')),
  dosageForm: z.string().trim().max(120).optional().or(z.literal('')),
  manufacturingDate: z.string().refine(isValidIsoDate).optional().or(z.literal('')),
  expiryDate: z.string().refine(isValidIsoDate).optional().or(z.literal('')),
  storage: z.string().trim().max(160).optional().or(z.literal('')),
})

const optionalIsoDate = z.string().refine(isValidIsoDate).or(z.literal(''))

export const documentGenerateSchema = z.object({
  kind: documentKindSchema,
  title: z.string().trim().max(220).optional().or(z.literal('')),
  clientName: z.string().trim().min(2, 'Contact name is required').max(120),
  clientCompany: z.string().trim().min(2, 'Company name is required').max(180),
  clientEmail: emailSchema,
  clientPhone: z.string().trim().max(40).optional().or(z.literal('')),
  issueDate: optionalIsoDate.optional(),
  dueDate: optionalIsoDate.optional(),
  validUntil: optionalIsoDate.optional(),
  notes: z.string().trim().max(3000).optional().or(z.literal('')),
  items: z.array(docItemSchema).max(60).optional(),
  clauses: z.array(docClauseSchema).max(40).optional(),
  productInfo: coaProductSchema.optional(),
  params: z.array(coaParamSchema).max(60).optional(),
})

export const documentPatchSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'VOID']).optional(),
  dueDate: optionalIsoDate.optional(),
  validUntil: optionalIsoDate.optional(),
})

// ------------------------------------------------------------ phase 5 platform

export const fileUploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().min(3).max(120),
  size: z.number().int().positive().max(25 * 1024 * 1024, 'Files are limited to 25 MB'),
  classification: classificationSchema.default('INTERNAL'),
  purpose: z.enum(['GENERAL', 'MESSAGE_ATTACHMENT', 'DOCUMENT', 'PROFILE']).default('GENERAL'),
  folder: z.string().trim().max(120).optional().or(z.literal('')),
  checksum: z.string().trim().max(128).optional().or(z.literal('')),
})

export const fileConfirmSchema = z.object({
  checksum: z.string().trim().max(128).optional().or(z.literal('')),
  status: z.enum(['PENDING', 'CLEAN', 'INFECTED', 'QUARANTINED']).default('PENDING'),
})

export const fileListQuerySchema = z.object({
  purpose: z.string().trim().max(40).optional(),
  status: z.enum(['PENDING', 'CLEAN', 'INFECTED', 'QUARANTINED']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const notificationQuerySchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  category: z.enum(['MESSAGE', 'WORKFLOW', 'DOCUMENT', 'FILE', 'SYSTEM']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const notificationPreferenceSchema = z.object({
  channel: z.enum(['IN_APP']).default('IN_APP'),
  enabled: z.boolean(),
  digestMinutes: z.number().int().min(0).max(1440).default(0),
})

export const workflowStepSchema = z.object({
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9_-]+$/),
  label: z.string().trim().min(2).max(160),
  assigneeRole: z.enum(['ADMIN', 'MANAGER', 'STAFF', 'COMPLIANCE']).optional(),
  assigneeUserId: z.string().max(80).optional(),
  requireReason: z.boolean().default(false),
})

export const workflowDefinitionSchema = z.object({
  code: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  steps: z.array(workflowStepSchema).min(1).max(12),
  classification: classificationSchema.default('INTERNAL'),
  active: z.boolean().default(true),
})

export const workflowStartSchema = z.object({
  definitionCode: z.string().trim().min(2).max(60),
  entityType: z.string().trim().min(2).max(40),
  entityId: z.string().trim().max(80).optional(),
  branchId: z.string().max(60).nullable().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export const workflowTaskDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
})

export const workflowDelegateSchema = z.object({
  toUserId: z.string().trim().min(2).max(80),
  comment: z.string().trim().max(1000).optional().or(z.literal('')),
})

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Enter a search term').max(200),
  types: z.array(z.enum(['MESSAGE', 'THREAD', 'DOCUMENT', 'FILE', 'WORKFLOW', 'USER'])).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

export const companyProfileSchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(160),
  legalName: z.string().trim().min(1, 'Legal name is required').max(200),
  tagline: z.string().trim().max(160).optional().or(z.literal('')),
  addressLine1: z.string().trim().max(160).optional().or(z.literal('')),
  addressLine2: z.string().trim().max(160).optional().or(z.literal('')),
  poBox: z.string().trim().max(160).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  email: emailSchema,
  website: z.string().trim().max(120).optional().or(z.literal('')),
  regNo: z.string().trim().max(120).optional().or(z.literal('')),
  vatReg: z.string().trim().max(120).optional().or(z.literal('')),
  ppbNo: z.string().trim().max(120).optional().or(z.literal('')),
  currency: z.string().trim().min(1, 'Currency is required').max(8).default('KES'),
  taxRate: z.number().min(0).max(1).default(0.16),
  footerNote: z.string().trim().max(2000).optional().or(z.literal('')),
})

// ------------------------------------------------------- site content (CMS)
//
// The CMS tree is deliberately open-ended — Content Studio can add new copy
// fields without a deploy — so validation focuses on shape and safety rather
// than enumerating every branch: a plain object, bounded strings/arrays, and
// no prototype-polluting keys that could poison `deepMerge` on the server.

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const cmsValue = z.lazy(() =>
  z.union([
    z.string().max(20000),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(cmsValue).max(500),
    z.record(z.string().max(120), cmsValue),
  ])
)

function hasUnsafeKey(value) {
  const stack = [value]
  while (stack.length) {
    const node = stack.pop()
    if (Array.isArray(node)) {
      stack.push(...node)
    } else if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (UNSAFE_KEYS.has(key)) return true
        stack.push(node[key])
      }
    }
  }
  return false
}

export const siteContentSchema = z.intersection(
  // Zod drops `__proto__` while parsing records, so inspect the raw input too.
  z.any().refine((value) => !hasUnsafeKey(value), 'Content contains an unsafe field name'),
  cmsValue
    .refine((value) => value !== null && typeof value === 'object' && !Array.isArray(value), 'Content must be a JSON object')
    .refine(
      (value) => JSON.stringify(value).length <= 2_000_000,
      'Content payload is too large'
    )
)

// ------------------------------------------------------------ phase 6 finance
//
// Finance keeps all money as integer cents. Findings from the shared DLP
// patterns are reported by type only — never by the matched value itself.

function dlpSafeText(max, options = {}) {
  const allowWholeKraPin = options.allowWholeKraPin === true
  return z.string().trim().max(max).superRefine((value, ctx) => {
    const findings = inspectText(value)
    if (!findings.length) return
    const types = findingTypes(findings)
    // A KRA PIN is a legitimate tax identifier on a party, but only when it is
    // the entire field. Embedded/card/secret findings are always rejected.
    const wholeKraPin = allowWholeKraPin
      && types.length === 1
      && types[0] === 'KRA_PIN'
      && findings.length === 1
      && findings[0].start === 0
      && findings[0].end === value.length
    if (wholeKraPin) return
    ctx.addIssue({
      code: 'custom',
      message: `Contains restricted data (${types.join(', ')})`,
    })
  })
}

const financeId = z.string().trim().min(1).max(80)
const financeDate = z.string().refine(isValidIsoDate, 'Choose a valid date')
const financeLimit = z.coerce.number().int().min(1).max(200).default(50)
const financeMoney = z.number().int().nonnegative()
const financeMoneyPositive = z.number().int().positive()
const financeSystemCode = z.string().trim().max(60).regex(/^[A-Z][A-Z0-9_]*$/, 'Use uppercase letters, numbers and underscores')

export const financeAccountSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']),
  normalBalance: z.enum(['DEBIT', 'CREDIT']),
  systemCode: financeSystemCode.nullable().optional(),
  parentId: financeId.nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('KES'),
  isActive: z.boolean().default(true),
  branchId: financeId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
})

export const financePartySchema = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER']),
  name: dlpSafeText(160),
  legalName: dlpSafeText(200).optional().or(z.literal('')),
  taxPin: dlpSafeText(20, { allowWholeKraPin: true }).optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  currency: z.string().trim().min(1).max(8).default('KES'),
  classification: classificationSchema.default('INTERNAL'),
})

export const financeJournalSchema = z.object({
  date: financeDate,
  description: dlpSafeText(300),
  lines: z.array(z.object({
    accountId: financeId,
    partyId: financeId.nullable().optional(),
    debitCents: financeMoney.default(0),
    creditCents: financeMoney.default(0),
    memo: dlpSafeText(240).optional().or(z.literal('')),
  })).min(2, 'A journal needs at least two lines').max(40),
  referenceType: z.string().trim().max(40).optional().or(z.literal('')),
  referenceId: financeId.optional(),
  branchId: financeId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
})

export const financeRateSchema = z.object({
  code: z.string().trim().min(1).max(60),
  kind: z.enum(['VAT']).default('VAT'),
  label: z.string().trim().min(1).max(160),
  rateBps: z.number().int().min(1, 'Rate must be at least 1 basis point').max(10_000),
  effectiveFrom: financeDate,
  effectiveTo: financeDate.nullable().optional(),
  sourceReference: z.string().trim().min(1, 'A source reference is required').max(240),
})

export const financeRateVerifySchema = z.object({
  verifiedBy: z.string().trim().min(1, 'Verifier is required').max(120),
  verificationNote: z.string().trim().min(1, 'A verification note is required').max(500),
})

const financeInvoiceLineSchema = z.object({
  description: z.string().trim().min(1).max(240),
  qty: z.number().positive('Quantity must be greater than zero'),
  unitPriceCents: financeMoneyPositive,
})

export const financeInvoiceSchema = z.object({
  direction: z.enum(['SALES', 'PURCHASE']),
  type: z.enum(['INVOICE', 'CREDIT_NOTE']).default('INVOICE'),
  partyId: financeId,
  issueDate: financeDate,
  dueDate: financeDate.nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('KES'),
  taxInclusive: z.boolean().default(false),
  taxRateId: financeId.optional(),
  lines: z.array(financeInvoiceLineSchema).min(1).max(60),
  businessDocumentId: financeId.optional(),
  sourceInvoiceId: financeId.optional(),
  notes: dlpSafeText(2000).optional().or(z.literal('')),
  branchId: financeId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
})

export const financeInvoiceIssueSchema = z.object({
  taxRateId: financeId.optional(),
})

export const financePaymentSchema = z.object({
  direction: z.enum(['INCOMING', 'OUTGOING']),
  partyId: financeId,
  method: z.enum(['BANK_TRANSFER', 'MPESA', 'CASH', 'CHEQUE', 'CARD_TOKEN', 'OTHER']),
  amountCents: financeMoneyPositive,
  currency: z.string().trim().min(1).max(8).default('KES'),
  paidAt: optionalIsoDateTime.optional(),
  reference: dlpSafeText(200).optional().or(z.literal('')),
  allocations: z.array(z.object({
    invoiceId: financeId,
    amountCents: financeMoneyPositive,
  })).max(50).default([]),
  branchId: financeId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
})

export const financeBudgetSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(160),
  period: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  startDate: financeDate,
  endDate: financeDate,
  lines: z.array(z.object({
    accountId: financeId,
    amountCents: financeMoney,
  })).min(1).max(40),
  branchId: financeId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
})

export const financeAccountQuerySchema = z.object({
  type: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']).optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: financeLimit,
})

export const financePartyQuerySchema = z.object({
  type: z.enum(['CUSTOMER', 'SUPPLIER']).optional(),
  limit: financeLimit,
})

export const financeRateQuerySchema = z.object({
  kind: z.enum(['VAT']).optional(),
  activeOn: financeDate.optional(),
  limit: financeLimit,
})

export const financeJournalQuerySchema = z.object({
  status: z.enum(['DRAFT', 'POSTED', 'REVERSED']).optional(),
  limit: financeLimit,
})

export const financeInvoiceQuerySchema = z.object({
  direction: z.enum(['SALES', 'PURCHASE']).optional(),
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  partyId: financeId.optional(),
  limit: financeLimit,
})

export const financePaymentQuerySchema = z.object({
  direction: z.enum(['INCOMING', 'OUTGOING']).optional(),
  limit: financeLimit,
})

export const financeBudgetQuerySchema = z.object({
  limit: financeLimit,
})

export const financeStatementQuerySchema = z.object({
  asOf: financeDate.optional(),
  from: financeDate.optional(),
  to: financeDate.optional(),
  direction: z.enum(['SALES', 'PURCHASE']).optional(),
  limit: financeLimit.optional(),
})

export const financeEtimsQuerySchema = z.object({
  invoiceId: financeId.optional(),
  limit: financeLimit,
})

// ------------------------------------------------------------ phase 7 sales
//
// Sales keeps every monetary field in integer cents. Dates are strict
// YYYY-MM-DD strings. Free text goes through the shared DLP inspector, and all
// create schemas are strict so a client cannot smuggle companyId or status into
// a tenant-scoped write.

const salesId = z.string().trim().min(1).max(80)
const salesDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Choose a valid date')
const salesMoneyPositive = z.number().int().positive()
const salesLineInputSchema = z.object({
  description: dlpSafeText(240),
  qty: z.number().positive('Quantity must be greater than zero').max(100_000),
  unitPriceCents: salesMoneyPositive,
}).strict()

const salesLineList = z.array(salesLineInputSchema).min(1).max(60)
const optionalSalesLineList = z.array(salesLineInputSchema).max(60).default([])
const salesQueryLimit = z.coerce.number().int().min(1).max(200).default(50)

const salesQuoteCreateBase = z.object({
  partyId: salesId,
  quoteDate: salesDate,
  validUntil: salesDate.nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('KES'),
  // Only an ID is accepted. Rate values are never supplied by a client, and
  // invoice issue rejects UNVERIFIED rates through finance.resolveVerifiedRate.
  taxRateId: salesId.nullable().optional(),
  lines: salesLineList,
  notes: dlpSafeText(2000).optional().or(z.literal('')),
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const salesQuoteCreateSchema = salesQuoteCreateBase
export const salesQuoteUpdateSchema = salesQuoteCreateBase.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required'
)

const salesOrderCreateBase = z.object({
  partyId: salesId,
  quoteId: salesId.optional(),
  orderDate: salesDate,
  requestedDate: salesDate.nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('KES'),
  taxRateId: salesId.nullable().optional(),
  lines: optionalSalesLineList,
  notes: dlpSafeText(2000).optional().or(z.literal('')),
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict().superRefine((value, ctx) => {
  if (!value.quoteId && value.lines.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'At least one line or a quoteId is required' })
  }
})

export const salesOrderCreateSchema = salesOrderCreateBase
export const salesOrderUpdateSchema = z.object({
  partyId: salesId.optional(),
  requestedDate: salesDate.nullable().optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  taxRateId: salesId.nullable().optional(),
  lines: optionalSalesLineList.optional(),
  notes: dlpSafeText(2000).optional().or(z.literal('')),
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const salesSourceSchema = z.object({
  orderId: salesId.optional(),
  deliveryNoteId: salesId.optional(),
  partyId: salesId.optional(),
  deliveryDate: salesDate,
  currency: z.string().trim().min(1).max(8).default('KES'),
  lines: optionalSalesLineList,
  notes: dlpSafeText(2000).optional().or(z.literal('')),
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict().superRefine((value, ctx) => {
  if (!value.orderId && (!value.partyId || value.lines.length === 0)) {
    ctx.addIssue({
      code: 'custom',
      path: ['partyId'],
      message: 'partyId and at least one line are required when orderId is omitted',
    })
  }
})

export const salesDeliveryCreateSchema = salesSourceSchema
export const salesDeliveryUpdateSchema = z.object({
  partyId: salesId.optional(),
  deliveryDate: salesDate.optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  lines: optionalSalesLineList.optional(),
  notes: dlpSafeText(2000).optional().or(z.literal('')),
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const salesReturnCreateBase = z.object({
  orderId: salesId.optional(),
  deliveryNoteId: salesId.optional(),
  partyId: salesId.optional(),
  returnDate: salesDate,
  reason: dlpSafeText(1000).optional().or(z.literal('')),
  currency: z.string().trim().min(1).max(8).default('KES'),
  lines: optionalSalesLineList,
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict().superRefine((value, ctx) => {
  if (value.orderId && value.deliveryNoteId) {
    ctx.addIssue({ code: 'custom', path: ['deliveryNoteId'], message: 'Use orderId or deliveryNoteId, not both' })
  }
  if (!value.orderId && !value.deliveryNoteId && (!value.partyId || value.lines.length === 0)) {
    ctx.addIssue({
      code: 'custom',
      path: ['partyId'],
      message: 'partyId and at least one line are required without a source document',
    })
  }
})

export const salesReturnCreateSchema = salesReturnCreateBase
export const salesReturnUpdateSchema = z.object({
  reason: dlpSafeText(1000).optional().or(z.literal('')),
  currency: z.string().trim().min(1).max(8).optional(),
  lines: optionalSalesLineList.optional(),
  branchId: salesId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const salesInvoiceFromOrderSchema = z.object({
  issueDate: salesDate.optional(),
  dueDate: salesDate.nullable().optional(),
  taxRateId: salesId.optional(),
  notes: dlpSafeText(2000).optional().or(z.literal('')),
}).strict()

const salesStatusQuery = (values) => z.enum(values).optional()
export const salesQuoteQuerySchema = z.object({
  status: salesStatusQuery(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'CONVERTED', 'EXPIRED', 'CANCELLED']),
  partyId: salesId.optional(),
  from: salesDate.optional(),
  to: salesDate.optional(),
  limit: salesQueryLimit,
}).strict()

export const salesOrderQuerySchema = z.object({
  status: salesStatusQuery(['DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED']),
  partyId: salesId.optional(),
  from: salesDate.optional(),
  to: salesDate.optional(),
  limit: salesQueryLimit,
}).strict()

export const salesDeliveryQuerySchema = z.object({
  status: salesStatusQuery(['DRAFT', 'ISSUED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
  partyId: salesId.optional(),
  orderId: salesId.optional(),
  from: salesDate.optional(),
  to: salesDate.optional(),
  limit: salesQueryLimit,
}).strict()

export const salesReturnQuerySchema = z.object({
  status: salesStatusQuery(['DRAFT', 'APPROVED', 'RECEIVED', 'REJECTED', 'CANCELLED']),
  partyId: salesId.optional(),
  deliveryNoteId: salesId.optional(),
  from: salesDate.optional(),
  to: salesDate.optional(),
  limit: salesQueryLimit,
}).strict()

// Exported for service-level guards and tests; no calculation uses a rate value
// from a client or a hardcoded constant.
export const SALES_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const SALES_MONEY_FIELDS = ['subtotalCents', 'taxCents', 'totalCents']

// ------------------------------------------------------------ phase 8 inventory
//
// Inventory keeps all money in integer cents and all dates as strict
// YYYY-MM-DD strings. Quantities are positive floats rounded to three decimals
// once at the service boundary. Write schemas are strict so a client cannot
// smuggle companyId, status or calculated value columns into a tenant-scoped
// write. Free text is checked through the shared DLP inspector.

const inventoryId = z.string().trim().min(1).max(80)
const inventoryDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Choose a valid date')
const inventoryOptionalDate = inventoryDate.nullable().optional()
const inventoryQty = z.number().finite().positive('Quantity must be greater than zero').max(1_000_000)
const inventoryMoney = z.number().int().nonnegative()
const inventoryMoneyPositive = z.number().int().positive()
const inventoryLimit = z.coerce.number().int().min(1).max(200).default(50)
const inventoryClassification = classificationSchema.default('INTERNAL')
const inventoryCode = z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/, 'Use lowercase letters, numbers, _ or -')
const inventoryReference = z.string().trim().max(80).optional().or(z.literal(''))

const inventoryItemBase = z.object({
  code: inventoryCode,
  name: dlpSafeText(160),
  type: z.enum(['RAW_MATERIAL', 'PACKAGING', 'FINISHED_GOOD', 'CONSUMABLE', 'SPARE_PART']),
  unit: z.enum(['EA', 'BOX', 'CARTON', 'KG', 'G', 'L', 'ML', 'TAB', 'VIAL', 'BOTTLE']).default('EA'),
  standardCostCents: inventoryMoney.default(0),
  reorderLevel: z.number().finite().min(0).max(1_000_000).default(0),
  trackBatches: z.boolean().default(true),
  isActive: z.boolean().default(true),
  description: dlpSafeText(500).optional().or(z.literal('')),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

export const inventoryItemCreateSchema = inventoryItemBase
export const inventoryItemUpdateSchema = inventoryItemBase.partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const inventoryWarehouseBase = z.object({
  code: inventoryCode,
  name: dlpSafeText(160),
  location: dlpSafeText(300).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

export const inventoryWarehouseCreateSchema = inventoryWarehouseBase
export const inventoryWarehouseUpdateSchema = inventoryWarehouseBase.partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

const inventoryBatchBase = z.object({
  itemId: inventoryId,
  batchNumber: dlpSafeText(80),
  status: z.enum(['QUARANTINE', 'RELEASED', 'EXPIRED', 'RECALLED']).default('QUARANTINE'),
  unitCostCents: inventoryMoney.default(0),
  manufactureDate: inventoryOptionalDate,
  expiryDate: inventoryOptionalDate,
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

export const inventoryBatchCreateSchema = inventoryBatchBase
export const inventoryBatchUpdateSchema = inventoryBatchBase.partial().strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const inventoryReceiptSchema = z.object({
  itemId: inventoryId,
  warehouseId: inventoryId,
  batchId: inventoryId.nullable().optional(),
  quantity: inventoryQty,
  unitCostCents: inventoryMoneyPositive,
  movementDate: inventoryDate,
  movementType: z.enum(['RECEIPT', 'RETURN_IN', 'PRODUCTION_RECEIPT']).default('RECEIPT'),
  referenceType: inventoryReference,
  referenceId: inventoryReference,
  notes: dlpSafeText(1000).optional().or(z.literal('')),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

export const inventoryIssueSchema = z.object({
  itemId: inventoryId,
  warehouseId: inventoryId,
  batchId: inventoryId.nullable().optional(),
  quantity: inventoryQty,
  movementDate: inventoryDate,
  movementType: z.enum(['ISSUE', 'RETURN_OUT', 'PRODUCTION_ISSUE']).default('ISSUE'),
  referenceType: inventoryReference,
  referenceId: inventoryReference,
  notes: dlpSafeText(1000).optional().or(z.literal('')),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

export const inventoryAdjustmentSchema = z.object({
  itemId: inventoryId,
  warehouseId: inventoryId,
  batchId: inventoryId.nullable().optional(),
  direction: z.enum(['IN', 'OUT']),
  quantity: inventoryQty,
  // IN adjustments may carry a cost; OUT adjustments always use the balance cost.
  unitCostCents: inventoryMoney.optional(),
  movementDate: inventoryDate,
  reason: dlpSafeText(500),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

const inventoryTransferLineSchema = z.object({
  itemId: inventoryId,
  batchId: inventoryId.nullable().optional(),
  quantity: inventoryQty,
  position: z.number().int().min(0).max(1000).optional(),
}).strict()

export const inventoryTransferCreateSchema = z.object({
  sourceWarehouseId: inventoryId,
  destinationWarehouseId: inventoryId,
  transferDate: inventoryDate,
  lines: z.array(inventoryTransferLineSchema).min(1).max(60),
  notes: dlpSafeText(1000).optional().or(z.literal('')),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict().refine((value) => value.sourceWarehouseId !== value.destinationWarehouseId, {
  path: ['destinationWarehouseId'],
  message: 'Source and destination warehouses must differ',
})

const inventoryCountLineSchema = z.object({
  itemId: inventoryId,
  batchId: inventoryId.nullable().optional(),
  countedQty: z.number().finite().min(0).max(1_000_000),
  position: z.number().int().min(0).max(1000).optional(),
}).strict()

export const inventoryCountCreateSchema = z.object({
  warehouseId: inventoryId,
  countDate: inventoryDate,
  lines: z.array(inventoryCountLineSchema).min(1).max(200),
  notes: dlpSafeText(1000).optional().or(z.literal('')),
  branchId: inventoryId.nullable().optional(),
  classification: inventoryClassification,
}).strict()

export const inventoryCountRecordSchema = z.object({
  lines: z.array(inventoryCountLineSchema).min(1).max(200),
  notes: dlpSafeText(1000).optional().or(z.literal('')),
}).strict()

export const inventoryItemQuerySchema = z.object({
  type: z.enum(['RAW_MATERIAL', 'PACKAGING', 'FINISHED_GOOD', 'CONSUMABLE', 'SPARE_PART']).optional(),
  active: z.enum(['true', 'false']).optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryWarehouseQuerySchema = z.object({
  active: z.enum(['true', 'false']).optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryBatchQuerySchema = z.object({
  itemId: inventoryId.optional(),
  status: z.enum(['QUARANTINE', 'RELEASED', 'EXPIRED', 'RECALLED']).optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryBalanceQuerySchema = z.object({
  itemId: inventoryId.optional(),
  warehouseId: inventoryId.optional(),
  batchId: inventoryId.optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryMovementQuerySchema = z.object({
  type: z.enum([
    'RECEIPT', 'ISSUE', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT',
    'COUNT_GAIN', 'COUNT_LOSS', 'RETURN_IN', 'RETURN_OUT', 'PRODUCTION_ISSUE', 'PRODUCTION_RECEIPT',
  ]).optional(),
  itemId: inventoryId.optional(),
  warehouseId: inventoryId.optional(),
  from: inventoryDate.optional(),
  to: inventoryDate.optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryTransferQuerySchema = z.object({
  status: z.enum(['DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED']).optional(),
  from: inventoryDate.optional(),
  to: inventoryDate.optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryCountQuerySchema = z.object({
  status: z.enum(['DRAFT', 'COUNTING', 'APPROVED', 'CANCELLED']).optional(),
  warehouseId: inventoryId.optional(),
  from: inventoryDate.optional(),
  to: inventoryDate.optional(),
  limit: inventoryLimit,
}).strict()
export const inventoryAlertQuerySchema = z.object({
  warehouseId: inventoryId.optional(),
  limit: inventoryLimit,
}).strict()

export const INVENTORY_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const INVENTORY_MONEY_FIELDS = ['standardCostCents', 'unitCostCents', 'totalValueCents']

// ------------------------------------------------------------ phase 9 procurement
//
// Procurement keeps money in integer cents, dates as strict YYYY-MM-DD strings
// and quantities as positive floats. Write schemas are strict so a client cannot
// smuggle companyId, status, computed totals or a match tolerance into a
// tenant-scoped write. Free text is DLP-checked and fails closed. The only
// tolerance used anywhere is config.procurement.matchToleranceBps on the server;
// it is a business threshold, never a tax/statutory rate.

const procurementId = z.string().trim().min(1).max(80)
const procurementDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Choose a valid date')
const procurementMoney = z.number().int().positive()
const procurementQty = z.number().finite().positive('Quantity must be greater than zero').max(1_000_000)
const procurementLimit = z.coerce.number().int().min(1).max(200).default(50)
const procurementNotes = dlpSafeText(2000).optional().or(z.literal(''))
const procurementLineBase = z.object({
  itemId: procurementId,
  warehouseId: procurementId.nullable().optional(),
  description: dlpSafeText(240),
  qty: procurementQty,
  unitCostCents: procurementMoney,
}).strict()
const procurementLineList = z.array(procurementLineBase).min(1).max(60)
const optionalProcurementLineList = z.array(procurementLineBase).max(60).default([])

export const procurementRequisitionCreateSchema = z.object({
  supplierId: procurementId.nullable().optional(),
  requisitionDate: procurementDate,
  requiredDate: procurementDate.nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('KES'),
  lines: procurementLineList,
  notes: procurementNotes,
  branchId: procurementId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const procurementOrderCreateSchema = z.object({
  supplierId: procurementId.optional(),
  requisitionId: procurementId.optional(),
  orderDate: procurementDate,
  expectedDate: procurementDate.nullable().optional(),
  currency: z.string().trim().min(1).max(8).default('KES'),
  financeInvoiceId: procurementId.nullable().optional(),
  lines: optionalProcurementLineList,
  notes: procurementNotes,
  branchId: procurementId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict().superRefine((value, ctx) => {
  if (!value.requisitionId && !value.supplierId) {
    ctx.addIssue({ code: 'custom', path: ['supplierId'], message: 'supplierId is required without a requisitionId' })
  }
  if (!value.requisitionId && value.lines.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'At least one line is required without a requisitionId' })
  }
})

export const procurementReceiptCreateSchema = z.object({
  orderId: procurementId,
  receiptDate: procurementDate,
  financeInvoiceId: procurementId.nullable().optional(),
  lines: z.array(z.object({
    orderLineId: procurementId,
    qty: procurementQty,
    unitCostCents: procurementMoney.optional(),
    warehouseId: procurementId.nullable().optional(),
    batchId: procurementId.nullable().optional(),
  }).strict()).min(1).max(60),
  notes: procurementNotes,
  branchId: procurementId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const procurementReturnCreateSchema = z.object({
  orderId: procurementId,
  receiptId: procurementId.nullable().optional(),
  supplierId: procurementId.optional(),
  returnDate: procurementDate,
  reason: dlpSafeText(1000).optional().or(z.literal('')),
  currency: z.string().trim().min(1).max(8).default('KES'),
  lines: z.array(procurementLineBase.extend({
    receiptLineId: procurementId.nullable().optional(),
    batchId: procurementId.nullable().optional(),
  }).strict()).min(1).max(60),
  branchId: procurementId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const procurementMatchCreateSchema = z.object({
  orderId: procurementId,
  receiptId: procurementId.nullable().optional(),
  financeInvoiceId: procurementId.nullable().optional(),
  notes: procurementNotes,
  branchId: procurementId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

const procurementStatusQuery = (values) => z.enum(values).optional()
export const procurementRequisitionQuerySchema = z.object({
  status: procurementStatusQuery(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CONVERTED', 'CANCELLED']),
  supplierId: procurementId.optional(),
  from: procurementDate.optional(),
  to: procurementDate.optional(),
  limit: procurementLimit,
}).strict()
export const procurementOrderQuerySchema = z.object({
  status: procurementStatusQuery(['DRAFT', 'APPROVED', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']),
  supplierId: procurementId.optional(),
  requisitionId: procurementId.optional(),
  from: procurementDate.optional(),
  to: procurementDate.optional(),
  limit: procurementLimit,
}).strict()
export const procurementReceiptQuerySchema = z.object({
  status: procurementStatusQuery(['DRAFT', 'RECEIVED', 'INSPECTED', 'REJECTED', 'CANCELLED']),
  orderId: procurementId.optional(),
  from: procurementDate.optional(),
  to: procurementDate.optional(),
  limit: procurementLimit,
}).strict()
export const procurementReturnQuerySchema = z.object({
  status: procurementStatusQuery(['DRAFT', 'APPROVED', 'SENT', 'RECEIVED', 'CANCELLED']),
  orderId: procurementId.optional(),
  receiptId: procurementId.optional(),
  from: procurementDate.optional(),
  to: procurementDate.optional(),
  limit: procurementLimit,
}).strict()
export const procurementMatchQuerySchema = z.object({
  status: procurementStatusQuery(['PENDING', 'MATCHED', 'DISCREPANCY', 'APPROVED']),
  orderId: procurementId.optional(),
  limit: procurementLimit,
}).strict()

export const procurementConvertSchema = z.object({
  supplierId: procurementId,
  orderDate: procurementDate.optional(),
  notes: procurementNotes,
}).strict()

export const procurementReceiptInspectSchema = z.object({
  decision: z.enum(['ACCEPT', 'REJECT']),
  reason: dlpSafeText(1000).optional().or(z.literal('')),
}).strict()

export const procurementActionSchema = z.object({}).strict()

export const PROCUREMENT_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const PROCUREMENT_MONEY_FIELDS = [
  'unitCostCents', 'totalCents', 'subtotalCents', 'poTotalCents', 'receiptTotalCents',
  'invoiceTotalCents', 'priceVarianceCents', 'invoiceVarianceCents',
]

// ---------------------------------------------------------------- phase 10 service
//
// Service keeps money in integer cents, dates as strict YYYY-MM-DD strings and
// timestamps as ISO date-times. SLA hours are commercial targets supplied by
// the operator — never statutory or tax rates. Write schemas are strict: a
// client cannot smuggle companyId, status, SLA due dates, computed totals or a
// tax percentage into a tenant-scoped write. Free text is DLP-checked and fails
// closed.

const serviceId = z.string().trim().min(1).max(80)
const serviceDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Choose a valid date')
const serviceDateTime = z.iso.datetime()
const serviceLimit = z.coerce.number().int().min(1).max(200).default(50)
const serviceHours = z.number().int().positive().max(8760)
const serviceMoney = z.number().int().nonnegative()
const servicePositiveMoney = z.number().int().positive()
const serviceQty = z.number().finite().positive('Quantity must be greater than zero').max(1_000_000)
const serviceNotes = dlpSafeText(2000).optional().or(z.literal(''))
const serviceCurrency = z.string().trim().min(1).max(8).default('KES')

const serviceContractLineCreateSchema = z.object({
  itemId: serviceId.nullable().optional(),
  description: dlpSafeText(240),
  coverageQty: z.number().int().positive().max(100_000).default(1),
  unitPriceCents: serviceMoney,
}).strict()

const serviceWorkOrderLineCreateSchema = z.object({
  itemId: serviceId.nullable().optional(),
  description: dlpSafeText(240),
  qty: serviceQty,
  unitPriceCents: servicePositiveMoney,
}).strict()

export const serviceContractCreateSchema = z.object({
  customerId: serviceId,
  startDate: serviceDate,
  endDate: serviceDate.nullable().optional(),
  responseSlaHours: serviceHours,
  resolutionSlaHours: serviceHours,
  monthlyFeeCents: serviceMoney.default(0),
  currency: serviceCurrency,
  lines: z.array(serviceContractLineCreateSchema).min(1).max(60),
  notes: serviceNotes,
  branchId: serviceId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const serviceTicketCreateSchema = z.object({
  contractId: serviceId.optional(),
  customerId: serviceId.optional(),
  subject: dlpSafeText(220),
  description: dlpSafeText(2000).optional().or(z.literal('')),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  openedAt: serviceDateTime.optional(),
  branchId: serviceId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict().superRefine((value, ctx) => {
  if (!value.contractId && !value.customerId) {
    ctx.addIssue({ code: 'custom', path: ['customerId'], message: 'customerId is required without a contractId' })
  }
})

export const serviceTicketAssignSchema = z.object({
  assigneeId: serviceId,
}).strict()

export const serviceTicketResolveSchema = z.object({
  resolutionNotes: dlpSafeText(2000).optional().or(z.literal('')),
}).strict()

export const serviceWorkOrderCreateSchema = z.object({
  ticketId: serviceId,
  summary: dlpSafeText(240),
  technicianId: serviceId.nullable().optional(),
  scheduledAt: serviceDateTime.nullable().optional(),
  lines: z.array(serviceWorkOrderLineCreateSchema).max(60).default([]),
  notes: serviceNotes,
  branchId: serviceId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const serviceWorkOrderScheduleSchema = z.object({
  scheduledAt: serviceDateTime,
  technicianId: serviceId.nullable().optional(),
}).strict()

export const serviceWorkOrderCompleteSchema = z.object({
  notes: serviceNotes,
}).strict()

export const serviceVisitCreateSchema = z.object({
  workOrderId: serviceId,
  technicianId: serviceId.nullable().optional(),
  plannedAt: serviceDateTime,
  notes: serviceNotes,
  branchId: serviceId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const serviceVisitCheckOutSchema = z.object({
  notes: serviceNotes,
}).strict()

export const servicePartUsageCreateSchema = z.object({
  workOrderId: serviceId,
  itemId: serviceId,
  warehouseId: serviceId.nullable().optional(),
  batchId: serviceId.nullable().optional(),
  qty: serviceQty,
  unitCostCents: servicePositiveMoney,
  unitPriceCents: servicePositiveMoney.optional(),
  notes: serviceNotes,
  branchId: serviceId.nullable().optional(),
  classification: classificationSchema.default('INTERNAL'),
}).strict()

export const serviceInvoiceCreateSchema = z.object({
  issueDate: serviceDate,
  dueDate: serviceDate.nullable().optional(),
  taxRateId: serviceId.nullable().optional(),
  notes: serviceNotes,
}).strict()

const serviceStatusQuery = (values) => z.enum(values).optional()

export const serviceContractQuerySchema = z.object({
  status: serviceStatusQuery(['DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED']),
  customerId: serviceId.optional(),
  from: serviceDate.optional(),
  to: serviceDate.optional(),
  limit: serviceLimit,
}).strict()

export const serviceTicketQuerySchema = z.object({
  status: serviceStatusQuery(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED', 'CANCELLED']),
  priority: serviceStatusQuery(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  contractId: serviceId.optional(),
  assigneeId: serviceId.optional(),
  limit: serviceLimit,
}).strict()

export const serviceWorkOrderQuerySchema = z.object({
  status: serviceStatusQuery(['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  ticketId: serviceId.optional(),
  technicianId: serviceId.optional(),
  limit: serviceLimit,
}).strict()

export const serviceVisitQuerySchema = z.object({
  status: serviceStatusQuery(['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
  workOrderId: serviceId.optional(),
  technicianId: serviceId.optional(),
  limit: serviceLimit,
}).strict()

export const servicePartUsageQuerySchema = z.object({
  workOrderId: serviceId.optional(),
  itemId: serviceId.optional(),
  inventoryIssued: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  limit: serviceLimit,
}).strict()

export const serviceActionSchema = z.object({}).strict()

export const SERVICE_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const SERVICE_MONEY_FIELDS = [
  'monthlyFeeCents', 'unitPriceCents', 'labourCents', 'partsCents',
  'totalCents', 'unitCostCents',
]

// ---------------------------------------------------------------- phase 11 HR
//
// Write schemas are strict: companyId, status, verification metadata, computed
// payroll amounts and rate percentages can never be supplied by a client. Free
// text fails closed through DLP. KRA PINs are accepted only as whole-field
// identifiers and are encrypted at rest; they are never returned by a DTO.
const hrId = z.string().trim().min(1).max(80)
const hrDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Choose a valid date')
const hrDateTime = z.iso.datetime()
const hrLimit = z.coerce.number().int().min(1).max(200).default(50)
const hrMoney = z.number().int().nonnegative()
const hrPositiveMoney = z.number().int().positive()
const hrBps = z.number().int().min(0).max(1_000_000)
const hrDays = z.number().int().min(0).max(366)
const hrMinutes = z.number().int().min(0).max(1440)
const hrNotes = dlpSafeText(2000).optional().or(z.literal(''))
const hrName = dlpSafeText(120)
const hrClassification = classificationSchema.default('CONFIDENTIAL')
const hrKraPin = dlpSafeText(24, { allowWholeKraPin: true }).optional().or(z.literal(''))

export const hrEmployeeCreateSchema = z.object({
  employeeNumber: z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, _ or -'),
  firstName: hrName,
  lastName: hrName,
  email: emailSchema.nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  userId: hrId.nullable().optional(),
  branchId: hrId.nullable().optional(),
  departmentId: hrId.nullable().optional(),
  jobTitleId: hrId.nullable().optional(),
  status: z.enum(['ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']).default('PROBATION'),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'INTERN', 'CASUAL']).default('PERMANENT'),
  hiredAt: hrDate,
  annualLeaveBalanceDays: hrDays.default(0),
  bankName: dlpSafeText(120).nullable().optional(),
  bankAccount: dlpSafeText(60).nullable().optional(),
  kraPin: hrKraPin,
  notes: hrNotes,
  classification: hrClassification,
}).strict()

export const hrEmployeeUpdateSchema = z.object({
  firstName: hrName.optional(),
  lastName: hrName.optional(),
  email: emailSchema.nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  userId: hrId.nullable().optional(),
  branchId: hrId.nullable().optional(),
  departmentId: hrId.nullable().optional(),
  jobTitleId: hrId.nullable().optional(),
  status: z.enum(['ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']).optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'INTERN', 'CASUAL']).optional(),
  hiredAt: hrDate.optional(),
  terminatedAt: hrDate.nullable().optional(),
  annualLeaveBalanceDays: hrDays.optional(),
  bankName: dlpSafeText(120).nullable().optional(),
  bankAccount: dlpSafeText(60).nullable().optional(),
  kraPin: hrKraPin,
  notes: hrNotes,
  classification: classificationSchema.optional(),
}).strict()

export const hrContractCreateSchema = z.object({
  employeeId: hrId,
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'INTERN', 'CASUAL']).default('PERMANENT'),
  startDate: hrDate,
  endDate: hrDate.nullable().optional(),
  basicSalaryCents: hrPositiveMoney,
  allowancesCents: hrMoney.default(0),
  currency: z.string().trim().min(1).max(8).default('KES'),
  notes: hrNotes,
  branchId: hrId.nullable().optional(),
  classification: hrClassification,
}).strict()

export const hrContractTransitionSchema = z.object({
  status: z.enum(['ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']),
}).strict()

export const hrPayrollRateCreateSchema = z.object({
  kind: z.enum(['PAYE', 'NSSF_EMPLOYEE', 'NSSF_EMPLOYER', 'SHIF', 'HOUSING_LEVY']),
  rateBps: hrBps,
  effectiveFrom: hrDateTime,
  effectiveTo: hrDateTime.nullable().optional(),
  sourceReference: dlpSafeText(240).min(4, 'Source reference is required'),
  verificationNote: hrNotes,
  branchId: hrId.nullable().optional(),
  classification: hrClassification,
}).strict()

export const hrPayrollRateVerifySchema = z.object({
  verificationNote: dlpSafeText(500).min(5, 'Verification note is required'),
}).strict()

export const hrLeaveCreateSchema = z.object({
  employeeId: hrId,
  type: z.enum(['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE']),
  startDate: hrDate,
  endDate: hrDate,
  days: z.number().int().positive().max(366),
  reason: dlpSafeText(1000).min(3, 'Reason is required'),
  branchId: hrId.nullable().optional(),
  classification: hrClassification,
}).strict()

export const hrLeaveDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: hrNotes,
}).strict()

export const hrAttendanceUpsertSchema = z.object({
  employeeId: hrId,
  date: hrDate,
  hoursWorkedMinutes: hrMinutes.default(0),
  checkInAt: hrDateTime.nullable().optional(),
  checkOutAt: hrDateTime.nullable().optional(),
  notes: hrNotes,
  branchId: hrId.nullable().optional(),
  classification: hrClassification,
}).strict()

export const hrPayrollRunCreateSchema = z.object({
  periodStart: hrDate,
  periodEnd: hrDate,
  employeeIds: z.array(hrId).max(500).optional(),
  notes: hrNotes,
  branchId: hrId.nullable().optional(),
  classification: hrClassification,
}).strict()

export const hrActionSchema = z.object({}).strict()

export const hrEmployeeQuerySchema = z.object({
  status: z.enum(['ACTIVE', 'PROBATION', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED']).optional(),
  branchId: hrId.optional(),
  limit: hrLimit,
}).strict()

export const hrRateQuerySchema = z.object({
  kind: z.enum(['PAYE', 'NSSF_EMPLOYEE', 'NSSF_EMPLOYER', 'SHIF', 'HOUSING_LEVY']).optional(),
  status: z.enum(['UNVERIFIED', 'VERIFIED']).optional(),
  limit: hrLimit,
}).strict()

export const hrLeaveQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'TAKEN', 'CANCELLED']).optional(),
  employeeId: hrId.optional(),
  limit: hrLimit,
}).strict()

export const hrAttendanceQuerySchema = z.object({
  employeeId: hrId.optional(),
  from: hrDate.optional(),
  to: hrDate.optional(),
  limit: hrLimit,
}).strict()

export const hrPayrollRunQuerySchema = z.object({
  status: z.enum(['DRAFT', 'CALCULATED', 'APPROVED', 'POSTED', 'CANCELLED']).optional(),
  limit: hrLimit,
}).strict()

export const HR_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const HR_MONEY_FIELDS = [
  'basicSalaryCents', 'allowancesCents', 'grossCents', 'payeCents',
  'nssfEmployeeCents', 'nssfEmployerCents', 'shifCents', 'housingLevyCents',
  'deductionsCents', 'netCents', 'employerCostCents', 'rateBps',
]

// --------------------------------------------------------------- phase 12 projects
//
// Write schemas are strict: tenant IDs, actor IDs, statuses, timestamps,
// calculated time amounts, invoice links and finance usage totals can never be
// supplied by a client. Hours are numeric and rounded once to two decimals at
// the service boundary; all money remains safe integer cents. Free text fails
// closed through the shared DLP inspector and reports finding types only.
const projectId = z.string().trim().min(1).max(80)
const projectNumber = z.string().trim().min(2).max(60).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, _ or -')
const projectDate = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD format')
  .refine(isValidIsoDate, 'Choose a valid date')
const projectLimit = z.coerce.number().int().min(1).max(200).default(50)
const projectMoney = z.number().int().nonnegative()
const projectHours = z.number().positive().max(1000)
const projectText = dlpSafeText(2000).optional().or(z.literal(''))
const projectClassification = classificationSchema.default('INTERNAL')
const projectStatus = z.enum(['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'])
const projectTaskStatus = z.enum(['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'])
const projectMilestoneStatus = z.enum(['PLANNED', 'IN_PROGRESS', 'MET', 'MISSED'])

export const projectCreateSchema = z.object({
  number: projectNumber.optional(),
  name: dlpSafeText(180).min(2),
  description: dlpSafeText(1000).optional().or(z.literal('')),
  branchId: projectId.nullable().optional(),
  customerId: projectId.nullable().optional(),
  salesOrderId: projectId.nullable().optional(),
  budgetCents: projectMoney.default(0),
  currency: z.string().trim().min(1).max(8).default('KES'),
  plannedStart: projectDate.nullable().optional(),
  plannedEnd: projectDate.nullable().optional(),
  classification: projectClassification,
}).strict()

export const projectUpdateSchema = z.object({
  number: projectNumber.optional(),
  name: dlpSafeText(180).min(2).optional(),
  description: dlpSafeText(1000).optional().or(z.literal('')),
  branchId: projectId.nullable().optional(),
  customerId: projectId.nullable().optional(),
  salesOrderId: projectId.nullable().optional(),
  budgetCents: projectMoney.optional(),
  currency: z.string().trim().min(1).max(8).optional(),
  plannedStart: projectDate.nullable().optional(),
  plannedEnd: projectDate.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const projectTransitionSchema = z.object({ status: projectStatus }).strict()

export const projectQuerySchema = z.object({
  status: projectStatus.optional(),
  branchId: projectId.optional(),
  customerId: projectId.optional(),
  limit: projectLimit,
}).strict()

export const projectMemberCreateSchema = z.object({
  userId: projectId,
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).default('MEMBER'),
  branchId: projectId.nullable().optional(),
  classification: projectClassification,
}).strict()

export const projectMemberUpdateSchema = z.object({
  role: z.enum(['OWNER', 'MANAGER', 'MEMBER', 'VIEWER']).optional(),
  leftAt: projectDate.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const projectMilestoneCreateSchema = z.object({
  number: projectNumber.optional(),
  name: dlpSafeText(180).min(2),
  description: dlpSafeText(1000).optional().or(z.literal('')),
  dueAt: projectDate.nullable().optional(),
  branchId: projectId.nullable().optional(),
  classification: projectClassification,
}).strict()

export const projectMilestoneTransitionSchema = z.object({ status: projectMilestoneStatus }).strict()

export const projectMilestoneQuerySchema = z.object({
  status: projectMilestoneStatus.optional(),
  limit: projectLimit,
}).strict()

export const projectTaskCreateSchema = z.object({
  number: projectNumber.optional(),
  title: dlpSafeText(180).min(2),
  description: dlpSafeText(1000).optional().or(z.literal('')),
  assigneeId: projectId.nullable().optional(),
  milestoneId: projectId.nullable().optional(),
  dueAt: projectDate.nullable().optional(),
  position: z.number().int().min(0).max(1_000_000).default(0),
  branchId: projectId.nullable().optional(),
  classification: projectClassification,
}).strict()

export const projectTaskUpdateSchema = z.object({
  title: dlpSafeText(180).min(2).optional(),
  description: dlpSafeText(1000).optional().or(z.literal('')),
  assigneeId: projectId.nullable().optional(),
  milestoneId: projectId.nullable().optional(),
  dueAt: projectDate.nullable().optional(),
  position: z.number().int().min(0).max(1_000_000).optional(),
  branchId: projectId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const projectTaskTransitionSchema = z.object({ status: projectTaskStatus }).strict()

export const projectTimeCreateSchema = z.object({
  number: projectNumber.optional(),
  workDate: projectDate,
  hours: projectHours,
  billable: z.boolean().default(false),
  hourlyRateCents: projectMoney.default(0),
  taskId: projectId.nullable().optional(),
  memberId: projectId.nullable().optional(),
  branchId: projectId.nullable().optional(),
  classification: projectClassification,
}).strict()

export const projectTimeDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: projectText,
}).strict()

export const projectTimeInvoiceSchema = z.object({
  description: dlpSafeText(500).min(3),
  issueDate: projectDate.optional(),
  dueDate: projectDate.nullable().optional(),
  taxRateId: projectId.nullable().optional(),
}).strict()

export const projectBudgetLinkCreateSchema = z.object({ budgetId: projectId }).strict()

export const projectTaskQuerySchema = z.object({
  status: projectTaskStatus.optional(),
  assigneeId: projectId.optional(),
  milestoneId: projectId.optional(),
  limit: projectLimit,
}).strict()

export const projectTimeQuerySchema = z.object({
  status: z.enum(['DRAFT', 'APPROVED', 'BILLED', 'REJECTED']).optional(),
  from: projectDate.optional(),
  to: projectDate.optional(),
  limit: projectLimit,
}).strict()

export const projectActionSchema = z.object({}).strict()

export const PROJECT_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const PROJECT_MONEY_FIELDS = ['budgetCents', 'hourlyRateCents', 'amountCents']

// ------------------------------------------------------------ phase 13 manufacturing
//
// GMP records use strict schemas. Batch numbers, dates and signature references
// are explicit; deviation/result notes pass through the shared DLP inspector and
// are stored encrypted. Money is integer cents and quantities are rounded to
// three decimals by the service, never by the client.

const manufacturingId = z.string().trim().min(1).max(80)
const manufacturingCode = z.string().trim().min(1).max(60)
const manufacturingName = dlpSafeText(160).min(2)
const manufacturingText = dlpSafeText(1000)
const manufacturingDate = z.string().refine(isValidIsoDate, 'Choose a valid date')
const manufacturingLimit = z.coerce.number().int().min(1).max(200).default(50)
const manufacturingMoney = z.number().int().nonnegative()
const manufacturingQuantity = z.number().positive().max(1_000_000).refine(
  (value) => Number.isFinite(value) && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6,
  'Use at most three decimal places',
)
const manufacturingClassification = classificationSchema.default('INTERNAL')

const workCenterStatus = z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE'])
const bomStatus = z.enum(['DRAFT', 'APPROVED', 'OBSOLETE'])
const productionOrderStatus = z.enum([
  'DRAFT', 'RELEASED', 'IN_PROGRESS', 'QUALITY_HOLD', 'COMPLETED', 'CANCELLED',
])
const batchRecordStatus = z.enum(['OPEN', 'IN_PROGRESS', 'REVIEW', 'RELEASED', 'REJECTED'])
const qcCheckStatus = z.enum(['PENDING', 'REVIEW', 'PASS', 'FAIL'])

const bomLineInput = z.object({
  itemId: manufacturingId,
  quantity: manufacturingQuantity,
  uom: z.string().trim().min(1).max(12).default('EA'),
  unitCostCents: manufacturingMoney,
  isCritical: z.boolean().default(false),
  sequence: z.number().int().min(0).max(1_000_000).default(0),
}).strict()

export const manufacturingWorkCenterCreateSchema = z.object({
  code: manufacturingCode.optional(),
  name: manufacturingName,
  description: manufacturingText.optional().or(z.literal('')),
  status: workCenterStatus.default('ACTIVE'),
  capacityPerDay: manufacturingQuantity.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
  classification: manufacturingClassification,
}).strict()

export const manufacturingWorkCenterUpdateSchema = z.object({
  name: manufacturingName.optional(),
  description: manufacturingText.optional().or(z.literal('')),
  status: workCenterStatus.optional(),
  capacityPerDay: manufacturingQuantity.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const manufacturingWorkCenterQuerySchema = z.object({
  status: workCenterStatus.optional(),
  limit: manufacturingLimit,
}).strict()

export const manufacturingBomCreateSchema = z.object({
  code: manufacturingCode.optional(),
  name: manufacturingName,
  productItemId: manufacturingId,
  version: manufacturingCode.default('1'),
  effectiveFrom: manufacturingDate.nullable().optional(),
  effectiveTo: manufacturingDate.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
  classification: manufacturingClassification,
  lines: z.array(bomLineInput).min(1, 'A BOM needs at least one line').max(40),
}).strict()

export const manufacturingBomUpdateSchema = z.object({
  name: manufacturingName.optional(),
  effectiveFrom: manufacturingDate.nullable().optional(),
  effectiveTo: manufacturingDate.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
  classification: classificationSchema.optional(),
  lines: z.array(bomLineInput).min(1).max(40).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const manufacturingBomTransitionSchema = z.object({ status: bomStatus }).strict()

export const manufacturingBomQuerySchema = z.object({
  status: bomStatus.optional(),
  productItemId: manufacturingId.optional(),
  limit: manufacturingLimit,
}).strict()

export const manufacturingOrderCreateSchema = z.object({
  orderNumber: manufacturingCode.optional(),
  bomId: manufacturingId,
  workCenterId: manufacturingId,
  productItemId: manufacturingId,
  quantityPlanned: manufacturingQuantity,
  uom: z.string().trim().min(1).max(12).default('EA'),
  plannedStartDate: manufacturingDate.nullable().optional(),
  plannedEndDate: manufacturingDate.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
  classification: manufacturingClassification,
}).strict()

export const manufacturingOrderUpdateSchema = z.object({
  quantityPlanned: manufacturingQuantity.optional(),
  uom: z.string().trim().min(1).max(12).optional(),
  plannedStartDate: manufacturingDate.nullable().optional(),
  plannedEndDate: manufacturingDate.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const manufacturingOrderTransitionSchema = z.object({
  status: z.enum(['RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
}).strict()

export const manufacturingOrderQuerySchema = z.object({
  status: productionOrderStatus.optional(),
  workCenterId: manufacturingId.optional(),
  limit: manufacturingLimit,
}).strict()

export const manufacturingBatchCreateSchema = z.object({
  batchNumber: manufacturingCode,
  productionOrderId: manufacturingId,
  quantityProduced: manufacturingQuantity,
  uom: z.string().trim().min(1).max(12).default('EA'),
  manufacturingDate: manufacturingDate,
  expiryDate: manufacturingDate,
  deviationNotes: manufacturingText.optional().or(z.literal('')),
  branchId: manufacturingId.nullable().optional(),
  classification: z.enum(['CONFIDENTIAL', 'RESTRICTED']).default('RESTRICTED'),
}).strict().refine(
  (value) => new Date(`${value.expiryDate}T00:00:00.000Z`) >= new Date(`${value.manufacturingDate}T00:00:00.000Z`),
  'Expiry date must not precede manufacturing date',
)

export const manufacturingBatchUpdateSchema = z.object({
  quantityProduced: manufacturingQuantity.optional(),
  manufacturingDate: manufacturingDate.optional(),
  expiryDate: manufacturingDate.optional(),
  deviationNotes: manufacturingText.optional().or(z.literal('')),
  branchId: manufacturingId.nullable().optional(),
  classification: z.enum(['CONFIDENTIAL', 'RESTRICTED']).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const manufacturingBatchTransitionSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'REVIEW', 'REJECTED']),
  reason: manufacturingText.optional().or(z.literal('')),
}).strict()

export const manufacturingBatchQuerySchema = z.object({
  status: batchRecordStatus.optional(),
  productionOrderId: manufacturingId.optional(),
  limit: manufacturingLimit,
}).strict()

export const manufacturingBatchReleaseSchema = z.object({
  warehouseId: manufacturingId,
  unitCostCents: manufacturingMoney.optional(),
  branchId: manufacturingId.nullable().optional(),
}).strict()

export const manufacturingBatchIssueLineSchema = z.object({
  orderLineId: manufacturingId,
  quantity: manufacturingQuantity,
  warehouseId: manufacturingId,
  batchId: manufacturingId.nullable().optional(),
  branchId: manufacturingId.nullable().optional(),
}).strict()

export const manufacturingBatchIssueSchema = z.object({
  lines: z.array(manufacturingBatchIssueLineSchema).min(1).max(40),
}).strict()

export const manufacturingQcCheckCreateSchema = z.object({
  checkCode: manufacturingCode,
  name: manufacturingName,
  isMandatory: z.boolean().default(true),
  observedValue: dlpSafeText(180).optional().or(z.literal('')),
  resultNotes: manufacturingText.optional().or(z.literal('')),
  branchId: manufacturingId.nullable().optional(),
  classification: classificationSchema.default('CONFIDENTIAL'),
}).strict()

export const manufacturingQcCheckUpdateSchema = z.object({
  name: manufacturingName.optional(),
  isMandatory: z.boolean().optional(),
  observedValue: dlpSafeText(180).optional().or(z.literal('')),
  resultNotes: manufacturingText.optional().or(z.literal('')),
  branchId: manufacturingId.nullable().optional(),
  classification: classificationSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field is required')

export const manufacturingQcDecisionSchema = z.object({
  decision: z.enum(['PASS', 'FAIL', 'REVIEW']),
  resultNotes: manufacturingText.optional().or(z.literal('')),
}).strict()

export const manufacturingQcQuerySchema = z.object({
  status: qcCheckStatus.optional(),
  limit: manufacturingLimit,
}).strict()

export const MANUFACTURING_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED']
export const MANUFACTURING_MONEY_FIELDS = ['standardCostCents', 'unitCostCents']
