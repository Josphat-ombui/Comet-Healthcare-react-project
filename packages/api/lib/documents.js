// Business document engine.
//
// Generates Comet Healthcare's business documents (quotations, proforma /
// tax invoices, order confirmations, CDMO agreements, NDAs, certificates of
// analysis) as branded A4 PDFs from the saved company template (letterhead).
// The `company` snapshot is stored on each document, so a PDF can always be
// re-rendered deterministically even if the template later changes.

import PDFDocument from 'pdfkit'
import { prisma } from './prisma.js'
import { localIsoDay, addDays } from './slots.js'

// ---------------------------------------------------------------- palette

const NP = '#081D3A' // primary-deeper
const PRIMARY = '#144787'
const PRIMARY_LIGHT = '#2E6BC4'
const INK = '#16213B'
const SLATE = '#55617B'
const MIST = '#C9D4E5'
const PALE = '#EEF3FB'
const BRASS = '#E0A33A'
const BRASS_LIGHT = '#EEC26A'
const BRASS_DARK = '#B88018'
const WHITE = '#FFFFFF'

const PAGE_W = 595.28 // A4 portrait (pt)
const PAGE_H = 841.89
const M = 48
const CW = PAGE_W - M * 2

// ------------------------------------------------------------ company profile

export const DEFAULT_COMPANY = {
  name: 'Comet Healthcare Pharmaceutical Ltd',
  legalName: 'Comet Healthcare Pharmaceutical Limited',
  tagline: 'GMP Certified Pharmaceutical Manufacturer',
  addressLine1: 'Plot 89, Export Processing Zone, Athi River',
  addressLine2: 'Machakos County, Kenya',
  poBox: 'P.O. Box 1000-00100, Nairobi',
  phone: '+254 725 519 844',
  email: 'info@comethealthcares.com',
  website: 'www.comethealthcares.com',
  regNo: 'Reg. No. CPR/2020/045678',
  vatReg: 'VAT Reg. P051234567L',
  ppbNo: 'PPB RE-2021-0045',
  currency: 'KES',
  taxRate: 0.16,
  footerNote:
    'This document is issued on the terms stated herein. Comet Healthcare Pharmaceutical Ltd is a GMP-certified manufacturer registered in Kenya. Subject to our standard terms & conditions of trade.',
}

export async function getCompanyProfile() {
  const setting = await prisma.setting.findUnique({ where: { key: 'company_profile' } })
  return { ...DEFAULT_COMPANY, ...(setting?.value || {}) }
}

export async function upsertCompanyProfile(profile) {
  const merged = { ...(await getCompanyProfile()), ...profile }
  await prisma.setting.upsert({
    where: { key: 'company_profile' },
    update: { value: merged },
    create: { key: 'company_profile', value: merged },
  })
  return merged
}

// ------------------------------------------------------------- document kinds

export const DOCUMENT_KINDS = {
  QUOTATION: { label: 'Quotation', financial: true, days: 30, defaultTitle: 'Quotation — Products & Services' },
  PROFORMA_INVOICE: { label: 'Proforma Invoice', financial: true, days: 7, defaultTitle: 'Proforma Invoice' },
  INVOICE: { label: 'Tax Invoice', financial: true, days: 14, defaultTitle: 'Tax Invoice' },
  ORDER_CONFIRMATION: { label: 'Order Confirmation', financial: true, days: 0, defaultTitle: 'Order Confirmation' },
  CDMO_SLA: { label: 'CDMO Service Agreement', financial: false, defaultTitle: 'CDMO Service Level Agreement' },
  NDA: { label: 'Non-Disclosure Agreement', financial: false, defaultTitle: 'Mutual Non-Disclosure Agreement' },
  COA: { label: 'Certificate of Analysis', financial: false, defaultTitle: 'Certificate of Analysis' },
}

export function documentKindList() {
  return Object.entries(DOCUMENT_KINDS).map(([kind, meta]) => ({ kind, ...meta }))
}

// ------------------------------------------------------------ number sequence

export async function nextDocumentNumber(kind) {
  return prisma.$transaction(async (tx) => {
    const key = `doc_seq_${kind}`
    const setting = await tx.setting.upsert({ where: { key }, update: {}, create: { key, value: 0 } })
    const next = Number(setting.value || 0) + 1
    await tx.setting.update({ where: { key }, data: { value: next } })
    const prefix = kind === 'PROFORMA_INVOICE' ? 'PFI' : kind === 'ORDER_CONFIRMATION' ? 'ORD' : kind === 'CDMO_SLA' ? 'SLA' : kind === 'NDA' ? 'NDA' : kind === 'COA' ? 'COA' : kind === 'INVOICE' ? 'INV' : 'QUO'
    return `${prefix}-${new Date().getFullYear()}-${String(next).padStart(4, '0')}`
  })
}

// ------------------------------------------------------------ value helpers

export function computeLine(line) {
  const qty = Number(line.qty || 0)
  const unitPrice = Number(line.unitPrice || 0)
  const amount = Math.round(qty * unitPrice * 100) / 100
  return { ...line, qty, unitPrice, amount }
}

export function computeTotals(items, taxRate) {
  const subtotal = items.reduce((sum, it) => sum + Number(it.amount || 0), 0)
  const tax = Math.round(subtotal * Number(taxRate || 0) * 100) / 100
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 }
}

function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = `${iso}`.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function money(amount, currency = 'KES') {
  return `${currency} ${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function ensureSpace(pdf, y, needed = 70) {
  if (y > PAGE_H - M - needed - 18) {
    pdf.addPage()
    return M
  }
  return y
}

// ============================================================== PDF template

function drawHeader(pdf, company) {
  const tileX = M
  const tileY = 40
  const size = 54
  const cx = tileX + size / 2
  const cy = tileY + size / 2
  const rr = 13

  const tileGrad = pdf.linearGradient(tileX, tileY, tileX + size, tileY + size)
  tileGrad.stop(0, NP).stop(1, PRIMARY_LIGHT)
  pdf.save()
  pdf.roundedRect(tileX, tileY, size, size, 12)
  pdf.fill(tileGrad)

  // white crescent "C" opening to the right
  pdf.lineWidth(4).strokeColor(WHITE)
  pdf.arc(cx, cy, rr, -Math.PI / 2, Math.PI / 2, true)
  pdf.stroke()

  // brass comet tail sweeping through the opening
  const tailGrad = pdf.linearGradient(tileX, tileY + size, tileX + size, tileY)
  tailGrad.stop(0, BRASS).stop(1, BRASS_LIGHT)
  pdf.lineWidth(3)
  pdf.moveTo(cx + rr * 0.42, cy - rr * 0.6)
  pdf.quadraticCurveTo(cx + rr + 7, cy, cx + rr * 0.42, cy + rr * 0.6)
  pdf.stroke(tailGrad)
  pdf.circle(cx + rr + 5.5, cy, 2.6).fill(BRASS_LIGHT)
  pdf.circle(cx + rr + 4.8, cy - 0.9, 0.9).fill(WHITE)

  // sparkle
  pdf.lineWidth(1).strokeColor(BRASS)
  pdf.moveTo(tileX + 6, tileY + 7).lineTo(tileX + 9.5, tileY + 9.5).stroke()
  pdf.moveTo(tileX + 9.5, tileY + 7).lineTo(tileX + 6, tileY + 9.5).stroke()
  pdf.restore()

  // wordmark
  pdf.font('Times-Bold', 23).fillColor(PRIMARY)
  pdf.text('Comet', tileX + size + 16, tileY - 3)
  pdf.font('Helvetica-Bold', 7.5).fillColor(BRASS_DARK)
  pdf.text('HEALTHCARE', tileX + size + 16, tileY + 25, { characterSpacing: 0.3 })

  // right-hand address block
  const rightX = M + CW - 210
  const lines = [
    company.name,
    company.tagline,
    company.addressLine1,
    company.addressLine2,
    company.poBox,
    `${company.phone}  ·  ${company.email}`,
    company.regNo,
    `PPB No: ${company.ppbNo}`,
  ].filter(Boolean)
  pdf.font('Helvetica-Bold', 9).fillColor(PRIMARY)
  pdf.text(company.name, rightX, tileY - 3, { width: 226, align: 'right' })
  pdf.font('Helvetica', 7.5).fillColor(SLATE)
  pdf.text(lines.slice(1).join('\n'), rightX, tileY + 12, { width: 226, align: 'right', lineGap: 1.6 })

  // divider + brass accent
  const yLine = tileY + size + 16
  pdf.lineWidth(1).strokeColor(MIST)
  pdf.moveTo(M, yLine).lineTo(PAGE_W - M, yLine).stroke()
  pdf.lineWidth(1.6).strokeColor(BRASS)
  pdf.moveTo(M, yLine - 2.6).lineTo(M + 48, yLine - 2.6).stroke()
  return yLine + 16
}

function statusChip(pdf, status) {
  const color = status === 'DRAFT' ? SLATE : status === 'VOID' ? '#C0392B' : '#1D7A3A'
  const label = status
  pdf.font('Helvetica-Bold', 7).fillColor(color)
  const w = pdf.widthOfString(label) + 16
  pdf.save()
  pdf.roundedRect(PAGE_W - M - w, 112, w, 15, 7.5)
  pdf.fill(color)
  pdf.fillColor(WHITE)
  pdf.text(label, PAGE_W - M - w, 115.5, { width: w, align: 'center' })
  pdf.restore()
}

function drawTitleBlock(pdf, document, kind) {
  const y = 132
  pdf.font('Helvetica-Bold', 14).fillColor(PRIMARY)
  pdf.text(kind.label, M, y)
  pdf.font('Helvetica-Bold', 9).fillColor(INK)
  pdf.text(document.number, M, y + 1, { width: CW - 120, align: 'right' })
  pdf.font('Helvetica-Bold', 7.5).fillColor(SLATE)
  pdf.text(document.title, M, y + 17, { width: CW - 120 })
  statusChip(pdf, document.status)
  pdf.font('Helvetica', 7.5).fillColor(SLATE)
  pdf.text(`Issued ${fmtDate(document.issueDate)} · ${document.currency}`, M, y + 15, { width: CW, align: 'right' })
  return y + 40
}

function drawParties(pdf, document, y) {
  const w = CW / 2 - 8
  const rx = M + w + 16

  pdf.font('Helvetica-Bold', 7.5).fillColor(SLATE)
  pdf.text('PREPARED FOR', M, y, { characterSpacing: 0.35 })
  pdf.font('Helvetica-Bold', 10).fillColor(INK)
  pdf.text(document.clientCompany || document.clientName, M, y + 13, { width: w, lineGap: 2 })
  pdf.font('Helvetica', 8.5).fillColor(SLATE)
  pdf.text(`Attn: ${document.clientName}`, M, y + 36, { width: w })
  pdf.text([document.clientEmail, document.clientPhone].filter(Boolean).join(' · '), M, y + 48, { width: w })

  pdf.font('Helvetica-Bold', 7.5).fillColor(SLATE)
  pdf.text('REFERENCE', rx, y, { characterSpacing: 0.35 })
  const meta = [
    ['Document No.', document.number],
    ['Issue date', fmtDate(document.issueDate)],
    ['Due date', fmtDate(document.dueDate)],
    ['Valid until', fmtDate(document.validUntil)],
  ]
  let my = y + 13
  for (const [label, value] of meta) {
    if (!value || value === '—') continue
    pdf.font('Helvetica', 8.5).fillColor(SLATE)
    pdf.text(label, rx, my, { width: 86 })
    pdf.font('Helvetica-Bold', 8.5).fillColor(INK)
    pdf.text(value, rx + 92, my, { width: w - 92 })
    my += 12.5
  }
  return y + Math.max(64, meta.filter(([, v]) => v && v !== '—').length * 12.5 + 20)
}

// ------------------------------------------------------------------- tables

function drawTableHeader(pdf, cols, y) {
  const rowH = 22
  pdf.save()
  pdf.roundedRect(M, y, CW, rowH, 3).fill(NP)
  pdf.font('Helvetica-Bold', 7.5).fillColor(WHITE)
  for (const col of cols) {
    if (col.label !== '') {
      pdf.text(col.label, col.x, y + 7, { width: col.width, align: col.align || 'left' })
    }
  }
  pdf.restore()
  return y + rowH
}

function drawTableRow(pdf, cols, y, shade) {
  pdf.save()
  pdf.rect(M, y, CW, 1).fillColor(MIST).fill()
  pdf.restore()
  pdf.font('Helvetica', 8.5).fillColor(INK)
  for (const col of cols) {
    if (col.value === '') continue
    pdf.text(col.value, col.x, y + 5, { width: col.width, align: col.align || 'left' })
  }
  return y + 24
}

function drawItemsTable(pdf, document, data, y) {
  const cols = [
    { label: '#', width: 22, x: M, align: 'center' },
    { label: 'Description', width: 268, x: M + 26 },
    { label: 'Qty', width: 52, x: M + 296, align: 'right' },
    { label: 'Unit', width: 76, x: M + 352, align: 'right' },
    { label: 'Amount', width: 70, x: M + 429, align: 'right' },
  ]
  y = drawTableHeader(pdf, cols, y)
  const items = (data.items || []).map(computeLine)
  items.forEach((item, i) => {
    const cellCols = [
      { value: `${i + 1}`, width: 22, x: M, align: 'center' },
      { value: item.description, width: 268, x: M + 26 },
      { value: `${item.qty}`, width: 52, x: M + 296, align: 'right' },
      { value: money(item.unitPrice, document.currency), width: 76, x: M + 352, align: 'right' },
      { value: money(item.amount, document.currency), width: 70, x: M + 429, align: 'right' },
    ]
    y = drawTableRow(pdf, cellCols, y, i % 2 === 1)
  })

  // totals
  const totals = computeTotals(items, document.taxRate)
  const tx = M + CW - 210
  const totalRows = [
    ['Subtotal', money(totals.subtotal, document.currency), false],
    [`VAT (${Math.round(document.taxRate * 100)}%)`, money(totals.tax, document.currency), false],
    ['Total', money(totals.total, document.currency), true],
  ]
  let ty = y + 6
  for (const [label, value, strong] of totalRows) {
    if (strong) {
      pdf.save()
      pdf.rect(tx - 8, ty - 4, 218, 20).fillColor(BRASS_LIGHT).fill()
      pdf.font('Helvetica-Bold', 9).fillColor(NP)
      pdf.font('Helvetica-Bold', 9)
      pdf.text(label, tx, ty + 1, { width: 100 })
      pdf.text(value, tx + 100, ty + 1, { width: 100, align: 'right' })
      pdf.restore()
      ty += 24
    } else {
      pdf.font('Helvetica', 8.5).fillColor(SLATE)
      pdf.text(label, tx, ty, { width: 100 })
      pdf.font('Helvetica-Bold', 8.5).fillColor(INK)
      pdf.text(value, tx + 100, ty, { width: 100, align: 'right' })
      ty += 15
    }
  }
  pdf.font('Helvetica', 7).fillColor(SLATE)
  pdf.text(`${document.currency} 1 = Kenya Shilling`, M, ty + 2, { width: 210 })
  return ty + 10
}

function drawNotes(pdf, document, kind, y) {
  const extras = {
    QUOTATION: `Prices valid until ${fmtDate(document.validUntil) || 'the stated date'}. A 50% pro-forma deposit confirms the order; balance is due before dispatch.`,
    PROFORMA_INVOICE: `Payment is due within ${kind.days} days of the issue date. This proforma becomes void when the tax invoice is issued.`,
    INVOICE: `Payment is due by ${fmtDate(document.dueDate) || `within ${kind.days} days of the issue date`}. EFT details are provided on request.`,
    ORDER_CONFIRMATION: 'Payment terms per the agreed supply contract.',
  }[document.kind]

  const body = [document.notes, extras, 'This document is electronically generated by Comet Healthcare and is valid without a wet signature.']
    .filter(Boolean)
    .join('\n\n')

  pdf.font('Helvetica-Bold', 9).fillColor(PRIMARY)
  pdf.text('NOTES & TERMS', M, y, { characterSpacing: 0.3 })
  pdf.font('Helvetica', 8.5).fillColor(SLATE)
  pdf.text(body, M, y + 13, { width: CW, lineGap: 2.5 })
  return y + 13 + pdf.heightOfString(body, { width: CW, lineGap: 2.5 }) + 6
}

function drawClauses(pdf, document, data, company, y) {
  const intro = `This ${DOCUMENT_KINDS[document.kind].label} ("Agreement") is entered into on ${fmtDate(document.issueDate)} by and between ${company.legalName} ("Comet"), a company registered in Kenya with registered offices at ${company.addressLine1}, ${company.addressLine2}, and ${document.clientCompany || document.clientName} ("Client"), of the particulars stated on this document.`
  pdf.font('Helvetica', 8.5).fillColor(SLATE)
  pdf.text(intro, M, y, { width: CW, lineGap: 2.5, align: 'justify' })
  y += pdf.heightOfString(intro, { width: CW, lineGap: 2.5 }) + 14

  const clauses = data.clauses || []
  for (let i = 0; i < clauses.length; i += 1) {
    const clause = clauses[i]
    y = ensureSpace(pdf, y, 60)
    pdf.font('Helvetica-Bold', 9).fillColor(PRIMARY)
    pdf.text(`${i + 1}.  ${clause.title}`, M, y)
    pdf.font('Helvetica', 8.5).fillColor(INK)
    pdf.text(clause.body, M, y + 13, { width: CW, lineGap: 2.5, align: 'justify' })
    const h = pdf.heightOfString(clause.body, { width: CW, lineGap: 2.5 })
    y += 13 + h + 8
  }
  return y
}

function drawProductInfo(pdf, productInfo, y) {
  const rows = [
    ['Product', productInfo.product],
    ['Dosage form', productInfo.dosageForm],
    ['Batch No.', productInfo.batch],
    ['Manufacturing date', fmtDate(productInfo.manufacturingDate)],
    ['Expiry date', fmtDate(productInfo.expiryDate)],
    ['Storage', productInfo.storage],
  ]
  pdf.font('Helvetica-Bold', 7.5).fillColor(SLATE)
  pdf.text('PRODUCT DETAILS', M, y, { characterSpacing: 0.3 })
  const start = y + 12
  rows.forEach(([label, value], i) => {
    if (!value || value === '—') return
    const col = i % 2
    const x = M + col * (CW / 2)
    const yy = start + Math.floor(i / 2) * 24
    pdf.font('Helvetica', 8).fillColor(SLATE)
    pdf.text(label, x, yy, { width: 100 })
    pdf.font('Helvetica-Bold', 8.5).fillColor(INK)
    pdf.text(value, x + 104, yy, { width: CW / 2 - 120 })
  })
  return start + Math.ceil(rows.filter(([, v]) => v && v !== '—').length / 2) * 24
}

function drawCoatable(pdf, document, data, y) {
  if (data.productInfo) y = drawProductInfo(pdf, data.productInfo, y) + 14
  const params = data.params || []
  const cols = [
    { label: 'Parameter', width: 148, x: M, align: 'left' },
    { label: 'Test method', width: 88, x: M + 152, align: 'left' },
    { label: 'Result', width: 92, x: M + 244, align: 'left' },
    { label: 'Specification limit', width: 102, x: M + 340, align: 'left' },
    { label: 'Status', width: 55, x: M + 446, align: 'center' },
  ]
  y = drawTableHeader(pdf, cols, y)
  params.forEach((p) => {
    const cellCols = [
      { value: p.parameter, width: 148, x: M },
      { value: p.method || '—', width: 88, x: M + 152 },
      { value: p.result, width: 92, x: M + 244 },
      { value: p.limit, width: 102, x: M + 340 },
      { value: p.status || 'PASS', width: 55, x: M + 446, align: 'center' },
    ]
    y = drawTableRow(pdf, cellCols, y, false)
  })
  return y + 8
}

function drawSignatures(pdf, document, y) {
  const w = CW / 2 - 10
  const blocks = [
    { party: 'For and on behalf of Comet Healthcare Pharmaceutical Limited', who: 'Comet Authorised Signatory' },
    { party: `For and on behalf of ${document.clientCompany || document.clientName}`, who: 'Client Authorised Signatory' },
  ]
  for (let i = 0; i < blocks.length; i += 1) {
    const x = M + i * (w + 20)
    pdf.font('Helvetica-Bold', 8.5).fillColor(PRIMARY)
    pdf.text(blocks[i].party, x, y, { width: w })
    pdf.font('Helvetica', 8).fillColor(SLATE)
    pdf.text(blocks[i].who, x, y + 14, { width: w })
    pdf.save()
    pdf.rect(x, y + 62, w, 0).moveTo(x, y + 62).lineTo(x + w, y + 62).lineWidth(0.8).strokeColor(SLATE).stroke()
    for (let l = 0; l < 3; l += 1) {
      const yy = y + 82 + l * 16
      pdf.moveTo(x, yy).lineTo(x + 62, yy).lineWidth(0.6).strokeColor(MIST).stroke()
      pdf.font('Helvetica', 7).fillColor(SLATE)
      pdf.text(['Name', 'Signature', 'Date'][l], x + 66, yy - 3)
    }
    pdf.restore()
  }
  return y + 140
}

// ---------------------------------------------------------------- renderer

export function renderBusinessDocumentPdf(document) {
  const company = { ...DEFAULT_COMPANY, ...(document.company || {}) }
  const kind = DOCUMENT_KINDS[document.kind] || DOCUMENT_KINDS.QUOTATION
  const data = document.data || {}

  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: 'A4',
      margin: M,
      bufferPages: true,
      info: { Title: `${kind.label} ${document.number}`, Author: company.name, Subject: document.title || kind.label },
    })
    const chunks = []
    pdf.on('data', (c) => chunks.push(c))
    pdf.on('end', () => resolve(Buffer.concat(chunks)))
    pdf.on('error', reject)

    let y = drawHeader(pdf, company)
    y = drawTitleBlock(pdf, document, kind)
    y = drawParties(pdf, document, y)
    y = ensureSpace(pdf, y, 120)

    if (kind.financial) {
      y = drawItemsTable(pdf, document, data, y)
      y = ensureSpace(pdf, y, 90)
      y = drawNotes(pdf, document, kind, y)
    } else if (document.kind === 'COA') {
      y = drawCoatable(pdf, document, data, y)
      y = ensureSpace(pdf, y, 60)
      if (document.notes) {
        pdf.font('Helvetica', 8).fillColor(SLATE)
        pdf.text(`Notes: ${document.notes}`, M, y, { width: CW, lineGap: 2 })
      }
    } else {
      y = drawClauses(pdf, document, data, company, y)
      y = ensureSpace(pdf, y, 160)
      y = drawSignatures(pdf, document, y)
    }

    // footers for every produced page
    const range = pdf.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i += 1) {
      pdf.switchToPage(i)
      const fy = PAGE_H - 34
      pdf.lineWidth(0.6).strokeColor(MIST)
      pdf.moveTo(M, fy).lineTo(PAGE_W - M, fy).stroke()
      pdf.font('Helvetica', 7).fillColor(SLATE)
      pdf.text(
        `${company.legalName} · ${company.addressLine1}, ${company.addressLine2} · ${company.phone} · ${company.email} · ${company.website}`,
        M,
        fy + 7,
        { width: CW, lineGap: 1.5 }
      )
      pdf.text(`Page ${i + 1} of ${range.count} · ${kind.label} ${document.number}`, M, fy + 16, { width: CW, align: 'right' })
    }

    pdf.end()
  })
}

// ----------------------------------------------------------------- helpers

export function toPublicDocument(doc) {
  return {
    id: doc.id,
    number: doc.number,
    kind: doc.kind,
    title: doc.title,
    status: doc.status,
    currency: doc.currency,
    taxRate: doc.taxRate,
    issueDate: doc.issueDate,
    dueDate: doc.dueDate,
    validUntil: doc.validUntil,
    clientName: doc.clientName,
    clientCompany: doc.clientCompany,
    clientEmail: doc.clientEmail,
    clientPhone: doc.clientPhone,
    notes: doc.notes,
    subtotal: doc.subtotal,
    tax: doc.tax,
    total: doc.total,
    data: doc.data,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    createdBy: doc.createdBy
      ? { id: doc.createdBy.id, firstName: doc.createdBy.firstName, lastName: doc.createdBy.lastName }
      : null,
  }
}