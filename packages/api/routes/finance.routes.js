// Phase 6 finance HTTP surface. Routes only validate, authorise and audit;
// every state transition lives in lib/finance.js.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  financeAccountSchema, financePartySchema, financeJournalSchema,
  financeRateSchema, financeRateVerifySchema, financeInvoiceSchema,
  financeInvoiceIssueSchema, financePaymentSchema, financeBudgetSchema,
  financeAccountQuerySchema, financePartyQuerySchema, financeRateQuerySchema,
  financeJournalQuerySchema, financeInvoiceQuerySchema, financePaymentQuerySchema,
  financeBudgetQuerySchema, financeStatementQuerySchema, financeEtimsQuerySchema,
} from '../lib/validation.js'
import {
  listAccounts, createAccount,
  listParties, createParty,
  listStatutoryRates, createStatutoryRate, verifyStatutoryRate,
  listJournals, createJournal, postJournal, reverseJournal, getJournal,
  listInvoices, createInvoice, issueInvoice, getInvoice,
  listPayments, createPayment, getPayment,
  listBudgets, createBudget, approveBudget, getBudget, getBudgetUsage,
  getStatement,
  listEtimsSubmissions, getEtimsSubmission, retryEtimsSubmission, getEtimsPayload,
} from '../lib/finance.js'

export const financeRouter = Router()

financeRouter.use(requireAuth)

function actor(req) {
  return {
    userId: req.auth.userId,
    companyId: req.auth.companyId,
    branchId: req.auth.branchId,
    roles: req.auth.roles,
    correlationId: req.correlationId,
    req,
  }
}

/** Read-only audits deliberately carry an action and IDs only. */
async function auditRead(req, action, resourceType, resourceId) {
  return recordRequestAudit(req, {
    action,
    resourceType,
    resourceId: String(resourceId),
    metadata: { classification: 'INTERNAL' },
  })
}

// ---------------------------------------------------------------- accounts

financeRouter.get('/accounts', requirePermission('finance.account.read'), async (req, res) => {
  const query = financeAccountQuerySchema.parse(req.query)
  return res.json({ accounts: await listAccounts(query) })
})

financeRouter.post('/accounts', requirePermission('finance.account.write'), async (req, res) => {
  const body = financeAccountSchema.parse(req.body)
  return res.status(201).json({ account: await createAccount(body, actor(req)) })
})

// ----------------------------------------------------------------- parties

financeRouter.get('/parties', requirePermission('finance.party.read'), async (req, res) => {
  const query = financePartyQuerySchema.parse(req.query)
  return res.json({ parties: await listParties(query) })
})

financeRouter.post('/parties', requirePermission('finance.party.write'), async (req, res) => {
  const body = financePartySchema.parse(req.body)
  return res.status(201).json({ party: await createParty(body, actor(req)) })
})

// ----------------------------------------------------------- statutory rates

financeRouter.get('/statutory-rates', requirePermission('finance.statutory.read'), async (req, res) => {
  const query = financeRateQuerySchema.parse(req.query)
  return res.json({ rates: await listStatutoryRates(query) })
})

financeRouter.post('/statutory-rates', requirePermission('finance.statutory.write'), async (req, res) => {
  const body = financeRateSchema.parse(req.body)
  return res.status(201).json({ rate: await createStatutoryRate(body, actor(req)) })
})

financeRouter.post('/statutory-rates/:id/verify', requirePermission('finance.statutory.verify'), async (req, res) => {
  const body = financeRateVerifySchema.parse(req.body)
  return res.json({ rate: await verifyStatutoryRate(req.params.id, body, actor(req)) })
})

// ----------------------------------------------------------------- journals

financeRouter.get('/journals', requirePermission('finance.journal.read'), async (req, res) => {
  const query = financeJournalQuerySchema.parse(req.query)
  return res.json({ journals: await listJournals(query) })
})

financeRouter.post('/journals', requirePermission('finance.journal.write'), async (req, res) => {
  const body = financeJournalSchema.parse(req.body)
  return res.status(201).json({ journal: await createJournal(body, actor(req)) })
})

financeRouter.get('/journals/:id', requirePermission('finance.journal.read'), async (req, res) => {
  return res.json({ journal: await getJournal(req.params.id) })
})

financeRouter.post('/journals/:id/post', requirePermission('finance.journal.post'), async (req, res) => {
  return res.json({ journal: await postJournal(req.params.id, actor(req)) })
})

financeRouter.post('/journals/:id/reverse', requirePermission('finance.journal.post'), async (req, res) => {
  return res.json({ journal: await reverseJournal(req.params.id, actor(req)) })
})

// ----------------------------------------------------------------- invoices

financeRouter.get('/invoices', requirePermission('finance.invoice.read'), async (req, res) => {
  const query = financeInvoiceQuerySchema.parse(req.query)
  return res.json({ invoices: await listInvoices(query) })
})

financeRouter.post('/invoices', requirePermission('finance.invoice.write'), async (req, res) => {
  const body = financeInvoiceSchema.parse(req.body)
  return res.status(201).json({ invoice: await createInvoice(body, actor(req)) })
})

financeRouter.get('/invoices/:id', requirePermission('finance.invoice.read'), async (req, res) => {
  return res.json({ invoice: await getInvoice(req.params.id) })
})

financeRouter.post('/invoices/:id/issue', requirePermission('finance.invoice.issue'), async (req, res) => {
  const body = financeInvoiceIssueSchema.parse(req.body || {})
  return res.json({ invoice: await issueInvoice(req.params.id, body, actor(req)) })
})

// ----------------------------------------------------------------- payments

financeRouter.get('/payments', requirePermission('finance.payment.read'), async (req, res) => {
  const query = financePaymentQuerySchema.parse(req.query)
  return res.json({ payments: await listPayments(query) })
})

financeRouter.post('/payments', requirePermission('finance.payment.write'), async (req, res) => {
  const body = financePaymentSchema.parse(req.body)
  return res.status(201).json({ payment: await createPayment(body, actor(req)) })
})

financeRouter.get('/payments/:id', requirePermission('finance.payment.read'), async (req, res) => {
  return res.json({ payment: await getPayment(req.params.id) })
})

// ------------------------------------------------------------------ budgets

financeRouter.get('/budgets', requirePermission('finance.budget.read'), async (req, res) => {
  const query = financeBudgetQuerySchema.parse(req.query)
  return res.json({ budgets: await listBudgets(query) })
})

financeRouter.post('/budgets', requirePermission('finance.budget.write'), async (req, res) => {
  const body = financeBudgetSchema.parse(req.body)
  return res.status(201).json({ budget: await createBudget(body, actor(req)) })
})

financeRouter.get('/budgets/:id', requirePermission('finance.budget.read'), async (req, res) => {
  const [budget, usage] = await Promise.all([getBudget(req.params.id), getBudgetUsage(req.params.id)])
  return res.json({ budget, usage })
})

financeRouter.post('/budgets/:id/approve', requirePermission('finance.budget.write'), async (req, res) => {
  return res.json({ budget: await approveBudget(req.params.id, actor(req)) })
})

// --------------------------------------------------------------- statements

const statements = [
  ['trial-balance', 'finance.statement.read'],
  ['income', 'finance.statement.read'],
  ['balance-sheet', 'finance.statement.read'],
  ['ageing', 'finance.statement.read'],
]

for (const [kind, permission] of statements) {
  financeRouter.get(`/statements/${kind}`, requirePermission(permission), async (req, res) => {
    const query = financeStatementQuerySchema.parse(req.query)
    const result = await getStatement(kind, query)
    await auditRead(req, `finance.statement.${kind}`, 'FinanceStatement', kind)
    return res.json(result)
  })
}

// -------------------------------------------------------------------- eTIMS

financeRouter.get('/etims/submissions', requirePermission('finance.etims.read'), async (req, res) => {
  const query = financeEtimsQuerySchema.parse(req.query)
  return res.json({ submissions: await listEtimsSubmissions(query) })
})

financeRouter.get('/etims/submissions/:id', requirePermission('finance.etims.read'), async (req, res) => {
  // Payload is intentionally included only on this detail route.
  return res.json({ submission: await getEtimsSubmission(req.params.id) })
})

financeRouter.post('/etims/submissions/:id/retry', requirePermission('finance.etims.write'), async (req, res) => {
  return res.json({ submission: await retryEtimsSubmission(req.params.id, actor(req)) })
})

financeRouter.get('/etims/payload/:invoiceId', requirePermission('finance.etims.read'), async (req, res) => {
  const payload = await getEtimsPayload(req.params.invoiceId)
  await auditRead(req, 'finance.etims.payload.read', 'FinanceInvoice', req.params.invoiceId)
  return res.json({ payload })
})
