// Phase 8 inventory HTTP surface. Routes only validate, authorise and audit;
// every balance transition lives in lib/inventory.js. Tenant context comes from
// the authenticated principal — a client-supplied companyId is never accepted.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  inventoryItemCreateSchema, inventoryItemUpdateSchema,
  inventoryWarehouseCreateSchema, inventoryWarehouseUpdateSchema,
  inventoryBatchCreateSchema, inventoryBatchUpdateSchema,
  inventoryReceiptSchema, inventoryIssueSchema, inventoryAdjustmentSchema,
  inventoryTransferCreateSchema, inventoryCountCreateSchema, inventoryCountRecordSchema,
  inventoryItemQuerySchema, inventoryWarehouseQuerySchema, inventoryBatchQuerySchema,
  inventoryBalanceQuerySchema, inventoryMovementQuerySchema, inventoryTransferQuerySchema,
  inventoryCountQuerySchema, inventoryAlertQuerySchema,
} from '../lib/validation.js'
import {
  listItems, getItem, createItem, updateItem,
  listWarehouses, getWarehouse, createWarehouse, updateWarehouse,
  listBatches, getBatch, createBatch, updateBatch,
  listBalances, listMovements, listReorderAlerts,
  receiveStock, issueStock, adjustStock,
  listTransfers, getTransfer, createTransfer, approveTransfer, receiveTransfer, cancelTransfer,
  listCounts, getCount, startCount, recordCount, approveCount, cancelCount,
} from '../lib/inventory.js'

export const inventoryRouter = Router()

inventoryRouter.use(requireAuth)

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
    metadata: { resourceId: String(resourceId), classification: 'INTERNAL' },
  })
}

// -------------------------------------------------------------------- items

inventoryRouter.get('/items', requirePermission('inventory.item.read'), async (req, res) => {
  const query = inventoryItemQuerySchema.parse(req.query)
  return res.json({ items: await listItems(query, actor(req)) })
})

inventoryRouter.post('/items', requirePermission('inventory.item.write'), async (req, res) => {
  const body = inventoryItemCreateSchema.parse(req.body)
  return res.status(201).json({ item: await createItem(body, actor(req)) })
})

inventoryRouter.get('/items/:id', requirePermission('inventory.item.read'), async (req, res) => {
  const item = await getItem(req.params.id, actor(req))
  await auditRead(req, 'inventory.item.read', 'InventoryItem', req.params.id)
  return res.json({ item })
})

inventoryRouter.patch('/items/:id', requirePermission('inventory.item.write'), async (req, res) => {
  const body = inventoryItemUpdateSchema.parse(req.body)
  return res.json({ item: await updateItem(req.params.id, body, actor(req)) })
})

// --------------------------------------------------------------- warehouses

inventoryRouter.get('/warehouses', requirePermission('inventory.warehouse.read'), async (req, res) => {
  const query = inventoryWarehouseQuerySchema.parse(req.query)
  return res.json({ warehouses: await listWarehouses(query, actor(req)) })
})

inventoryRouter.post('/warehouses', requirePermission('inventory.warehouse.write'), async (req, res) => {
  const body = inventoryWarehouseCreateSchema.parse(req.body)
  return res.status(201).json({ warehouse: await createWarehouse(body, actor(req)) })
})

inventoryRouter.get('/warehouses/:id', requirePermission('inventory.warehouse.read'), async (req, res) => {
  const warehouse = await getWarehouse(req.params.id, actor(req))
  await auditRead(req, 'inventory.warehouse.read', 'Warehouse', req.params.id)
  return res.json({ warehouse })
})

inventoryRouter.patch('/warehouses/:id', requirePermission('inventory.warehouse.write'), async (req, res) => {
  const body = inventoryWarehouseUpdateSchema.parse(req.body)
  return res.json({ warehouse: await updateWarehouse(req.params.id, body, actor(req)) })
})

// ------------------------------------------------------------------ batches

inventoryRouter.get('/batches', requirePermission('inventory.batch.read'), async (req, res) => {
  const query = inventoryBatchQuerySchema.parse(req.query)
  return res.json({ batches: await listBatches(query, actor(req)) })
})

inventoryRouter.post('/batches', requirePermission('inventory.batch.write'), async (req, res) => {
  const body = inventoryBatchCreateSchema.parse(req.body)
  return res.status(201).json({ batch: await createBatch(body, actor(req)) })
})

inventoryRouter.get('/batches/:id', requirePermission('inventory.batch.read'), async (req, res) => {
  const batch = await getBatch(req.params.id, actor(req))
  await auditRead(req, 'inventory.batch.read', 'InventoryBatch', req.params.id)
  return res.json({ batch })
})

inventoryRouter.patch('/batches/:id', requirePermission('inventory.batch.write'), async (req, res) => {
  const body = inventoryBatchUpdateSchema.parse(req.body)
  return res.json({ batch: await updateBatch(req.params.id, body, actor(req)) })
})

// -------------------------------------------------------------- stock views

inventoryRouter.get('/balances', requirePermission('inventory.stock.read'), async (req, res) => {
  const query = inventoryBalanceQuerySchema.parse(req.query)
  return res.json({ balances: await listBalances(query, actor(req)) })
})

inventoryRouter.get('/movements', requirePermission('inventory.stock.read'), async (req, res) => {
  const query = inventoryMovementQuerySchema.parse(req.query)
  return res.json({ movements: await listMovements(query, actor(req)) })
})

inventoryRouter.get('/alerts', requirePermission('inventory.alert.read'), async (req, res) => {
  const query = inventoryAlertQuerySchema.parse(req.query)
  return res.json({ alerts: await listReorderAlerts(query, actor(req)) })
})

inventoryRouter.post('/stock/receipts', requirePermission('inventory.stock.adjust'), async (req, res) => {
  const body = inventoryReceiptSchema.parse(req.body)
  return res.status(201).json({ result: await receiveStock(body, actor(req)) })
})

inventoryRouter.post('/stock/issues', requirePermission('inventory.stock.adjust'), async (req, res) => {
  const body = inventoryIssueSchema.parse(req.body)
  return res.status(201).json({ result: await issueStock(body, actor(req)) })
})

inventoryRouter.post('/stock/adjustments', requirePermission('inventory.stock.adjust'), async (req, res) => {
  const body = inventoryAdjustmentSchema.parse(req.body)
  return res.status(201).json({ result: await adjustStock(body, actor(req)) })
})

// ----------------------------------------------------------------- transfers

inventoryRouter.get('/transfers', requirePermission('inventory.transfer.read'), async (req, res) => {
  const query = inventoryTransferQuerySchema.parse(req.query)
  return res.json({ transfers: await listTransfers(query, actor(req)) })
})

inventoryRouter.post('/transfers', requirePermission('inventory.transfer.write'), async (req, res) => {
  const body = inventoryTransferCreateSchema.parse(req.body)
  return res.status(201).json({ transfer: await createTransfer(body, actor(req)) })
})

inventoryRouter.get('/transfers/:id', requirePermission('inventory.transfer.read'), async (req, res) => {
  const transfer = await getTransfer(req.params.id, actor(req))
  await auditRead(req, 'inventory.transfer.read', 'StockTransfer', req.params.id)
  return res.json({ transfer })
})

inventoryRouter.post('/transfers/:id/approve', requirePermission('inventory.transfer.approve'), async (req, res) => {
  return res.json({ transfer: await approveTransfer(req.params.id, actor(req)) })
})

inventoryRouter.post('/transfers/:id/receive', requirePermission('inventory.transfer.approve'), async (req, res) => {
  return res.json({ transfer: await receiveTransfer(req.params.id, actor(req)) })
})

inventoryRouter.post('/transfers/:id/cancel', requirePermission('inventory.transfer.approve'), async (req, res) => {
  return res.json({ transfer: await cancelTransfer(req.params.id, actor(req)) })
})

// -------------------------------------------------------------- stock counts

inventoryRouter.get('/counts', requirePermission('inventory.count.read'), async (req, res) => {
  const query = inventoryCountQuerySchema.parse(req.query)
  return res.json({ counts: await listCounts(query, actor(req)) })
})

inventoryRouter.post('/counts', requirePermission('inventory.count.write'), async (req, res) => {
  const body = inventoryCountCreateSchema.parse(req.body)
  return res.status(201).json({ count: await startCount(body, actor(req)) })
})

inventoryRouter.get('/counts/:id', requirePermission('inventory.count.read'), async (req, res) => {
  const count = await getCount(req.params.id, actor(req))
  await auditRead(req, 'inventory.count.read', 'StockCount', req.params.id)
  return res.json({ count })
})

inventoryRouter.post('/counts/:id/record', requirePermission('inventory.count.write'), async (req, res) => {
  const body = inventoryCountRecordSchema.parse(req.body)
  return res.json({ count: await recordCount(req.params.id, body, actor(req)) })
})

inventoryRouter.post('/counts/:id/approve', requirePermission('inventory.count.approve'), async (req, res) => {
  return res.json({ count: await approveCount(req.params.id, actor(req)) })
})

inventoryRouter.post('/counts/:id/cancel', requirePermission('inventory.count.approve'), async (req, res) => {
  return res.json({ count: await cancelCount(req.params.id, actor(req)) })
})
