// eTIMS payload builder.
//
// The payload is provider-agnostic: no KRA endpoint, gateway credential, or
// plaintext PIN ever enters it. PINs are already encrypted at rest on parties;
// company registration values are encrypted on the way out. `options` allows
// callers (and unit tests) to inject loaded data instead of hitting the DB.

import { config } from './config.js'
import { db } from './tenant.js'
import { getCompanyProfile } from './documents.js'
import { encryptString } from './crypto.js'

function financeConfig() {
  return config.finance || {}
}

/** Format integer cents for an external payload. Never used for calculations. */
function decimal(cents) {
  const value = Number(cents || 0)
  return Number((Math.round(value) / 100).toFixed(2))
}

function isDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function isoDay(value) {
  if (isDate(value)) return value.toISOString().slice(0, 10)
  return value == null ? null : String(value)
}

async function loadLines(invoice, options) {
  if (Array.isArray(options.lines)) return options.lines
  if (Array.isArray(invoice.lines)) return invoice.lines
  if (!invoice.companyId || !invoice.id) return []
  return db.financeInvoiceLine.findMany({
    where: { companyId: invoice.companyId, invoiceId: invoice.id },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
  })
}

async function loadParty(invoice, options) {
  if (options.party !== undefined) return options.party
  if (invoice.party) return invoice.party
  if (!invoice.companyId || !invoice.partyId) return null
  return db.financeParty.findFirst({
    where: { companyId: invoice.companyId, id: invoice.partyId },
    select: { type: true, name: true, taxPinCiphertext: true, currency: true },
  })
}

async function loadTaxRate(invoice, options) {
  if (options.taxRate !== undefined) return options.taxRate
  if (invoice.taxRate) return invoice.taxRate
  if (!invoice.companyId || !invoice.taxRateId) return null
  return db.statutoryRate.findFirst({
    where: { companyId: invoice.companyId, id: invoice.taxRateId },
  })
}

async function loadCompanyProfile(options) {
  if (options.companyProfile) return options.companyProfile
  return getCompanyProfile()
}

/**
 * Build the provider-agnostic eTIMS payload for an invoice.
 *
 * Injected options (lines, party, taxRate, companyProfile, encrypt) are used as
 * supplied; otherwise the tenant `db` and saved company profile are consulted.
 * No plaintext tax PIN, company ID or internal record ID is emitted.
 */
export async function buildEtimsPayload(invoice, options = {}) {
  if (!invoice || !invoice.id) throw new Error('An invoice is required to build an eTIMS payload')

  const [lines, party, taxRate, profile] = await Promise.all([
    loadLines(invoice, options),
    loadParty(invoice, options),
    loadTaxRate(invoice, options),
    loadCompanyProfile(options),
  ])

  const encrypt = typeof options.encrypt === 'function' ? options.encrypt : encryptString
  const rateBps = Number(options.rateBps ?? taxRate?.rateBps ?? invoice.rateBps ?? 0)
  const companyPin = profile?.vatReg || profile?.taxPin || profile?.pin || profile?.ref || ''
  const companyPinRef = companyPin ? encrypt(companyPin) : null
  // Party PINs are already encrypted at rest; never decrypt them for a payload.
  const partyPinRef = party?.taxPinCiphertext || party?.taxPinRef || null
  const isSales = invoice.direction === 'SALES'

  const payloadLines = (lines || []).map((line) => ({
    description: String(line.description || '').slice(0, 240),
    qty: Number(line.qty || 0),
    unitPrice: decimal(line.unitPriceCents),
    vatRate: rateBps / 10_000,
    netAmount: decimal(line.netCents),
    vatAmount: decimal(line.taxCents),
    grossAmount: decimal(line.grossCents),
  }))

  const netCents = invoice.netCents ?? invoice.subtotalCents ?? payloadLines.reduce((sum, line) => sum + Math.round(line.netAmount * 100), 0)
  const taxCents = invoice.taxCents ?? payloadLines.reduce((sum, line) => sum + Math.round(line.vatAmount * 100), 0)
  const grossCents = invoice.totalCents ?? payloadLines.reduce((sum, line) => sum + Math.round(line.grossAmount * 100), 0)

  return {
    schemaVersion: options.payloadVersion || financeConfig().etimsPayloadVersion || '1.0',
    provider: options.provider || financeConfig().etimsProvider || 'KRA_ETIMS',
    documentType: invoice.type === 'CREDIT_NOTE' ? 'CreditNote' : 'Invoice',
    supplierPinRef: isSales ? companyPinRef : partyPinRef,
    buyerPinRef: isSales ? partyPinRef : companyPinRef,
    invoiceNumber: invoice.number,
    issueDate: isoDay(invoice.issueDate),
    currency: invoice.currency || 'KES',
    taxInclusive: Boolean(invoice.taxInclusive),
    lines: payloadLines,
    totals: {
      net: decimal(netCents),
      vat: decimal(taxCents),
      gross: decimal(grossCents),
    },
    classification: invoice.classification || 'INTERNAL',
  }
}

export default buildEtimsPayload
