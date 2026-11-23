// Phase 11 HR HTTP surface. Routes only validate, authorise and audit; lifecycle,
// rate verification, integer-cent payroll math and finance posting live in
// lib/hr.js. Tenant and branch scope always come from the authenticated
// principal, never from a request body.

import { Router } from 'express'
import { requireAuth } from '../lib/auth.js'
import { requirePermission } from '../lib/authorize.js'
import { recordRequestAudit } from '../lib/audit.js'
import {
  hrEmployeeCreateSchema,
  hrEmployeeUpdateSchema,
  hrContractCreateSchema,
  hrContractTransitionSchema,
  hrPayrollRateCreateSchema,
  hrPayrollRateVerifySchema,
  hrLeaveCreateSchema,
  hrLeaveDecisionSchema,
  hrAttendanceUpsertSchema,
  hrPayrollRunCreateSchema,
  hrEmployeeQuerySchema,
  hrRateQuerySchema,
  hrLeaveQuerySchema,
  hrAttendanceQuerySchema,
  hrPayrollRunQuerySchema,
  hrActionSchema,
} from '../lib/validation.js'
import {
  listEmployees, getEmployee, createEmployee, updateEmployee,
  listContracts, getContract, createContract, transitionContract,
  listPayrollRates, getPayrollRate, createPayrollRate, verifyPayrollRate,
  listLeaveRequests, getLeaveRequest, createLeaveRequest, decideLeaveRequest,
  listAttendance, getAttendance, upsertAttendance,
  listPayrollRuns, getPayrollRun, createPayrollRun, calculatePayrollRun,
  approvePayrollRun, postPayrollRun,
} from '../lib/hr.js'

export const hrRouter = Router()

hrRouter.use(requireAuth)

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

function actionBody(req) {
  return hrActionSchema.parse(req.body || {})
}

// ---------------------------------------------------------------- employees

hrRouter.get('/employees', requirePermission('hr.employee.read'), async (req, res) => {
  const query = hrEmployeeQuerySchema.parse(req.query)
  return res.json({ employees: await listEmployees(query, actor(req)) })
})

hrRouter.post('/employees', requirePermission('hr.employee.write'), async (req, res) => {
  const body = hrEmployeeCreateSchema.parse(req.body)
  return res.status(201).json({ employee: await createEmployee(body, actor(req)) })
})

hrRouter.get('/employees/:id', requirePermission('hr.employee.read'), async (req, res) => {
  const employee = await getEmployee(req.params.id, actor(req))
  await auditRead(req, 'hr.employee.read', 'Employee', req.params.id)
  return res.json({ employee })
})

hrRouter.patch('/employees/:id', requirePermission('hr.employee.write'), async (req, res) => {
  const body = hrEmployeeUpdateSchema.parse(req.body)
  return res.json({ employee: await updateEmployee(req.params.id, body, actor(req)) })
})

// ---------------------------------------------------------------- contracts

hrRouter.get('/contracts', requirePermission('hr.contract.read'), async (req, res) => {
  const query = hrEmployeeQuerySchema.parse(req.query)
  return res.json({ contracts: await listContracts(query, actor(req)) })
})

hrRouter.post('/contracts', requirePermission('hr.contract.write'), async (req, res) => {
  const body = hrContractCreateSchema.parse(req.body)
  return res.status(201).json({ contract: await createContract(body, actor(req)) })
})

hrRouter.get('/contracts/:id', requirePermission('hr.contract.read'), async (req, res) => {
  const contract = await getContract(req.params.id, actor(req))
  await auditRead(req, 'hr.contract.read', 'EmploymentContract', req.params.id)
  return res.json({ contract })
})

const contractTransitions = {
  activate: 'ACTIVE',
  expire: 'EXPIRED',
  terminate: 'TERMINATED',
  cancel: 'CANCELLED',
}

for (const [action, status] of Object.entries(contractTransitions)) {
  hrRouter.post(`/contracts/:id/${action}`, requirePermission('hr.contract.write'), async (req, res) => {
    actionBody(req)
    const body = hrContractTransitionSchema.parse({ status })
    return res.json({ contract: await transitionContract(req.params.id, body.status, actor(req)) })
  })
}

// -------------------------------------------------------------- payroll rates

hrRouter.get('/rates', requirePermission('hr.payrollrate.read'), async (req, res) => {
  const query = hrRateQuerySchema.parse(req.query)
  return res.json({ rates: await listPayrollRates(query, actor(req)) })
})

hrRouter.post('/rates', requirePermission('hr.payrollrate.write'), async (req, res) => {
  const body = hrPayrollRateCreateSchema.parse(req.body)
  return res.status(201).json({ rate: await createPayrollRate(body, actor(req)) })
})

hrRouter.get('/rates/:id', requirePermission('hr.payrollrate.read'), async (req, res) => {
  const rate = await getPayrollRate(req.params.id, actor(req))
  await auditRead(req, 'hr.payrollrate.read', 'PayrollRate', req.params.id)
  return res.json({ rate })
})

hrRouter.post('/rates/:id/verify', requirePermission('hr.payrollrate.verify'), async (req, res) => {
  const body = hrPayrollRateVerifySchema.parse(req.body)
  return res.json({ rate: await verifyPayrollRate(req.params.id, body, actor(req)) })
})

// -------------------------------------------------------------------- leave

hrRouter.get('/leave', requirePermission('hr.leave.read'), async (req, res) => {
  const query = hrLeaveQuerySchema.parse(req.query)
  return res.json({ leaveRequests: await listLeaveRequests(query, actor(req)) })
})

hrRouter.post('/leave', requirePermission('hr.leave.write'), async (req, res) => {
  const body = hrLeaveCreateSchema.parse(req.body)
  return res.status(201).json({ leaveRequest: await createLeaveRequest(body, actor(req)) })
})

hrRouter.get('/leave/:id', requirePermission('hr.leave.read'), async (req, res) => {
  const leaveRequest = await getLeaveRequest(req.params.id, actor(req))
  await auditRead(req, 'hr.leave.read', 'LeaveRequest', req.params.id)
  return res.json({ leaveRequest })
})

hrRouter.post('/leave/:id/decision', requirePermission('hr.leave.approve'), async (req, res) => {
  const body = hrLeaveDecisionSchema.parse(req.body)
  return res.json({ leaveRequest: await decideLeaveRequest(req.params.id, body, actor(req)) })
})

// ---------------------------------------------------------------- attendance

hrRouter.get('/attendance', requirePermission('hr.attendance.read'), async (req, res) => {
  const query = hrAttendanceQuerySchema.parse(req.query)
  return res.json({ attendance: await listAttendance(query, actor(req)) })
})

hrRouter.post('/attendance', requirePermission('hr.attendance.write'), async (req, res) => {
  const body = hrAttendanceUpsertSchema.parse(req.body)
  return res.status(201).json({ attendance: await upsertAttendance(body, actor(req)) })
})

hrRouter.get('/attendance/:id', requirePermission('hr.attendance.read'), async (req, res) => {
  const record = await getAttendance(req.params.id, actor(req))
  await auditRead(req, 'hr.attendance.read', 'AttendanceRecord', req.params.id)
  return res.json({ attendance: record })
})

// ------------------------------------------------------------------- payroll

hrRouter.get('/payroll/runs', requirePermission('hr.payroll.read'), async (req, res) => {
  const query = hrPayrollRunQuerySchema.parse(req.query)
  return res.json({ payrollRuns: await listPayrollRuns(query, actor(req)) })
})

hrRouter.post('/payroll/runs', requirePermission('hr.payroll.write'), async (req, res) => {
  const body = hrPayrollRunCreateSchema.parse(req.body)
  return res.status(201).json({ payrollRun: await createPayrollRun(body, actor(req)) })
})

hrRouter.get('/payroll/runs/:id', requirePermission('hr.payroll.read'), async (req, res) => {
  const payrollRun = await getPayrollRun(req.params.id, actor(req))
  await auditRead(req, 'hr.payroll.read', 'PayrollRun', req.params.id)
  return res.json({ payrollRun })
})

hrRouter.post('/payroll/runs/:id/calculate', requirePermission('hr.payroll.write'), async (req, res) => {
  actionBody(req)
  return res.json({ payrollRun: await calculatePayrollRun(req.params.id, actor(req)) })
})

hrRouter.post('/payroll/runs/:id/approve', requirePermission('hr.payroll.approve'), async (req, res) => {
  actionBody(req)
  return res.json({ payrollRun: await approvePayrollRun(req.params.id, actor(req)) })
})

hrRouter.post(
  '/payroll/runs/:id/post',
  requirePermission('hr.payroll.post'),
  requirePermission('finance.journal.post'),
  async (req, res) => {
    actionBody(req)
    return res.json({ payrollRun: await postPayrollRun(req.params.id, actor(req)) })
  }
)
