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

  console.log('\nSeed complete ✔')
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
