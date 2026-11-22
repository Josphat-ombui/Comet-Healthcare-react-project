# Changelog

All notable changes to the Comet Healthcare platform are documented here.

The format follows a phase-gate model: each enterprise phase ends with passing tests, an updated OpenAPI contract, updated documentation, and a review stop.

---

## [Unreleased]

### Phase 1 — Enterprise architecture (documentation only)

**Added**

- `docs/architecture/00-overview.md` — baseline, target architecture, system context, package map.
- `docs/architecture/01-bounded-contexts.md` — context ownership, events, dependency rules.
- `docs/architecture/02-module-map.md` — workspace layout, API namespaces, request lifecycle.
- `docs/architecture/03-deployment-topology.md` — single VPS + Docker Compose topology, sizing, backup and deploy strategy.
- `docs/architecture/04-security-architecture.md` — trust boundaries, RLS, encryption, audit, DLP, PCI scope.
- `docs/architecture/05-data-flows.md` — Mermaid diagrams for API, messaging, files, webhooks, reporting, backups.
- `docs/architecture/06-cost-estimate.md` — launch/staging/k3s/Lightsail cost bands and licensing posture.
- `docs/architecture/07-compliance-kenya.md` — ODPC, KRA/eTIMS, statutory-rate, PCI, and GMP-boundary notes.
- `docs/decisions/ADR-0001-modular-monolith.md` through `ADR-0005-auth-strategy.md`.
- `docs/openapi/README.md` and `docs/openapi/openapi.yaml` — Phase 1 contract skeleton.
- `CHANGELOG.md` — phase gate history.

**Changed**

- No application source code changed in Phase 1.

**Database changes**

- None.

**New dependencies / licences**

- None. Mermaid diagrams are Markdown source.

**Decisions recorded**

- Product identity: Comet Healthcare (the “Crown Appliances” brief name was a placeholder).
- Hosting: single VPS with Docker Compose.
- Data access: PostgreSQL 16, Prisma CRUD plus raw SQL for RLS/partitions.
- Object storage: Cloudflare R2, gated by ODPC data-location review.
- Auth: local + TOTP + OIDC in Phase 3; SAML/LDAP/WebAuthn deferred behind interfaces.
- Manufacturing: included as Phase 13.

**Verification**

- `npm test` — 23 passed.
- `npm run test:smoke` — 31 passed.
- `npm run lint` — warnings only (pre-existing).
- `npm run build` — passed.
- `docs/openapi/openapi.yaml` — parsed successfully as OpenAPI 3.1.0.

---

## [0.1.0] - 2026-11-22

### Homepage and content enhancements

**Added**

- Blue-led palette tokens and local hero readability scrim behind copy.
- QuickLinks CTA band and additional homepage CTAs.
- Redesigned FinalCTA/CTASection and CMS defaults.
- Optimized WebP gallery media serving and tests (separate workspace commit).

**Changed**

- Hero photo veil reduced to approximately 50% transparency.
- Hero copy/photo balance and CTA hierarchy refined.
