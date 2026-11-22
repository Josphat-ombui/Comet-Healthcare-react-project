// Zod schemas for every request body. Server-side validation is the single
// source of truth; the frontend mirrors these messages for UX.

import { z } from 'zod'
import { isValidIsoDate, isValidIsoTime, isPastDate, addDays, localIsoDay } from './slots.js'

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