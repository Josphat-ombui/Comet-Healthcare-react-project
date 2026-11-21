# Master Prompt: Transform Comet Healthcare Website → Premium Enterprise Platform

Copy everything below into Claude Code (or your coding agent of choice), pointed at the
existing Comet codebase. Placeholders in `[BRACKETS]` are the only things you need to fill in
before running it.

---

## Prompt

You are acting as a senior full-stack engineer and product designer. I have an existing
healthcare website built on the **Comet** template/codebase, located at `[REPO PATH OR URL]`.
Your job is to transform it into a **premium, enterprise-grade healthcare platform** with a
real, working backend — not a redesign of static pages alone.

### Step 0 — Audit first
Before changing anything, review the current codebase and produce a short written summary of:
- Current tech stack (frontend framework, styling approach, any existing backend/API, database)
- Current page/component inventory
- Anything already functional vs. purely static/placeholder (forms that don't submit, fake data, etc.)

Do not proceed to building until you've shared this audit and I've confirmed the plan.

### 1. Visual & UX transformation — "premium enterprise healthcare"
Elevate the design system, not just individual pages. Target the aesthetic of platforms like
Cedar, Zocdoc for Providers, or a hospital system's investor-facing site — trustworthy,
clinical-but-warm, not a generic template look.

- **Design tokens**: define a cohesive palette (avoid default blue/teal healthcare cliché —
  propose 2–3 palette directions for me to choose from), a type scale using a professional
  pairing (e.g. a refined serif or geometric sans for headings, a highly legible sans for body),
  consistent spacing/radius/shadow scale.
- **Component polish**: rebuild buttons, cards, forms, navigation, and modals with intentional
  micro-interactions (hover/focus states, subtle transitions, loading skeletons) — nothing
  should feel like an unstyled default.
- **Key pages to rebuild to this standard**: homepage hero + value proposition, services/specialties
  overview, provider/doctor profile pages, patient testimonials, appointment booking flow,
  contact/locations, and a patient/admin dashboard shell.
- **Accessibility**: WCAG 2.1 AA minimum — color contrast, keyboard navigation, ARIA labels on
  interactive elements, focus-visible states.
- **Responsive**: mobile-first, test at 375px / 768px / 1440px breakpoints minimum.

### 2. Backend — make it actually work
Replace any static/mock data and non-functional forms with a real backend.

- **Stack**: `[e.g. Node.js + Express + PostgreSQL + Prisma, OR Python + FastAPI + PostgreSQL + SQLAlchemy — pick one or let the agent recommend based on the audit]`
- **Auth**: role-based accounts (patient, provider, admin), secure password handling
  (bcrypt/argon2), session or JWT-based auth, password reset flow.
- **Core features to make functional**:
  - Appointment booking: real calendar/availability logic, provider schedules, booking
    confirmation, cancellation/reschedule.
  - Patient intake forms that persist to the database, with server-side validation.
  - Provider directory backed by a real database table, with search/filter by specialty/location.
  - Contact/inquiry forms that actually send email/store leads (use a transactional email
    service — note in code where an API key needs to be added).
  - Basic admin dashboard: view/manage appointments and inquiries.
- **Data handling**: treat all patient data as sensitive by default — encrypt data at rest
  where practical, don't log PII, and flag (in comments/README) anywhere real HIPAA compliance
  work would be needed before handling real patient data in production. Don't claim HIPAA
  compliance in the UI or docs unless that work has actually been done.
- **API design**: RESTful (or GraphQL if the audit shows that's already in use), documented
  endpoints, sensible error handling and status codes.

### 3. Non-functional requirements
- **Performance**: lazy-load images, code-split routes, target Lighthouse performance ≥ 90.
- **Testing**: at minimum, unit tests for backend business logic (booking conflicts, auth) and
  a smoke test for each major page.
- **Environment config**: `.env.example` with every required variable documented, no secrets
  committed.
- **README update**: setup instructions, architecture overview, and a clear list of what's
  production-ready vs. what still needs work (e.g. real compliance review, payment integration).

### 4. How to work
- Build incrementally: audit → design system → one section end-to-end (design + backend +
  tests) → next section. Don't attempt everything in one pass.
- After each major section, summarize what changed and what you need from me (API keys,
  content, design preference) before continuing.
- Flag any assumption you're making explicitly rather than silently picking one.

---

## Before you run this
Fill in:
1. `[REPO PATH OR URL]` — where the current Comet codebase lives
2. Your preferred backend stack, or leave it for the agent to recommend after the audit
3. Any real integrations you already have accounts for (email service, SMS, payments) so the
   agent wires to the real thing instead of a placeholder
