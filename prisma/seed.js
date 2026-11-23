// Development seed — fills the database with believable demo data so every
// screen (home, directory, booking, admin) shows real content.
//
// Run: npm run db:seed
// Safe to re-run: idempotent (guards on existing providers/testimonials).
//
// NOTE: seeded admin credentials are development-only. Change them in production.

import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import '../packages/api/lib/env.js'
import { genBookingCode } from '../packages/api/lib/util.js'
import { encryptString } from '../packages/api/lib/crypto.js'
import { sha256 } from '../packages/api/lib/auth.js'
import { addDays, localIsoDay } from '../packages/api/lib/slots.js'
import { DEFAULT_COMPANY, computeLine, computeTotals } from '../packages/api/lib/documents.js'
import { DEFAULT_SITE_CONTENT } from '../packages/api/lib/content.js'
import { SEED_EXPERTS } from '../packages/web/src/lib/experts.js'
import { PERMISSIONS, ROLE_PERMISSIONS } from '../packages/shared/src/permissions.js'

const prisma = new PrismaClient()

const EXPERTS = SEED_EXPERTS

const INQUIRIES = [
  {
    kind: 'CDMO',
    name: 'Faith Njeri',
    company: 'Afya Generics Labs',
    email: 'faith@afyagenerics.co.ke',
    phone: '+254 700 123 456',
    subject: 'Contract manufacturing of metformin IR tablet',
    message: 'We are developing a metformin IR 500mg line and would like to discuss end-to-end CDMO support, from formulation to scale-up and registration support.',
  },
  {
    kind: 'CATALOG',
    name: 'Dennis Kiprop',
    company: 'Springline Pharmacy',
    email: 'dennis@springline.co.ke',
    phone: '+254 711 987 654',
    subject: 'Stockist catalogue and price list',
    message: 'Please share your current distributor price list and catalogue for our pharmacy chain in Eldoret.',
  },
  {
    kind: 'CONTACT',
    name: 'Wanjiku Chebet',
    company: '',
    email: 'w.chebet@bidiihealth.org',
    phone: '',
    subject: 'Community health partnership',
    message: 'We would like to explore an NGO partnership for affordable malaria and AMR medicines in western Kenya.',
  },
]

const TESTIMONIALS = [
  { name: 'Kingsley Mikunda', role: 'Managing Director, Mikunda Medical Supplies', quote: 'Comet has been a dependable manufacturing partner for over a decade. Their GMP discipline and delivery consistency are unmatched in the region.', rating: 5 },
  { name: 'Dr. Aisha Baraka', role: 'Chief Pharmacist, Baraka Health Foundation', quote: 'Their regulatory team guided our dossier through a smooth regional registration — something that normally takes us twice as long. Highly recommended.', rating: 5 },
  { name: 'Samuel Ndiritu', role: 'Procurement Lead, County Referral Hospital', quote: 'Reliable supply, transparent quality documentation, and real responsiveness. Our county facility trusts Comet with our essential medicines list.', rating: 4 },
  { name: 'Lilian Achieng', role: 'COO, Nettle Distributors', quote: 'From monthly forecast calls to batch documentation, working with Comet feels like a true partnership rather than a transaction.', rating: 5 },
  { name: 'Robert Gakinya', role: 'Founder, PharmaStart Incubator', quote: 'The training program on regulatory compliance and digital tools transformed how our startup approaches quality. Practical, current, and honest.', rating: 5 },
]

const DEPARTMENTS = [
  { code: 'sales', name: 'Sales', address: 'sales@internal' },
  { code: 'repairs', name: 'Repairs & Service', address: 'repairs@internal' },
  { code: 'procurement', name: 'Procurement', address: 'procurement@internal' },
  { code: 'stores', name: 'Stores', address: 'stores@internal' },
  { code: 'production', name: 'Production', address: 'production@internal' },
  { code: 'quality', name: 'Quality Assurance', address: 'quality@internal' },
  { code: 'finance', name: 'Finance', address: 'finance@internal' },
  { code: 'hr', name: 'Human Resources', address: 'hr@internal' },
  { code: 'customer-care', name: 'Customer Care', address: 'customercare@internal' },
  { code: 'management', name: 'Management', address: 'management@internal' },
]

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!'
  const adminHash = await bcrypt.hash(adminPassword, 12)
  const companyId = 'cmp_comet'

  await prisma.company.upsert({
    where: { id: companyId },
    update: {},
    create: {
      id: companyId,
      code: 'COMET',
      name: 'Comet Healthcare Pharmaceutical Ltd',
    },
  })

  await prisma.branch.upsert({
    where: { companyId_code: { companyId, code: 'br_nairobi_hq' } },
    update: {},
    create: {
      companyId,
      code: 'br_nairobi_hq',
      name: 'Nairobi HQ',
      type: 'HQ',
      city: 'Nairobi',
    },
  })
  await prisma.branch.upsert({
    where: { companyId_code: { companyId, code: 'br_machakos_plant' } },
    update: {},
    create: {
      companyId,
      code: 'br_machakos_plant',
      name: 'Machakos Plant',
      type: 'PLANT',
      city: 'Machakos',
    },
  })

  for (const dept of DEPARTMENTS) {
    const department = await prisma.department.upsert({
      where: { companyId_code: { companyId, code: dept.code } },
      update: {},
      create: { companyId, code: dept.code, name: dept.name, internalAddress: dept.address },
    })
    await prisma.inbox.upsert({
      where: { companyId_internalAddress: { companyId, internalAddress: dept.address } },
      update: {},
      create: {
        companyId,
        departmentId: department.id,
        kind: 'DEPARTMENT',
        code: `inbox_${dept.code}`,
        name: `${dept.name} Shared Inbox`,
        internalAddress: dept.address,
      },
    })
  }

  // ---- Phase 3 RBAC catalogue ----
  for (const [code, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { companyId_code: { companyId, code } },
      update: { description },
      create: { companyId, code, description },
    })
  }
  for (const [code, permissions] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.accessRole.upsert({
      where: { companyId_code: { companyId, code } },
      update: { name: code, isSystem: true },
      create: { companyId, code, name: code, isSystem: true },
    })
    for (const permissionCode of permissions) {
      const permission = await prisma.permission.findUnique({
        where: { companyId_code: { companyId, code: permissionCode } },
      })
      if (!permission) continue
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { companyId, roleId: role.id, permissionId: permission.id },
      })
    }
  }
  console.log(`✓ RBAC catalogue: ${Object.keys(PERMISSIONS).length} permissions, ${Object.keys(ROLE_PERMISSIONS).length} roles`)

  const hqBranch = await prisma.branch.findUnique({
    where: { companyId_code: { companyId, code: 'br_nairobi_hq' } },
  })

  const adminUser = await prisma.user.upsert({
    where: { companyId_email: { companyId, email: 'admin@comethealthcare.local' } },
    update: {},
    create: {
      companyId,
      email: 'admin@comethealthcare.local',
      passwordHash: adminHash,
      firstName: 'Comet',
      lastName: 'Admin',
      role: 'ADMIN',
      branchId: hqBranch?.id,
      passwordChangedAt: new Date(),
      departmentId: (await prisma.department.findUnique({ where: { companyId_code: { companyId, code: 'management' } } }))?.id,
    },
  })
  const adminRole = await prisma.accessRole.findUnique({ where: { companyId_code: { companyId, code: 'ADMIN' } } })
  if (adminRole) {
    const existingAssignment = await prisma.userRole.findFirst({
      where: { companyId, userId: adminUser.id, roleId: adminRole.id },
    })
    if (!existingAssignment) {
      await prisma.userRole.create({ data: { companyId, userId: adminUser.id, roleId: adminRole.id } })
    }
  }
  console.log(`✓ Admin: admin@comethealthcare.local (password: ${process.env.SEED_ADMIN_PASSWORD ? 'per SEED_ADMIN_PASSWORD' : 'ChangeMe123!'})`)

  await prisma.user.upsert({
    where: { companyId_email: { companyId, email: 'client@comethealthcare.local' } },
    update: {},
    create: {
      companyId,
      email: 'client@comethealthcare.local',
      passwordHash: await bcrypt.hash('ClientPass123!', 12),
      firstName: 'Demo',
      lastName: 'Client',
      company: 'Afya Generics Labs',
      phone: '+254 700 111 222',
      role: 'PATIENT',
      passwordChangedAt: new Date(),
    },
  })
  console.log('✓ Demo client: client@comethealthcare.local (password: ClientPass123!)')

  const staffUser = await prisma.user.upsert({
    where: { companyId_email: { companyId, email: 'staff@comethealthcare.local' } },
    update: {},
    create: {
      companyId,
      email: 'staff@comethealthcare.local',
      passwordHash: await bcrypt.hash('StaffPass123!', 12),
      firstName: 'Wanjiku',
      lastName: 'Staff',
      role: 'STAFF',
      branchId: hqBranch?.id,
      passwordChangedAt: new Date(),
    },
  })
  console.log('✓ Demo staff: staff@comethealthcare.local (password: StaffPass123!)')

  // ---- Phase 4 messaging demo ----
  const careInbox = await prisma.inbox.findUnique({
    where: { companyId_internalAddress: { companyId, internalAddress: 'customercare@internal' } },
  })
  if (careInbox) {
    for (const [user, role] of [[adminUser, 'MANAGER'], [staffUser, 'AGENT']]) {
      await prisma.inboxMembership.upsert({
        where: { inboxId_userId: { inboxId: careInbox.id, userId: user.id } },
        update: { role },
        create: { companyId, inboxId: careInbox.id, userId: user.id, role, canAssign: true },
      })
    }
  }

  let demoThread = await prisma.thread.findFirst({
    where: { companyId, subject: 'Welcome to the internal inbox' },
  })
  if (!demoThread && careInbox) {
    demoThread = await prisma.thread.create({
      data: {
        companyId,
        inboxId: careInbox.id,
        branchId: hqBranch?.id || null,
        subject: 'Welcome to the internal inbox',
        status: 'OPEN',
        priority: 'NORMAL',
        classification: 'INTERNAL',
        createdById: adminUser.id,
        lastMessageAt: new Date(),
      },
    })
    const welcome = await prisma.message.create({
      data: {
        companyId,
        threadId: demoThread.id,
        branchId: hqBranch?.id || null,
        senderId: adminUser.id,
        body: 'This thread demonstrates internal delivery without any external email dependency.',
        visibility: 'RECIPIENT',
        classification: 'INTERNAL',
        idempotencyKey: `${companyId}:seed:welcome-message`,
        recipients: {
          create: {
            companyId,
            userId: staffUser.id,
            inboxId: careInbox.id,
            status: 'DELIVERED',
            deliveredAt: new Date(),
          },
        },
      },
    })
    await prisma.message.create({
      data: {
        companyId,
        threadId: demoThread.id,
        branchId: hqBranch?.id || null,
        senderId: staffUser.id,
        body: 'Confirmed — replies and read receipts stay inside the platform.',
        visibility: 'INTERNAL',
        classification: 'INTERNAL',
        idempotencyKey: `${companyId}:seed:welcome-note`,
        recipients: {
          create: { companyId, userId: adminUser.id, status: 'DELIVERED', deliveredAt: new Date() },
        },
      },
    })
    await prisma.messageReaction.create({
      data: { companyId, messageId: welcome.id, userId: staffUser.id, emoji: '👍' },
    })
    console.log('✓ Messaging demo: shared inbox thread with a reply and internal note')
  }

  // ---- Experts (seeded once) ----
  if ((await prisma.provider.count()) === 0) {
    for (const exp of EXPERTS) {
      const provider = await prisma.provider.create({
        data: {
          slug: exp.slug,
          name: exp.name,
          title: exp.title,
          specialty: exp.specialty,
          location: exp.location,
          bio: exp.bio,
          image: exp.image,
          yearsExperience: exp.yearsExperience,
          rating: exp.rating,
          reviewsCount: exp.reviewsCount,
          email: exp.email,
          phone: exp.phone,
        },
      })
      for (const day of exp.days) {
        await prisma.providerSchedule.create({
          data: {
            providerId: provider.id,
            dayOfWeek: day,
            startTime: exp.start,
            endTime: exp.end,
            slotMinutes: 30,
          },
        })
      }
    }
    console.log(`✓ Seeded ${EXPERTS.length} experts with schedules`)
  } else {
    console.log('∏ Experts already present, skipping')
  }

  // ---- Testimonials (seeded once) ----
  if ((await prisma.testimonial.count()) === 0) {
    await prisma.testimonial.createMany({ data: TESTIMONIALS })
    console.log(`✓ Seeded ${TESTIMONIALS.length} testimonials`)
  }

  // ---- Sample appointments (a couple of days from now) ----
  if ((await prisma.appointment.count()) === 0) {
    const providers = await prisma.provider.findMany({ take: 3 })
    const client = await prisma.user.findUnique({ where: { companyId_email: { companyId, email: 'client@comethealthcare.local' } } })
    const date1 = addDays(localIsoDay(), 2)
    const date2 = addDays(localIsoDay(), 4)
    await prisma.appointment.createMany({
      data: [
        {
          code: genBookingCode(),
          patientId: client.id,
          patientName: 'Demo Client',
          patientEmail: client.email,
          patientPhone: '+254 700 111 222',
          company: 'Afya Generics Labs',
          providerId: providers[0].id,
          date: date1,
          startTime: '10:00',
          endTime: '10:30',
          type: 'CDMO consultation',
          notes: 'Explore metformin IR contract manufacturing.',
          status: 'CONFIRMED',
        },
        {
          code: genBookingCode(),
          patientId: client.id,
          patientName: 'Demo Client',
          patientEmail: client.email,
          patientPhone: '+254 700 111 222',
          company: 'Afya Generics Labs',
          providerId: providers[1].id,
          date: date2,
          startTime: '13:00',
          endTime: '13:30',
          type: 'Regulatory strategy',
          notes: 'EAC registration roadmap.',
          status: 'SCHEDULED',
        },
      ],
    })
    console.log('✓ Seeded 2 sample appointments')
  }

  // ---- Sample inquiries (lead inbox for admin) ----
  if ((await prisma.inquiry.count()) === 0) {
    for (const inquiry of INQUIRIES) {
      await prisma.inquiry.create({ data: inquiry })
    }
    console.log(`✓ Seeded ${INQUIRIES.length} inquiries`)
  }

  // ---- Company template (letterhead) settings ----
  await prisma.setting.upsert({
    where: { key: 'company_profile' },
    update: { value: DEFAULT_COMPANY },
    create: { key: 'company_profile', value: DEFAULT_COMPANY },
  })
  console.log('✓ Company template (letterhead) settings')

  // ---- Site content (CMS defaults) ----
  // Seed only when absent: re-running the seed must never overwrite copy or
  // photo choices saved through Content Studio.
  const existingSiteContent = await prisma.setting.findUnique({ where: { key: 'site_content' } })
  if (existingSiteContent) {
    console.log('✓ Site content (kept existing Content Studio edits)')
  } else {
    await prisma.setting.create({ data: { key: 'site_content', value: DEFAULT_SITE_CONTENT } })
    console.log('✓ Site content (CMS defaults)')
  }

  // ---- Sample business documents ----
  const client = await prisma.user.findUnique({ where: { companyId_email: { companyId, email: 'client@comethealthcare.local' } } })
  const admin = await prisma.user.findUnique({
    where: { companyId_email: { companyId, email: 'admin@comethealthcare.local' } },
  })
  const today = localIsoDay()

  const li = [
    { description: 'Metformin HCl 500mg tablets — 100,000 × 10-tablet blisters', qty: 100000, unitPrice: 1.15 },
    { description: 'Amoxicillin 500mg capsules — 50,000 × 10-tablet blisters', qty: 50000, unitPrice: 1.42 },
    { description: 'Paracetamol 500mg tablets — 80,000 × 10-tablet blisters', qty: 80000, unitPrice: 0.86 },
  ].map(computeLine)
  const liTotal = computeTotals(li, DEFAULT_COMPANY.taxRate)

  const sampleDocs = [
    {
      number: `QUO-${new Date().getFullYear()}-9001`,
      kind: 'QUOTATION',
      title: 'Quotation — Essential Medicines Supply',
      status: 'ISSUED',
      issueDate: today,
      validUntil: addDays(today, 30),
      data: { items: li },
      total: liTotal,
      notes: 'FOB Comet production site, Machakos. Lead time 21 working days from pro-forma confirmation. Inclusive of packaging/labelling per PPB requirements.',
    },
    {
      number: `PFI-${new Date().getFullYear()}-9002`,
      kind: 'PROFORMA_INVOICE',
      title: 'Proforma Invoice — Essential Medicines Supply',
      status: 'ISSUED',
      issueDate: today,
      dueDate: addDays(today, 7),
      data: { items: li.slice(0, 2) },
      total: computeTotals(li.slice(0, 2), DEFAULT_COMPANY.taxRate),
      notes: 'Pro-forma for the Quotation above. Balance payable on issue of the tax invoice.',
    },
    {
      number: `INV-${new Date().getFullYear()}-9003`,
      kind: 'INVOICE',
      title: 'Tax Invoice — Batch Supply',
      status: 'ISSUED',
      issueDate: addDays(today, -5),
      dueDate: addDays(today, 9),
      data: { items: li.slice(1, 2) },
      total: computeTotals(li.slice(1, 2), DEFAULT_COMPANY.taxRate),
      notes: 'Payment via EFT. Late payment attracts 1.5% per month on the outstanding balance.',
    },
    {
      number: `ORD-${new Date().getFullYear()}-9004`,
      kind: 'ORDER_CONFIRMATION',
      title: 'Order Confirmation — Warehouse Replenishment',
      status: 'DRAFT',
      issueDate: today,
      data: { items: li.slice(0, 1) },
      total: computeTotals(li.slice(0, 1), DEFAULT_COMPANY.taxRate),
      notes: 'Awaiting client approval of batch scheduling window.',
    },
    {
      number: `SLA-${new Date().getFullYear()}-9005`,
      kind: 'CDMO_SLA',
      title: 'CDMO Service Level Agreement',
      status: 'DRAFT',
      issueDate: today,
      validUntil: addDays(today, 365),
      data: {
        clauses: [
          { title: 'Services', body: 'Comet shall provide end-to-end contract development and manufacturing: pre-formulation, formulation development, analytical method development, scale-up, GMP batch production, stability programs and regulatory dossier preparation.' },
          { title: 'Quality & GMP', body: 'All manufacturing and QC activity shall be executed in accordance with current Good Manufacturing Practice (cGMP), WHO-GMP principles and the client-approved quality agreement.' },
          { title: 'Batch Release', body: 'Each batch shall be released only after full in-process and finished-product testing passes specification, with a Certificate of Analysis attached.' },
          { title: 'Confidentiality', body: 'Each party shall hold the other\u2019s proprietary information in confidence for the term of this agreement and five years thereafter.' },
          { title: 'Fees & Invoicing', body: 'Fees per the agreed project quotation; invoiced at project milestones. Invoices are payable within 14 days of issue.' },
          { title: 'Term', body: 'This agreement is effective from the issue date and continues for 12 months, renewable by mutual written consent.' },
        ],
      },
      total: { subtotal: 0, tax: 0, total: 0 },
      notes: 'Draft for legal review before signature.',
    },
    {
      number: `COA-${new Date().getFullYear()}-9006`,
      kind: 'COA',
      title: 'Certificate of Analysis — Metformin HCl 500mg Tablets',
      status: 'ISSUED',
      issueDate: today,
      data: {
        productInfo: {
          product: 'Metformin HCl Tablets 500mg (IR)',
          batch: 'CMT-2409-MF500',
          dosageForm: 'Film-coated tablets',
          manufacturingDate: addDays(today, -120),
          expiryDate: addDays(today, 1155),
          storage: 'Store below 25°C, protected from moisture',
        },
        params: [
          { parameter: 'Description', method: 'Visual', result: 'White film-coated, round', limit: 'Conforms', status: 'PASS' },
          { parameter: 'Identification', method: 'HPLC', result: 'Matches reference', limit: 'Positive (RT match)', status: 'PASS' },
          { parameter: 'Assay (Metformin HCl)', method: 'HPLC', result: '99.8%', limit: '95.0–105.0%', status: 'PASS' },
          { parameter: 'Disintegration', method: 'Ph. Int.', result: '8 min', limit: '≤ 15 min', status: 'PASS' },
          { parameter: 'Uniformity of dosage units', method: 'Ph. Int.', result: 'AV 4.5', limit: 'AV ≤ 15', status: 'PASS' },
          { parameter: 'Microbial purity', method: 'Ph. Int.', result: 'Conforms', limit: 'TAMC ≤ 1000, TYMC ≤ 100', status: 'PASS' },
        ],
      },
      total: { subtotal: 0, tax: 0, total: 0 },
      notes: 'Certified on behalf of the Quality Control department. For enquiries contact QA@comethealthcares.com.',
    },
  ]

  for (const doc of sampleDocs) {
    const { number, total, ...rest } = doc
    await prisma.businessDocument.upsert({
      where: { number },
      update: {},
      create: {
        ...rest,
        number,
        subtotal: total.subtotal,
        tax: total.tax,
        total: total.total,
        currency: DEFAULT_COMPANY.currency,
        taxRate: DEFAULT_COMPANY.taxRate,
        clientName: 'Demo Client',
        clientCompany: 'Afya Generics Labs',
        clientEmail: client.email,
        clientPhone: '+254 700 111 222',
        company: DEFAULT_COMPANY,
        createdById: admin.id,
      },
    })
  }
  console.log(`✓ Seeded ${sampleDocs.length} sample business documents`)

  // ---- Minimal internal messaging proof data ----
  const repairsInbox = await prisma.inbox.findUnique({
    where: { companyId_internalAddress: { companyId, internalAddress: 'repairs@internal' } },
  })
  if (repairsInbox && !(await prisma.thread.findUnique({ where: { id: 'thr_seed_001' } }))) {
    await prisma.thread.create({
      data: {
        id: 'thr_seed_001',
        companyId,
        inboxId: repairsInbox.id,
        subject: 'Service ticket routing check',
        status: 'OPEN',
        priority: 'NORMAL',
        createdById: admin.id,
        assignedToId: admin.id,
      },
    })
    const message = await prisma.message.upsert({
      where: { idempotencyKey: 'seed_msg_001' },
      update: {},
      create: {
        companyId,
        threadId: 'thr_seed_001',
        senderId: admin.id,
        body: 'This thread verifies that the Repairs shared inbox is ready for Phase 4.',
        idempotencyKey: 'seed_msg_001',
      },
    })
    await prisma.messageRecipient.create({
      data: { companyId, messageId: message.id, inboxId: repairsInbox.id, status: 'DELIVERED' },
    })
    await prisma.thread.update({
      where: { id: 'thr_seed_001' },
      data: { lastMessageAt: message.createdAt },
    })
    console.log('✓ Seeded internal messaging proof thread')
  }

  // ---- Phase 5 shared services proof data ----
  const workflowDefinitions = [
    {
      code: 'document_approval',
      name: 'Business document approval',
      description: 'Manager review before a generated business document is issued.',
      steps: [
        { key: 'review', label: 'Review document', assigneeRole: 'MANAGER', requireReason: false },
        { key: 'release', label: 'Release document', assigneeRole: 'ADMIN', requireReason: true },
      ],
    },
    {
      code: 'quality_release',
      name: 'Quality release',
      description: 'QA release gate for batch documentation.',
      steps: [{ key: 'qa', label: 'Quality approval', assigneeRole: 'COMPLIANCE', requireReason: true }],
    },
  ]
  for (const definition of workflowDefinitions) {
    await prisma.workflowDefinition.upsert({
      where: { companyId_code_version: { companyId, code: definition.code, version: 1 } },
      update: { name: definition.name, description: definition.description, steps: definition.steps, active: true },
      create: { companyId, ...definition, version: 1, classification: 'INTERNAL', createdById: admin.id },
    })
  }
  console.log(`✓ Seeded ${workflowDefinitions.length} workflow definitions`)

  for (const user of [admin, client].filter(Boolean)) {
    await prisma.notificationPreference.upsert({
      where: { companyId_userId_channel: { companyId, userId: user.id, channel: 'IN_APP' } },
      update: { enabled: true, digestMinutes: 0 },
      create: { companyId, userId: user.id, channel: 'IN_APP', enabled: true, digestMinutes: 0 },
    })
  }
  console.log('✓ Seeded in-app notification preferences')

  const seededDocs = await prisma.businessDocument.findMany({
    where: { companyId, number: { in: sampleDocs.map((doc) => doc.number) } },
    select: { id: true, number: true, title: true, clientCompany: true, createdById: true },
  })
  for (const doc of seededDocs) {
    await prisma.searchDocument.upsert({
      where: { companyId_entityType_entityId: { companyId, entityType: 'DOCUMENT', entityId: doc.id } },
      update: {
        title: `${doc.number} ${doc.title}`,
        summary: doc.clientCompany,
        allowedUserIds: [doc.createdById, client?.id].filter(Boolean),
        allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
      },
      create: {
        companyId,
        entityType: 'DOCUMENT',
        entityId: doc.id,
        title: `${doc.number} ${doc.title}`,
        summary: doc.clientCompany,
        classification: 'INTERNAL',
        allowedUserIds: [doc.createdById, client?.id].filter(Boolean),
        allowedRoleCodes: ['ADMIN', 'MANAGER', 'COMPLIANCE'],
      },
    })
  }
  console.log(`✓ Indexed ${seededDocs.length} documents for permission-aware search`)

  // ---- Phase 6 finance fixtures ----
  const FINANCE_ACCOUNTS = [
    { systemCode: 'AR_CONTROL', code: '1000', name: 'Accounts Receivable Control', type: 'ASSET', normalBalance: 'DEBIT' },
    { systemCode: 'BANK', code: '1100', name: 'Bank Account', type: 'ASSET', normalBalance: 'DEBIT' },
    { systemCode: 'VAT_INPUT', code: '1400', name: 'VAT Input', type: 'ASSET', normalBalance: 'DEBIT' },
    { systemCode: 'AP_CONTROL', code: '2100', name: 'Accounts Payable Control', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { systemCode: 'VAT_OUTPUT', code: '2200', name: 'VAT Output', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { systemCode: 'EQUITY', code: '3000', name: 'Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
    { systemCode: 'SALES', code: '4000', name: 'Sales', type: 'INCOME', normalBalance: 'CREDIT' },
    { systemCode: 'PURCHASES', code: '5000', name: 'Purchases', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { systemCode: 'EXPENSE', code: '6000', name: 'Operating Expenses', type: 'EXPENSE', normalBalance: 'DEBIT' },
  ]
  const financeAccountsByCode = {}
  for (const account of FINANCE_ACCOUNTS) {
    const saved = await prisma.financeAccount.upsert({
      where: { companyId_systemCode: { companyId, systemCode: account.systemCode } },
      update: {
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        isActive: true,
      },
      create: {
        companyId,
        ...account,
        currency: 'KES',
        classification: 'INTERNAL',
        createdById: admin.id,
      },
    })
    financeAccountsByCode[account.systemCode] = saved
  }
  console.log(`✓ Seeded ${FINANCE_ACCOUNTS.length} finance chart-of-accounts entries`)

  // Fixture rate is explicitly UNVERIFIED; verification is a COMPLIANCE action.
  const rate = await prisma.statutoryRate.upsert({
    where: { companyId_code_effectiveFrom: { companyId, code: 'VAT_STANDARD', effectiveFrom: '2026-01-01' } },
    update: {
      kind: 'VAT',
      label: 'Standard VAT (fixture)',
      rateBps: 1600,
      sourceReference: 'KRA VAT fixture - verify before production use',
    },
    create: {
      companyId,
      code: 'VAT_STANDARD',
      kind: 'VAT',
      label: 'Standard VAT (fixture)',
      rateBps: 1600,
      effectiveFrom: '2026-01-01',
      sourceReference: 'KRA VAT fixture - verify before production use',
      verificationNote: null,
      verifiedBy: null,
      status: 'UNVERIFIED',
      createdById: admin.id,
    },
  })
  const taxMultiplier = rate.rateBps / 10000
  console.log('✓ Seeded unverified VAT statutory rate fixture')

  // Tax PINs are stored encrypted only; the plaintexts are deliberately fake.
  async function financePartyFixture(id, type, name, fakePin) {
    const existing = await prisma.financeParty.findFirst({ where: { companyId, type, name } })
    if (existing) return existing
    return prisma.financeParty.create({
      data: {
        id,
        companyId,
        type,
        name,
        taxPinCiphertext: encryptString(fakePin),
        currency: 'KES',
        classification: 'INTERNAL',
        createdById: admin.id,
      },
    })
  }
  const customerParty = await financePartyFixture('fin_party_afya_generics', 'CUSTOMER', 'Afya Generics Labs', 'A123456789X')
  const supplierParty = await financePartyFixture('fin_party_kisumu_pharma', 'SUPPLIER', 'Kisumu Pharma Suppliers', 'B987654321Y')
  console.log('✓ Seeded finance parties with encrypted tax PINs')

  const lineTotals = (qty, unitPriceCents) => {
    const netCents = Math.round(qty * unitPriceCents)
    const taxCents = Math.round(netCents * taxMultiplier)
    return { netCents, taxCents, grossCents: netCents + taxCents }
  }
  const financeInvoiceFixtures = [
    {
      number: 'INV-2026-F001',
      direction: 'SALES',
      partyId: customerParty.id,
      notes: 'Draft fixture sales invoice — not issued.',
      lines: [{ description: 'Metformin HCl 500mg tablets (seed fixture)', qty: 2, unitPriceCents: 150000, position: 0 }],
    },
    {
      number: 'BILL-2026-F001',
      direction: 'PURCHASE',
      partyId: supplierParty.id,
      notes: 'Draft fixture purchase invoice — not issued.',
      lines: [{ description: 'Active pharmaceutical ingredient (seed fixture)', qty: 2, unitPriceCents: 150000, position: 0 }],
    },
  ]
  for (const fixture of financeInvoiceFixtures) {
    const lineData = fixture.lines.map((line) => ({
      companyId,
      ...line,
      ...lineTotals(line.qty, line.unitPriceCents),
      taxRateId: rate.id,
    }))
    const subtotalCents = lineData.reduce((sum, line) => sum + line.netCents, 0)
    const taxCents = lineData.reduce((sum, line) => sum + line.taxCents, 0)
    const totalCents = subtotalCents + taxCents
    await prisma.financeInvoice.upsert({
      where: { companyId_number: { companyId, number: fixture.number } },
      update: {},
      create: {
        companyId,
        number: fixture.number,
        direction: fixture.direction,
        type: 'INVOICE',
        status: 'DRAFT',
        partyId: fixture.partyId,
        issueDate: '2026-01-15',
        dueDate: '2026-02-14',
        currency: 'KES',
        taxInclusive: false,
        taxRateId: rate.id,
        subtotalCents,
        taxCents,
        totalCents,
        paidCents: 0,
        balanceCents: totalCents,
        notes: fixture.notes,
        classification: 'INTERNAL',
        journalId: null,
        createdById: admin.id,
        lines: { create: lineData },
      },
    })
  }
  console.log(`✓ Seeded ${financeInvoiceFixtures.length} draft finance invoices`)

  await prisma.financeBudget.upsert({
    where: { companyId_code: { companyId, code: 'BUDGET-2026-Q4' } },
    update: {},
    create: {
      companyId,
      code: 'BUDGET-2026-Q4',
      name: 'Q4 2026 Operating Budget (fixture)',
      period: 'QUARTERLY',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'APPROVED',
      approvedById: admin.id,
      approvedAt: new Date(),
      classification: 'INTERNAL',
      createdById: admin.id,
      lines: {
        create: [
          { companyId, accountId: financeAccountsByCode.SALES.id, amountCents: 50000000 },
          { companyId, accountId: financeAccountsByCode.EXPENSE.id, amountCents: 20000000 },
        ],
      },
    },
  })
  console.log('✓ Seeded approved Q4 finance budget')

  // ------------------------------------------------------------- phase 7 sales
  // Fixture documents are DRAFT so no statutory rate is applied and invoice
  // creation stays a deliberate, permissioned action. `rate.id` is stored only
  // as an intended VAT reference; it is the same UNVERIFIED fixture rate, so
  // finance must reject invoice issue until COMPLIANCE verifies it.
  const salesLineTotals = (qty, unitPriceCents) => {
    const netCents = Math.round(qty * unitPriceCents)
    return { netCents, taxCents: 0, grossCents: netCents }
  }
  const salesFixtureLines = [
    { description: 'Metformin HCl 500mg tablets (sales fixture)', qty: 2, unitPriceCents: 150000, position: 0 },
    { description: 'Glucometer strips (sales fixture)', qty: 5, unitPriceCents: 25000, position: 1 },
  ]
  const salesFixtureTotals = salesFixtureLines.reduce((totals, line) => {
    const lineTotalsValue = salesLineTotals(line.qty, line.unitPriceCents)
    totals.subtotalCents += lineTotalsValue.netCents
    totals.totalCents += lineTotalsValue.grossCents
    return totals
  }, { subtotalCents: 0, taxCents: 0, totalCents: 0 })
  const salesLineData = salesFixtureLines.map((line) => ({
    companyId,
    ...line,
    ...salesLineTotals(line.qty, line.unitPriceCents),
  }))

  const salesQuote = await prisma.salesQuote.upsert({
    where: { companyId_number: { companyId, number: 'QUO-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'QUO-2026-F001',
      status: 'DRAFT',
      partyId: customerParty.id,
      quoteDate: '2026-01-15',
      validUntil: '2026-02-14',
      currency: 'KES',
      taxRateId: rate.id,
      ...salesFixtureTotals,
      notes: 'Draft fixture sales quote — rate reference only, tax applied by finance.',
      classification: 'INTERNAL',
      createdById: admin.id,
      lines: { create: salesLineData },
    },
  })

  const salesOrder = await prisma.salesOrder.upsert({
    where: { companyId_number: { companyId, number: 'ORD-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'ORD-2026-F001',
      status: 'DRAFT',
      partyId: customerParty.id,
      quoteId: salesQuote.id,
      orderDate: '2026-01-20',
      requestedDate: '2026-02-14',
      currency: 'KES',
      taxRateId: rate.id,
      ...salesFixtureTotals,
      notes: 'Draft fixture sales order — confirm before delivery or invoicing.',
      classification: 'INTERNAL',
      financeInvoiceId: null,
      createdById: admin.id,
      lines: { create: salesLineData },
    },
  })

  const deliveryNote = await prisma.deliveryNote.upsert({
    where: { companyId_number: { companyId, number: 'DN-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'DN-2026-F001',
      status: 'DRAFT',
      partyId: customerParty.id,
      orderId: salesOrder.id,
      deliveryDate: '2026-01-25',
      currency: 'KES',
      ...salesFixtureTotals,
      notes: 'Draft fixture delivery note — issue when goods leave the warehouse.',
      classification: 'INTERNAL',
      createdById: admin.id,
      lines: { create: salesLineData },
    },
  })

  await prisma.salesReturn.upsert({
    where: { companyId_number: { companyId, number: 'RET-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'RET-2026-F001',
      status: 'DRAFT',
      partyId: customerParty.id,
      orderId: salesOrder.id,
      deliveryNoteId: deliveryNote.id,
      returnDate: '2026-02-01',
      reason: 'Fixture return — customer quality query.',
      currency: 'KES',
      ...salesFixtureTotals,
      classification: 'INTERNAL',
      createdById: admin.id,
      lines: { create: salesLineData },
    },
  })
  console.log('✓ Seeded draft sales quote, order, delivery note and return fixtures')

  // ---------------------------------------------------------------- phase 8
  // Inventory fixtures are intentionally DRAFT/SOURCE records only: no stock
  // is posted by seeds, so valuation and state transitions stay service-owned.
  // All rows belong to cmp_comet and are guarded by company-scoped unique keys.
  const rawWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'wh_raw_store' } },
    update: {},
    create: {
      companyId, code: 'wh_raw_store', name: 'Raw Material Store',
      location: 'Machakos Plant — Store A', classification: 'INTERNAL', createdById: admin.id,
    },
  })
  const finishedWarehouse = await prisma.warehouse.upsert({
    where: { companyId_code: { companyId, code: 'wh_finished_store' } },
    update: {},
    create: {
      companyId, code: 'wh_finished_store', name: 'Finished Goods Store',
      location: 'Machakos Plant — Store B', classification: 'INTERNAL', createdById: admin.id,
    },
  })

  const apiItem = await prisma.inventoryItem.upsert({
    where: { companyId_code: { companyId, code: 'itm_metformin_api' } },
    update: {},
    create: {
      companyId, code: 'itm_metformin_api', name: 'Metformin HCl API',
      type: 'RAW_MATERIAL', unit: 'KG', standardCostCents: 1250,
      reorderLevel: 300, trackBatches: true, isActive: true,
      description: 'Inventory phase 8 fixture — batch-tracked API.',
      classification: 'INTERNAL', createdById: admin.id,
    },
  })
  const foilItem = await prisma.inventoryItem.upsert({
    where: { companyId_code: { companyId, code: 'itm_blister_foil' } },
    update: {},
    create: {
      companyId, code: 'itm_blister_foil', name: 'Aluminium Blister Foil',
      type: 'PACKAGING', unit: 'EA', standardCostCents: 250,
      reorderLevel: 500, trackBatches: false, isActive: true,
      description: 'Inventory phase 8 fixture — unbatched packaging.',
      classification: 'INTERNAL', createdById: admin.id,
    },
  })

  const releasedBatch = await prisma.inventoryBatch.upsert({
    where: {
      companyId_itemId_batchNumber: {
        companyId, itemId: apiItem.id, batchNumber: 'BAT-MET-2026-001',
      },
    },
    update: {},
    create: {
      companyId, itemId: apiItem.id, batchNumber: 'BAT-MET-2026-001',
      status: 'RELEASED', unitCostCents: 1250,
      manufactureDate: '2026-01-10', expiryDate: '2028-01-09',
      classification: 'INTERNAL', createdById: admin.id,
    },
  })
  await prisma.inventoryBatch.upsert({
    where: {
      companyId_itemId_batchNumber: {
        companyId, itemId: apiItem.id, batchNumber: 'BAT-MET-2026-002',
      },
    },
    update: {},
    create: {
      companyId, itemId: apiItem.id, batchNumber: 'BAT-MET-2026-002',
      status: 'QUARANTINE', unitCostCents: 1250,
      manufactureDate: '2026-02-02', expiryDate: '2028-02-01',
      classification: 'INTERNAL', createdById: admin.id,
    },
  })

  const inventoryBalances = [
    {
      itemId: apiItem.id, warehouseId: rawWarehouse.id, batchId: releasedBatch.id,
      quantity: 250, unitCostCents: 1250, totalValueCents: 312_500,
    },
    {
      itemId: foilItem.id, warehouseId: rawWarehouse.id, batchId: null,
      quantity: 1200, unitCostCents: 250, totalValueCents: 300_000,
    },
  ]
  for (const balance of inventoryBalances) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await prisma.stockBalance.findFirst({
      where: {
        companyId, itemId: balance.itemId, warehouseId: balance.warehouseId,
        ...(balance.batchId ? { batchId: balance.batchId } : { batchId: null }),
      },
      select: { id: true },
    })
    if (existing) continue
    // eslint-disable-next-line no-await-in-loop
    await prisma.stockBalance.create({
      data: {
        companyId, ...balance, classification: 'INTERNAL', createdById: admin.id,
      },
    })
  }

  await prisma.stockMovement.upsert({
    where: { companyId_number: { companyId, number: 'MOV-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'MOV-2026-F001', type: 'RECEIPT',
      itemId: apiItem.id, warehouseId: rawWarehouse.id, batchId: releasedBatch.id,
      quantity: 250, unitCostCents: 1250, totalValueCents: 312_500,
      movementDate: '2026-01-12', referenceType: 'PURCHASE_ORDER', referenceId: 'PO-FIXTURE-001',
      notes: 'Inventory phase 8 fixture receipt.', classification: 'INTERNAL', createdById: admin.id,
    },
  })
  await prisma.stockMovement.upsert({
    where: { companyId_number: { companyId, number: 'MOV-2026-F002' } },
    update: {},
    create: {
      companyId, number: 'MOV-2026-F002', type: 'RECEIPT',
      itemId: foilItem.id, warehouseId: rawWarehouse.id, batchId: null,
      quantity: 1200, unitCostCents: 250, totalValueCents: 300_000,
      movementDate: '2026-01-13', referenceType: 'PURCHASE_ORDER', referenceId: 'PO-FIXTURE-002',
      notes: 'Inventory phase 8 fixture receipt.', classification: 'INTERNAL', createdById: admin.id,
    },
  })

  await prisma.stockTransfer.upsert({
    where: { companyId_number: { companyId, number: 'TRF-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'TRF-2026-F001', status: 'DRAFT',
      sourceWarehouseId: rawWarehouse.id, destinationWarehouseId: finishedWarehouse.id,
      transferDate: '2026-02-10',
      notes: 'Inventory phase 8 fixture — approve to exercise transfer valuation.',
      classification: 'INTERNAL', createdById: admin.id,
      lines: {
        create: [{
          companyId, itemId: foilItem.id, batchId: null, quantity: 100,
          unitCostCents: 0, totalValueCents: 0, position: 0,
          classification: 'INTERNAL', createdById: admin.id,
        }],
      },
    },
  })

  await prisma.stockCount.upsert({
    where: { companyId_number: { companyId, number: 'CNT-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'CNT-2026-F001', status: 'DRAFT',
      warehouseId: rawWarehouse.id, countDate: '2026-02-15',
      notes: 'Inventory phase 8 fixture — record and approve to post variance.',
      classification: 'INTERNAL', createdById: admin.id,
      lines: {
        create: [{
          companyId, itemId: foilItem.id, batchId: null,
          expectedQty: 1200, countedQty: 1200, varianceQty: 0,
          unitCostCents: 250, varianceValueCents: 0, position: 0,
          classification: 'INTERNAL', createdById: admin.id,
        }],
      },
    },
  })
  console.log('✓ Seeded inventory items, warehouses, batches, balances, movements, transfer and count fixtures')

  // ---------------------------------------------------------------- phase 9
  // Procurement fixtures stay DRAFT and post no stock: approvals, receipts and
  // stock movements remain service-owned. All rows are cmp_comet-only and use
  // company-scoped document numbers so repeated seeds update rather than duplicate.
  const requisitionFixture = await prisma.purchaseRequisition.upsert({
    where: { companyId_number: { companyId, number: 'REQ-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'REQ-2026-F001', status: 'DRAFT',
      requisitionDate: '2026-03-01', requiredDate: '2026-03-20',
      supplierId: supplierParty.id, currency: 'KES', totalCents: 125_000,
      notes: 'Procurement phase 9 fixture — submit and approve to exercise conversion.',
      classification: 'INTERNAL', createdById: admin.id,
      lines: {
        create: [{
          companyId, itemId: apiItem.id, warehouseId: rawWarehouse.id,
          description: 'Metformin HCl API purchase requisition line',
          qty: 100, unitCostCents: 1250, totalCents: 125_000, position: 0,
          classification: 'INTERNAL', createdById: admin.id,
        }],
      },
    },
  })

  const orderFixture = await prisma.purchaseOrder.upsert({
    where: { companyId_number: { companyId, number: 'PO-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'PO-2026-F001', status: 'DRAFT',
      requisitionId: requisitionFixture.id, supplierId: supplierParty.id,
      orderDate: '2026-03-02', expectedDate: '2026-03-22',
      currency: 'KES', totalCents: 125_000,
      notes: 'Procurement phase 9 fixture — approve and send before receiving.',
      classification: 'INTERNAL', createdById: admin.id,
      lines: {
        create: [{
          companyId, itemId: apiItem.id, warehouseId: rawWarehouse.id,
          description: 'Metformin HCl API purchase order line',
          qty: 100, unitCostCents: 1250, totalCents: 125_000, position: 0,
          classification: 'INTERNAL', createdById: admin.id,
        }],
      },
    },
  })

  const orderLineFixture = await prisma.purchaseOrderLine.findFirst({
    where: { companyId, orderId: orderFixture.id },
    select: { id: true },
    orderBy: [{ position: 'asc' }],
  })
  if (orderLineFixture) {
    const receiptFixture = await prisma.goodsReceipt.upsert({
      where: { companyId_number: { companyId, number: 'GRN-2026-F001' } },
      update: {},
      create: {
        companyId, number: 'GRN-2026-F001', status: 'DRAFT',
        orderId: orderFixture.id, supplierId: supplierParty.id,
        receiptDate: '2026-03-05', currency: 'KES', totalCents: 12_500,
        notes: 'Procurement phase 9 fixture — receive to post stock through inventory.',
        classification: 'INTERNAL', createdById: admin.id,
        lines: {
          create: [{
            companyId, orderLineId: orderLineFixture.id, itemId: apiItem.id,
            warehouseId: rawWarehouse.id, batchId: releasedBatch.id,
            description: 'Metformin HCl API receipt line',
            qty: 10, unitCostCents: 1250, totalCents: 12_500, position: 0,
            classification: 'INTERNAL', createdById: admin.id,
          }],
        },
      },
    })

    const receiptLineFixture = await prisma.goodsReceiptLine.findFirst({
      where: { companyId, receiptId: receiptFixture.id },
      select: { id: true },
      orderBy: [{ position: 'asc' }],
    })
    if (receiptLineFixture) {
      await prisma.supplierReturn.upsert({
        where: { companyId_number: { companyId, number: 'RET-2026-F001' } },
        update: {},
        create: {
          companyId, number: 'RET-2026-F001', status: 'DRAFT',
          orderId: orderFixture.id, receiptId: receiptFixture.id,
          supplierId: supplierParty.id, returnDate: '2026-03-08',
          reason: 'Procurement phase 9 fixture — quality sample.',
          currency: 'KES', totalCents: 2_500,
          classification: 'INTERNAL', createdById: admin.id,
          lines: {
            create: [{
              companyId, receiptLineId: receiptLineFixture.id, itemId: apiItem.id,
              warehouseId: rawWarehouse.id, batchId: releasedBatch.id,
              description: 'Metformin HCl API supplier return line',
              qty: 2, unitCostCents: 1250, totalCents: 2_500, position: 0,
              classification: 'INTERNAL', createdById: admin.id,
            }],
          },
        },
      })
    }
  }
  console.log('✓ Seeded draft purchase requisition, order, goods receipt and supplier return fixtures')

  // ---------------------------------------------------------------- phase 10
  // Service fixtures stay DRAFT/OPEN and post no stock or invoices: activation,
  // assignment, visits, part issue and invoicing remain service-owned. All rows
  // are cmp_comet-only and use company-scoped numbers so repeated seeds update
  // rather than duplicate.
  await prisma.serviceContract.upsert({
    where: { companyId_number: { companyId, number: 'SVC-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'SVC-2026-F001', status: 'DRAFT',
      customerId: customerParty.id, startDate: '2026-04-01', endDate: '2027-03-31',
      currency: 'KES', monthlyFeeCents: 1_200_000,
      responseSlaHours: 4, resolutionSlaHours: 48,
      notes: 'Service phase 10 fixture — activate to open contract-linked tickets.',
      classification: 'INTERNAL', createdById: admin.id,
      lines: {
        create: [{
          companyId, itemId: apiItem.id,
          description: 'Preventive maintenance coverage',
          coverageQty: 1, unitPriceCents: 1_200_000, position: 0,
          classification: 'INTERNAL', createdById: admin.id,
        }],
      },
    },
  })

  const serviceTicketFixture = await prisma.serviceTicket.upsert({
    where: { companyId_number: { companyId, number: 'TKT-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'TKT-2026-F001', status: 'OPEN', priority: 'HIGH',
      customerId: customerParty.id,
      subject: 'Phase 10 fixture — laboratory analyser fault',
      description: 'Direct-customer fixture using the documented default SLA targets.',
      openedAt: new Date('2026-04-02T08:00:00.000Z'),
      responseDueAt: new Date('2026-04-02T12:00:00.000Z'),
      resolutionDueAt: new Date('2026-04-04T08:00:00.000Z'),
      classification: 'INTERNAL', createdById: admin.id,
    },
  })

  await prisma.workOrder.upsert({
    where: { companyId_number: { companyId, number: 'WO-2026-F001' } },
    update: {},
    create: {
      companyId, number: 'WO-2026-F001', status: 'DRAFT',
      ticketId: serviceTicketFixture.id,
      summary: 'Phase 10 fixture — diagnose and repair analyser',
      labourCents: 10_000, partsCents: 0, totalCents: 10_000, currency: 'KES',
      notes: 'Service phase 10 fixture — schedule and complete to exercise totals.',
      classification: 'INTERNAL', createdById: admin.id,
      lines: {
        create: [{
          companyId, itemId: apiItem.id,
          description: 'Technician labour',
          qty: 2, unitPriceCents: 5_000, totalCents: 10_000, position: 0,
          classification: 'INTERNAL', createdById: admin.id,
        }],
      },
    },
  })
  console.log('✓ Seeded draft service contract, ticket and work order fixtures')

  // ---------------------------------------------------------------- phase 11
  // HR fixtures are cmp_comet-only and strictly idempotent. Bank/account and
  // KRA PIN values are encrypted at rest; API DTOs return masks only. The rate
  // fixture is deliberately UNVERIFIED: COMPLIANCE must verify it (and the other
  // four statutory components) before any payroll calculation can use a rate.
  const hrEmployeeFixture = await prisma.employee.upsert({
    where: { companyId_employeeNumber: { companyId, employeeNumber: 'EMP-2026-F001' } },
    update: {},
    create: {
      companyId,
      employeeNumber: 'EMP-2026-F001',
      firstName: 'Amina',
      lastName: 'Wanjiku',
      email: 'amina.wanjiku@example.invalid',
      status: 'ACTIVE',
      employmentType: 'PERMANENT',
      hiredAt: new Date('2026-01-05T00:00:00.000Z'),
      annualLeaveBalanceDays: 21,
      bankNameEncrypted: encryptString('Fixture Bank'),
      bankAccountEncrypted: encryptString('0000000001'),
      kraPinEncrypted: encryptString('A000000000Z'),
      notes: 'HR phase 11 fixture — bank values are encrypted and masked in DTOs.',
      classification: 'CONFIDENTIAL',
      createdById: admin.id,
    },
  })

  await prisma.employmentContract.upsert({
    where: { companyId_number: { companyId, number: 'EMP-2026-C001' } },
    update: {},
    create: {
      companyId,
      number: 'EMP-2026-C001',
      employeeId: hrEmployeeFixture.id,
      status: 'ACTIVE',
      employmentType: 'PERMANENT',
      startDate: new Date('2026-01-05T00:00:00.000Z'),
      basicSalaryCents: 12_000_000,
      allowancesCents: 1_500_000,
      currency: 'KES',
      notes: 'HR phase 11 fixture — activate payroll only after all rates are VERIFIED.',
      classification: 'CONFIDENTIAL',
      activatedAt: new Date('2026-01-05T00:00:00.000Z'),
      createdById: admin.id,
    },
  })

  await prisma.payrollRate.upsert({
    where: {
      companyId_kind_effectiveFrom: {
        companyId,
        kind: 'PAYE',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
    },
    update: {},
    create: {
      companyId,
      kind: 'PAYE',
      rateBps: 3000,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      sourceReference: 'Fixture PAYE table - verify before production use',
      verificationNote: null,
      verifiedById: null,
      verifiedAt: null,
      status: 'UNVERIFIED',
      classification: 'CONFIDENTIAL',
      createdById: admin.id,
    },
  })
  console.log('✓ Seeded HR employee with encrypted bank details, active contract and UNVERIFIED PAYE rate')

  // -------------------------------------------------------------- phase 12
  // Project fixtures are cmp_comet-only and strictly idempotent. They are
  // deliberately DRAFT/PLANNED: no fixture implies approval, billing or a
  // completed lifecycle. Money stays in integer cents and numbers are globally
  // unique per tenant through the compound keys in the schema.
  const projectFixture = await prisma.project.upsert({
    where: { companyId_number: { companyId, number: 'PRJ-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'PRJ-2026-F001',
      name: 'Phase 12 fixture project',
      description: 'Fixture project for projects lifecycle and budget-link tests.',
      status: 'PLANNED',
      budgetCents: 5_000_000,
      currency: 'KES',
      plannedStart: new Date('2026-01-05T00:00:00.000Z'),
      plannedEnd: new Date('2026-03-05T00:00:00.000Z'),
      classification: 'INTERNAL',
      createdById: admin.id,
    },
  })

  await prisma.milestone.upsert({
    where: { companyId_number: { companyId, number: 'MS-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'MS-2026-F001',
      projectId: projectFixture.id,
      name: 'Fixture milestone',
      description: 'First fixture milestone — remains PLANNED.',
      status: 'PLANNED',
      dueAt: new Date('2026-02-05T00:00:00.000Z'),
      classification: 'INTERNAL',
      createdById: admin.id,
    },
  })

  await prisma.projectTask.upsert({
    where: { companyId_number: { companyId, number: 'TASK-2026-F001' } },
    update: {},
    create: {
      companyId,
      number: 'TASK-2026-F001',
      projectId: projectFixture.id,
      title: 'Fixture task',
      description: 'First fixture task — remains TODO.',
      status: 'TODO',
      position: 0,
      classification: 'INTERNAL',
      createdById: admin.id,
    },
  })
  console.log('✓ Seeded PLANNED project with PLANNED milestone and TODO task fixtures')

  // -------------------------------------------------------------- phase 13
  // Manufacturing fixtures are cmp_comet-only and idempotent. The BOM is
  // APPROVED with an explicit QA approver identifier; the production order
  // stays DRAFT. No batch, QC result or stock movement is implied by a fixture.
  const finishedItem = await prisma.inventoryItem.upsert({
    where: { companyId_code: { companyId, code: 'itm_metformin_500mg_fg' } },
    update: {},
    create: {
      companyId,
      code: 'itm_metformin_500mg_fg',
      name: 'Metformin HCl 500mg Tablets',
      type: 'FINISHED_GOOD',
      unit: 'EA',
      standardCostCents: 3750,
      reorderLevel: 1000,
      trackBatches: true,
      isActive: true,
      description: 'Manufacturing phase 13 fixture — finished batch-tracked tablets.',
      classification: 'INTERNAL',
      createdById: admin.id,
    },
  })

  const workCenterFixture = await prisma.workCenter.upsert({
    where: { companyId_code: { companyId, code: 'WC-001' } },
    update: {},
    create: {
      companyId,
      code: 'WC-001',
      name: 'Tablet Compression Line 1',
      description: 'Fixture work center for manufacturing lifecycle tests.',
      status: 'ACTIVE',
      capacityPerDay: 5000,
      classification: 'INTERNAL',
      createdByUserId: admin.id,
    },
  })

  const bomFixture = await prisma.bom.upsert({
    where: { companyId_code: { companyId, code: 'BOM-2026-F001' } },
    update: {},
    create: {
      companyId,
      code: 'BOM-2026-F001',
      name: 'Metformin 500mg BOM',
      productItemId: finishedItem.id,
      version: '1',
      status: 'APPROVED',
      standardCostCents: 3750,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      approvedByUserId: admin.id,
      approvedAt: new Date('2026-01-02T00:00:00.000Z'),
      classification: 'INTERNAL',
      createdByUserId: null,
    },
  })

  for (const line of [
    { itemId: apiItem.id, quantity: 1, unitCostCents: 1250, sequence: 0 },
    { itemId: foilItem.id, quantity: 10, unitCostCents: 250, sequence: 1 },
  ]) {
    await prisma.bomLine.upsert({
      where: { bomId_itemId: { bomId: bomFixture.id, itemId: line.itemId } },
      update: {},
      create: {
        companyId,
        bomId: bomFixture.id,
        itemId: line.itemId,
        quantity: line.quantity,
        uom: line.itemId === apiItem.id ? 'KG' : 'EA',
        unitCostCents: line.unitCostCents,
        isCritical: line.itemId === apiItem.id,
        sequence: line.sequence,
        classification: 'INTERNAL',
      },
    })
  }

  await prisma.productionOrder.upsert({
    where: { companyId_orderNumber: { companyId, orderNumber: 'PO-2026-F001' } },
    update: {},
    create: {
      companyId,
      orderNumber: 'PO-2026-F001',
      bomId: bomFixture.id,
      workCenterId: workCenterFixture.id,
      productItemId: finishedItem.id,
      quantityPlanned: 100,
      uom: 'EA',
      status: 'DRAFT',
      plannedStartDate: new Date('2026-02-01T00:00:00.000Z'),
      plannedEndDate: new Date('2026-02-05T00:00:00.000Z'),
      classification: 'INTERNAL',
      createdByUserId: null,
    },
  })
  console.log('✓ Seeded active work center, approved BOM and DRAFT production order fixtures')

  // -------------------------------------------------------------- phase 14
  // Reporting fixtures are cmp_comet-only, idempotent and inert: one
  // allow-listed definition, one dashboard and one widget. No report run is
  // seeded, so dashboard summaries explicitly report NO_RUN_YET instead of
  // showing borrowed or fabricated numbers.
  const reportDefinitionFixture = await prisma.reportDefinition.upsert({
    where: { companyId_code: { companyId, code: 'RPT-2026-F001' } },
    update: {},
    create: {
      companyId,
      code: 'RPT-2026-F001',
      name: 'Phase 14 fixture trial balance',
      description: 'Allow-listed reporting fixture. Run it explicitly to collect live finance data.',
      reportKey: 'finance.trial-balance',
      querySpec: { reportKey: 'finance.trial-balance' },
      format: 'JSON',
      classification: 'INTERNAL',
      createdByUserId: admin.id,
    },
  })

  const reportDashboardFixture = await prisma.dashboard.upsert({
    where: { companyId_code: { companyId, code: 'DASH-2026-F001' } },
    update: {},
    create: {
      companyId,
      code: 'DASH-2026-F001',
      name: 'Phase 14 fixture dashboard',
      description: 'Fixture dashboard for reporting contract and smoke tests.',
      classification: 'INTERNAL',
      createdByUserId: admin.id,
    },
  })

  await prisma.dashboardWidget.upsert({
    where: { dashboardId_code: { dashboardId: reportDashboardFixture.id, code: 'WDG-2026-F001' } },
    update: {},
    create: {
      companyId,
      dashboardId: reportDashboardFixture.id,
      definitionId: reportDefinitionFixture.id,
      code: 'WDG-2026-F001',
      title: 'Trial balance totals',
      type: 'METRIC',
      reportKey: 'finance.trial-balance',
      position: 0,
      classification: 'INTERNAL',
      createdByUserId: admin.id,
    },
  })
  console.log('✓ Seeded allow-listed report definition, dashboard and widget fixtures (no runs)')

  // -------------------------------------------------------------- phase 15
  // Developer fixtures are cmp_comet-only and strictly idempotent. The API key
  // hash and signing secret are derived from obvious development markers; no
  // real credential, card data or external endpoint is seeded. The subscription
  // is DISABLED and the delivery is terminal so a retry cannot call a network.
  const fixturePublicScopes = ['public:health:read', 'public:finance:read', 'public:sales:read']
  const fixtureKeyHash = sha256('comet-fixture-public-api-key-v1-not-a-real-secret')
  const fixtureWebhookSecret = 'comet-fixture-webhook-signing-secret-v1-not-a-real-secret'
  const fixtureWebhookSecretHash = sha256(fixtureWebhookSecret)

  const publicApiKeyFixture = await prisma.apiKey.upsert({
    where: { keyHash: fixtureKeyHash },
    update: {},
    create: {
      companyId,
      userId: admin.id,
      name: 'Phase 15 fixture public API key',
      keyPrefix: 'cmt_fixture_',
      keyHash: fixtureKeyHash,
      scopes: fixturePublicScopes,
      rateLimit: 60,
    },
  })

  const publicClientFixture = await prisma.publicClient.upsert({
    where: { companyId_apiKeyId: { companyId, apiKeyId: publicApiKeyFixture.id } },
    update: {},
    create: {
      companyId,
      apiKeyId: publicApiKeyFixture.id,
      name: 'Phase 15 fixture public client',
      scopes: fixturePublicScopes,
      status: 'ACTIVE',
      createdByUserId: admin.id,
    },
  })

  const webhookSubscriptionFixture = await prisma.webhookSubscription.upsert({
    where: { companyId_secretHash: { companyId, secretHash: fixtureWebhookSecretHash } },
    update: {},
    create: {
      companyId,
      clientId: publicClientFixture.id,
      url: 'https://example.invalid/comet/webhooks/fixture',
      eventTypes: ['InvoiceIssued', 'PaymentRecorded'],
      secretEncrypted: encryptString(fixtureWebhookSecret),
      secretHash: fixtureWebhookSecretHash,
      status: 'DISABLED',
      createdByUserId: admin.id,
    },
  })

  await prisma.webhookDelivery.upsert({
    where: {
      subscriptionId_eventId: {
        subscriptionId: webhookSubscriptionFixture.id,
        eventId: 'evt_fixture_phase15_invoice_issued',
      },
    },
    update: {},
    create: {
      companyId,
      subscriptionId: webhookSubscriptionFixture.id,
      eventId: 'evt_fixture_phase15_invoice_issued',
      eventType: 'InvoiceIssued',
      payload: {
        eventId: 'evt_fixture_phase15_invoice_issued',
        eventType: 'InvoiceIssued',
        entityType: 'INVOICE',
        entityId: 'inv_fixture_phase15_0001',
        occurredAt: '2026-11-23T00:00:00.000Z',
        correlationId: 'cor_fixture_phase15_0001',
        classification: 'INTERNAL',
      },
      status: 'FAILED',
      attempts: 1,
      lastError: 'NETWORK_ERROR',
      responseStatus: null,
      nextAttemptAt: null,
      deliveredAt: null,
    },
  })
  console.log('✓ Seeded inert public client, webhook subscription and failed delivery fixtures')

  console.log('\nSeed complete ✔')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
