// Phase 13 manufacturing unit tests. Pure helpers, schemas, DTOs, events and
// socket routing only — no database or network calls. Cross-tenant RLS
// isolation is verified separately by the deployment probe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  calculateBomLineCostCents, calculateBomStandardCostCents, multiplyQuantities,
  manufacturingTenantWhere, assertBomTransition, assertOrderTransition,
  assertBatchTransition, assertQcTransition, assertBatchReleaseReady,
  toBomDto, toBatchDto, toQcCheckDto,
} from '../lib/manufacturing.js'
import {
  manufacturingBomCreateSchema, manufacturingBatchCreateSchema,
  manufacturingQcDecisionSchema, manufacturingBatchReleaseSchema,
  manufacturingWorkCenterCreateSchema, MANUFACTURING_MONEY_FIELDS,
} from '../lib/validation.js'
import {
  DomainEventSchemas, BomApprovedDataSchema, ProductionOrderReleasedDataSchema,
  BatchRecordOpenedDataSchema, QcCheckFailedDataSchema, BatchReleasedDataSchema,
} from '../../shared/src/events.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../shared/src/permissions.js'
import { dispatchEvent } from '../../realtime/src/events.js'

const made = new Date('2026-11-01T00:00:00.000Z')
const expiry = new Date('2027-11-01T00:00:00.000Z')

const reviewBatch = {
  id: 'bat_1',
  batchNumber: 'BAT-MFG-001',
  status: 'REVIEW',
  manufacturingDate: made,
  expiryDate: expiry,
  openedByUserId: 'usr_production',
  reviewedByUserId: 'usr_qa',
  productItemId: 'itm_fg',
}

const order = {
  id: 'ord_1',
  createdByUserId: 'usr_planner',
  releasedByUserId: 'usr_manager',
}

const passedChecks = [
  { checkCode: 'ASSAY', isMandatory: true, status: 'PASS' },
  { checkCode: 'LABEL', isMandatory: false, status: 'PASS' },
]

function assertDlpRejects(parse, type) {
  let error
  try {
    parse()
  } catch (caught) {
    error = caught
  }
  assert.ok(error, 'restricted free text was accepted')
  assert.match(error.message, new RegExp(type))
  assert.equal(error.message.includes('4111111111111111'), false)
}

const baseBatchInput = {
  batchNumber: 'BAT-DLP-001',
  productionOrderId: 'ord_1',
  quantityProduced: 10,
  manufacturingDate: '2026-11-01',
  expiryDate: '2027-11-01',
}

// ------------------------------------------------------------- money & quantity

test('BOM line cost rounds once at the integer-cent boundary', () => {
  assert.equal(calculateBomLineCostCents(1, 1250), 1250)
  assert.equal(calculateBomLineCostCents(1.5, 101), 152)
  assert.equal(calculateBomLineCostCents(0.005, 100), 1)
  assert.throws(() => calculateBomLineCostCents(1, 10.5), /integer number of cents/)
  assert.throws(() => calculateBomLineCostCents(-1, 100), /Invalid Quantity/)
})

test('BOM standard cost is the sum of integer line cents', () => {
  const lines = [
    { quantity: 1, unitCostCents: 1250 },
    { quantity: 10, unitCostCents: 250 },
  ]
  assert.equal(calculateBomStandardCostCents(lines), 3750)
  assert.deepEqual(MANUFACTURING_MONEY_FIELDS, ['standardCostCents', 'unitCostCents'])
  assert.throws(() => calculateBomStandardCostCents([]), /at least one line/)
})

test('product quantities multiply once and keep three decimals', () => {
  assert.equal(multiplyQuantities(2, 10), 20)
  assert.equal(multiplyQuantities(1.5, 3), 4.5)
  assert.equal(multiplyQuantities(0.001, 0.001), 0)
  assert.throws(() => multiplyQuantities(0, 1), /greater than zero/)
})

// ------------------------------------------------------------ tenant & transitions

test('manufacturing tenant scope allows branch-wide rows but never another company', () => {
  assert.deepEqual(manufacturingTenantWhere('cmp_a', null), { companyId: 'cmp_a' })
  assert.deepEqual(manufacturingTenantWhere('cmp_a', 'br_1'), {
    companyId: 'cmp_a',
    OR: [{ branchId: null }, { branchId: 'br_1' }],
  })
  assert.equal(JSON.stringify(manufacturingTenantWhere('cmp_a', 'br_1')).includes('cmp_other'), false)
})

test('BOM transitions cannot skip approval or revive obsolete records', () => {
  assert.equal(assertBomTransition('DRAFT', 'APPROVED'), true)
  assert.equal(assertBomTransition('APPROVED', 'OBSOLETE'), true)
  assert.throws(() => assertBomTransition('DRAFT', 'OBSOLETE_X'), /Cannot change BOM/)
  assert.throws(() => assertBomTransition('OBSOLETE', 'DRAFT'), /Cannot change BOM/)
})

test('production order transitions enforce release, start and completion order', () => {
  assert.equal(assertOrderTransition('DRAFT', 'RELEASED'), true)
  assert.equal(assertOrderTransition('RELEASED', 'IN_PROGRESS'), true)
  assert.equal(assertOrderTransition('IN_PROGRESS', 'QUALITY_HOLD'), true)
  assert.equal(assertOrderTransition('QUALITY_HOLD', 'COMPLETED'), true)
  assert.throws(() => assertOrderTransition('DRAFT', 'COMPLETED'), /Cannot change production order/)
  assert.throws(() => assertOrderTransition('COMPLETED', 'IN_PROGRESS'), /Cannot change production order/)
})

test('batch and QC transitions block release after rejection or failure', () => {
  assert.equal(assertBatchTransition('OPEN', 'IN_PROGRESS'), true)
  assert.equal(assertBatchTransition('IN_PROGRESS', 'REVIEW'), true)
  assert.throws(() => assertBatchTransition('OPEN', 'REVIEW'), /Cannot change batch/)
  assert.throws(() => assertBatchTransition('RELEASED', 'REVIEW'), /Cannot change batch/)
  assert.equal(assertQcTransition('PENDING', 'REVIEW'), true)
  assert.equal(assertQcTransition('REVIEW', 'PASS'), true)
  assert.equal(assertQcTransition('PENDING', 'FAIL'), true)
  assert.throws(() => assertQcTransition('PASS', 'PENDING'), /Cannot change QC/)
  assert.throws(() => assertQcTransition('FAIL', 'PASS'), /Cannot change QC/)
})

// ------------------------------------------------------------------- QC release

test('QC failure blocks batch release even when other checks pass', () => {
  const checks = [
    { checkCode: 'ASSAY', isMandatory: true, status: 'PASS' },
    { checkCode: 'STERILITY', isMandatory: true, status: 'FAIL' },
  ]
  assert.throws(
    () => assertBatchReleaseReady(reviewBatch, checks, 'usr_release', order),
    /QC failure blocks batch release/,
  )
})

test('release requires every mandatory QC check to pass', () => {
  assert.equal(assertBatchReleaseReady(reviewBatch, passedChecks, 'usr_release', order), true)
  const pending = passedChecks.map((check) => (
    check.checkCode === 'ASSAY' ? { ...check, status: 'PENDING' } : check
  ))
  assert.throws(
    () => assertBatchReleaseReady(reviewBatch, pending, 'usr_release', order),
    /All QC checks must pass/,
  )
  const optionalOnly = [{ checkCode: 'LABEL', isMandatory: false, status: 'PASS' }]
  assert.throws(
    () => assertBatchReleaseReady(reviewBatch, optionalOnly, 'usr_release', order),
    /mandatory QC check/,
  )
})

test('release enforces GMP fields, review state and signature separation', () => {
  assert.throws(
    () => assertBatchReleaseReady({ ...reviewBatch, status: 'IN_PROGRESS' }, passedChecks, 'usr_release', order),
    /REVIEW before release/,
  )
  assert.throws(
    () => assertBatchReleaseReady({ ...reviewBatch, manufacturingDate: null }, passedChecks, 'usr_release', order),
    /dates are required/,
  )
  assert.throws(
    () => assertBatchReleaseReady(reviewBatch, passedChecks, 'usr_qa', order),
    /reviewer and releaser must be different/,
  )
  assert.throws(
    () => assertBatchReleaseReady(reviewBatch, passedChecks, 'usr_production', order),
    /cannot release their own batch/,
  )
  assert.throws(
    () => assertBatchReleaseReady(reviewBatch, passedChecks, 'usr_planner', order),
    /cannot release their own batch/,
  )
})

// ----------------------------------------------------------------------- schemas

test('BOM schema rejects fractional unit costs and non-integer quantities', () => {
  const base = {
    name: 'Fixture BOM',
    productItemId: 'itm_fg',
    lines: [{ itemId: 'itm_api', quantity: 1, unitCostCents: 100 }],
  }
  assert.equal(manufacturingBomCreateSchema.parse(base).lines[0].unitCostCents, 100)
  assert.throws(
    () => manufacturingBomCreateSchema.parse({ ...base, lines: [{ ...base.lines[0], unitCostCents: 10.5 }] }),
    /int/,
  )
  assert.throws(
    () => manufacturingBomCreateSchema.parse({ ...base, lines: [{ ...base.lines[0], quantity: 1.0001 }] }),
    /three decimal/,
  )
})

test('batch schema requires a valid GMP date range and rejects empty batch numbers', () => {
  assert.equal(manufacturingBatchCreateSchema.parse(baseBatchInput).batchNumber, 'BAT-DLP-001')
  assert.throws(
    () => manufacturingBatchCreateSchema.parse({ ...baseBatchInput, expiryDate: '2026-10-31' }),
    /must not precede/,
  )
  assert.throws(
    () => manufacturingBatchCreateSchema.parse({ ...baseBatchInput, batchNumber: '  ' }),
    /too_small|at least/i,
  )
})

test('deviation notes and QC result notes are DLP-safe before encryption', () => {
  assertDlpRejects(
    () => manufacturingBatchCreateSchema.parse({ ...baseBatchInput, deviationNotes: 'Card 4111111111111111' }),
    'CARD',
  )
  assertDlpRejects(
    () => manufacturingQcDecisionSchema.parse({ decision: 'PASS', resultNotes: 'Card 4111111111111111' }),
    'CARD',
  )
})

test('manufacturing action schemas are strict about unknown fields', () => {
  assert.throws(
    () => manufacturingQcDecisionSchema.parse({ decision: 'PASS', batchNumber: 'BAT-X' }),
    /unrecognized/i,
  )
  assert.throws(
    () => manufacturingBatchReleaseSchema.parse({ warehouseId: 'wh_1', notes: 'secret' }),
    /unrecognized/i,
  )
  assert.equal(manufacturingWorkCenterCreateSchema.parse({ name: 'Line 2' }).status, 'ACTIVE')
})

// -------------------------------------------------------------------------- DTOs

test('batch and QC DTOs never expose encrypted notes', () => {
  const batchDto = toBatchDto({
    ...reviewBatch,
    deviationNotesEncrypted: 'v1.encrypted.payload',
    deviationNotesKeyId: 'object-encryption-v1',
  })
  assert.equal(batchDto.deviationNotesPresent, true)
  assert.equal(JSON.stringify(batchDto).includes('v1.encrypted.payload'), false)
  assert.equal(Object.hasOwn(batchDto, 'deviationNotes'), false)

  const qcDto = toQcCheckDto({
    id: 'qc_1',
    batchId: 'bat_1',
    checkCode: 'ASSAY',
    name: 'Assay',
    status: 'PASS',
    resultNotesEncrypted: 'v1.secret.payload',
  })
  assert.equal(qcDto.resultNotesPresent, true)
  assert.equal(JSON.stringify(qcDto).includes('v1.secret.payload'), false)
  assert.equal(Object.hasOwn(qcDto, 'resultNotes'), false)
})

test('BOM DTO derives line cents instead of echoing a client total', () => {
  const dto = toBomDto({
    id: 'bom_1',
    standardCostCents: 3750,
    lines: [
      { id: 'line_1', bomId: 'bom_1', itemId: 'itm_api', quantity: 1, unitCostCents: 1250 },
      { id: 'line_2', bomId: 'bom_1', itemId: 'itm_foil', quantity: 10, unitCostCents: 250 },
    ],
  })
  assert.deepEqual(dto.lines.map((line) => line.lineCostCents), [1250, 2500])
  assert.equal(dto.lines.reduce((sum, line) => sum + line.lineCostCents, 0), dto.standardCostCents)
})

// ------------------------------------------------------------------- events/sockets

test('manufacturing event schemas reject identifiers, dates, notes and money', () => {
  const payloads = {
    BomApproved: { entityType: 'BOM', entityId: 'bom_1', bomId: 'bom_1', productItemId: 'itm_fg', classification: 'INTERNAL' },
    ProductionOrderReleased: { entityType: 'PRODUCTION_ORDER', entityId: 'ord_1', orderId: 'ord_1', bomId: 'bom_1', workCenterId: 'wc_1', classification: 'INTERNAL' },
    BatchRecordOpened: { entityType: 'BATCH_RECORD', entityId: 'bat_1', batchId: 'bat_1', orderId: 'ord_1', productItemId: 'itm_fg', classification: 'RESTRICTED' },
    QcCheckFailed: { entityType: 'QC_CHECK', entityId: 'qc_1', qcCheckId: 'qc_1', batchId: 'bat_1', classification: 'CONFIDENTIAL' },
    BatchReleased: { entityType: 'BATCH_RECORD', entityId: 'bat_1', batchId: 'bat_1', orderId: 'ord_1', inventoryBatchId: 'ib_1', classification: 'RESTRICTED' },
  }
  for (const [type, payload] of Object.entries(payloads)) {
    assert.equal(DomainEventSchemas[type].parse(payload).entityId, payload.entityId)
    assert.throws(
      () => DomainEventSchemas[type].parse({ ...payload, batchNumber: 'BAT-SECRET' }),
      /unrecognized/i,
    )
  }
  assert.throws(
    () => QcCheckFailedDataSchema.parse({ ...payloads.QcCheckFailed, observedValue: '99.1' }),
    /unrecognized/i,
  )
  assert.equal(typeof BomApprovedDataSchema.parse, 'function')
  assert.equal(typeof ProductionOrderReleasedDataSchema.parse, 'function')
  assert.equal(typeof BatchRecordOpenedDataSchema.parse, 'function')
  assert.equal(typeof BatchReleasedDataSchema.parse, 'function')
})

test('manufacturing events map to the four ID-only ERP socket channels', () => {
  const emitted = []
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) }
  const event = {
    companyId: 'cmp_comet',
    branchId: null,
    type: 'QcCheckFailed',
    occurredAt: '2026-11-23T00:00:00.000Z',
    correlationId: 'cor_1',
    data: { entityType: 'QC_CHECK', entityId: 'qc_1', qcCheckId: 'qc_1', batchId: 'bat_1', classification: 'CONFIDENTIAL' },
  }
  assert.equal(dispatchEvent(io, event), 1)
  assert.equal(emitted[0].room, 'company:cmp_comet')
  assert.equal(emitted[0].event, 'manufacturing:qc')
  assert.equal(JSON.stringify(emitted[0].payload).includes('BAT-'), false)
  assert.equal(dispatchEvent(io, { ...event, type: 'UnknownEvent' }), 0)
})

// -------------------------------------------------------------------- permissions

test('manufacturing exposes exactly the 15 scoped permissions', () => {
  const keys = Object.keys(PERMISSIONS).filter((key) => key.startsWith('manufacturing.'))
  assert.equal(keys.length, 15)
  assert.deepEqual(keys.sort(), [
    'manufacturing.batch.read', 'manufacturing.batch.release', 'manufacturing.batch.review',
    'manufacturing.batch.write', 'manufacturing.bom.approve', 'manufacturing.bom.read',
    'manufacturing.bom.write', 'manufacturing.order.complete', 'manufacturing.order.read',
    'manufacturing.order.release', 'manufacturing.order.write', 'manufacturing.qc.read',
    'manufacturing.qc.write', 'manufacturing.workcenter.read', 'manufacturing.workcenter.write',
  ])
  assert.equal(ROLE_PERMISSIONS.ADMIN.includes('manufacturing.batch.release'), true)
})

test('QA/compliance owns approval, review, release and QC sign-off', () => {
  const manager = ROLE_PERMISSIONS.MANAGER
  const staff = ROLE_PERMISSIONS.STAFF
  const qa = ROLE_PERMISSIONS.COMPLIANCE
  for (const permission of ['manufacturing.bom.approve', 'manufacturing.batch.review', 'manufacturing.batch.release', 'manufacturing.qc.write']) {
    assert.equal(manager.includes(permission), false, `${permission} must not be a manager duty`)
    assert.equal(staff.includes(permission), false, `${permission} must not be a staff duty`)
    assert.equal(qa.includes(permission), true, `${permission} must be a QA duty`)
  }
  for (const permission of ['manufacturing.order.release', 'manufacturing.order.complete', 'manufacturing.batch.write']) {
    assert.equal(manager.includes(permission), true)
  }
  assert.equal(staff.includes('manufacturing.batch.read'), true)
  assert.equal(staff.includes('manufacturing.batch.write'), false)
})

// --------------------------------------------------------------- source contract

test('API mounts only the manufacturing router and the ERP tab exists', () => {
  const api = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
  assert.match(api, /app\.use\('\/api\/manufacturing', manufacturingRouter\)/)
  assert.equal((api.match(/app\.use\('\/api\/manufacturing'/g) || []).length, 1)

  const html = readFileSync(new URL('../../erp/public/index.html', import.meta.url), 'utf8')
  assert.match(html, /id="tabManufacturing"/)
  assert.match(html, /id="manufacturingView"/)
  assert.match(html, /id="tabProjects"/)

  const app = readFileSync(new URL('../../erp/public/app.js', import.meta.url), 'utf8')
  assert.match(app, /manufacturing:batch/)
  assert.match(app, /function onManufacturingEvent\(\)/)
})
