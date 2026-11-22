# Kenya Compliance Notes

Comet Healthcare Enterprise Platform — Phase 1  
Version 1.0 · 2026-11-22 · Status: Draft for review — **not legal advice**

This document records requirements and open verification items. It does not claim compliance. Named rates, registrations, and filing rules must be verified against current KRA, ODPC, and government publications before configuration or use.

---

## 1. Kenya Data Protection Act 2019 (ODPC)

### 1.1 Obligations to design for

| Obligation | Platform support |
|---|---|
| Lawful basis and purpose limitation | Data inventory with purpose, lawful basis, and retention per field (Phase 2/3) |
| Data subject rights | `/api/privacy/requests` for access, correction, deletion, objection, portability; all requests logged and approved |
| Operator/processor contracts | Third-party register with DPA status, location, and deletion path |
| Data minimisation | Restricted fields encrypted; events carry IDs not plaintext; logs redacted |
| Security measures | RLS, ABAC, MFA, audit hash chain, encryption, backups, access reviews |
| Breach notification | Incident runbook with ODPC/data-subject notification workflow (Phase 17) |
| Cross-border transfers | R2/payment/SMS/provider locations reviewed before real data; transfer impact notes required |
| Children’s data | Not intentionally collected; public forms state this |
| Registration | ODPC registration/operational requirements to be confirmed for Comet Healthcare’s specific processing |

### 1.2 Open ODPC checks

- [ ] Confirm ODPC registration status/obligations for Comet Healthcare.
- [ ] Complete Record of Processing Activities (ROPA).
- [ ] Determine Cloudflare R2 bucket region and cross-border transfer basis.
- [ ] Confirm VPS provider region and DPA.
- [ ] Confirm processor agreements with Africa’s Talking, OIDC/email/payment providers.
- [ ] Define retention schedules per department/message type and legal-hold process.
- [ ] Approve breach-notification thresholds and ODPC contact path.
- [ ] Complete DPIA for employee monitoring, payments, and internal messaging governance.

---

## 2. Internal communication and privacy

- Staff↔staff and staff↔department communication runs only on the internal platform.
- Shared inboxes have named membership; access is role-scoped and audited.
- Internal notes are never visible to recipients or included in exports requested by non-compliance roles.
- Message history exports require compliance approval and are logged.
- Legal hold suspends retention/deletion for scoped users, departments, or date ranges.
- DLP patterns cover card numbers, Kenyan national ID numbers, KRA PINs, and secrets. Pattern libraries are versioned and reviewed; detected values are masked in logs.

---

## 3. KRA / tax readiness

### 3.1 VAT

- Standard VAT rate to configure: **16%** (verify current rate, exemptions, and effective dates against KRA publications before invoicing).
- VAT is a **configuration table**, not a hardcoded constant.
- Invoice and credit-note payloads must support: supplier PIN, buyer PIN where required, invoice/credit-note number, date, currency KES, line items, VAT category, tax amounts, and totals.
- Tax-inclusive/exclusive pricing must be explicit per record.

### 3.2 eTIMS readiness

Build a provider-agnostic eTIMS-ready payload and queue, but do not claim live filing until certified/verified:

```json
{
  "documentType": "Invoice",
  "supplierPin": "ENCRYPTED_REFERENCE",
  "buyerPin": "ENCRYPTED_REFERENCE_OR_NULL",
  "invoiceNumber": "INV-2026-000123",
  "issueDate": "2026-11-22",
  "currency": "KES",
  "lines": [{ "item": "...", "qty": 1, "unitPrice": 1000, "vatRate": 0.16, "vatAmount": 160 }],
  "totals": { "net": 1000, "vat": 160, "gross": 1160 }
}
```

- Verify current KRA eTIMS API/schema and certification requirements before enabling.
- Store request/response metadata, not secret credentials, in audit logs.
- Failed submissions go to a retry queue with an internal finance/compliance notification.

### 3.3 Statutory payroll tables

PAYE, NSSF, SHIF, and Housing Levy calculations are **not implemented as constants**. Phase 11 must introduce versioned rate tables with:

- `effective_from`, `effective_to`, `source_reference`, `verified_by`, `verified_at`, `status` (`UNVERIFIED` / `VERIFIED`), and approval workflow.
- Clear UI warning: “Verify against current KRA/Government publications before use.”
- Unit tests using fixture tables, not live rates.

---

## 4. Third parties holding personal/financial data

| Third party | Data | Location/status | Action |
|---|---|---|---|
| VPS provider | Database, backups in transit, logs | Region chosen at purchase | DPA + region confirmation |
| Cloudflare R2 | Encrypted attachments, documents, off-site backups | Bucket region/config to confirm | ODPC cross-border assessment + DPA |
| Africa’s Talking | Phone numbers, SMS content | Provider-controlled | Processor agreement, consent, opt-out |
| Payment gateways / M-Pesa | Payment refs, amounts, phone metadata | Provider-controlled | DPA/PCI note; no PAN/CVV stored |
| OIDC provider | Identity attributes | Provider choice pending | DPA + data-location review |
| Web Push/FCM | Device tokens | Provider-controlled | Consent + delete on logout |
| Error tracking | Redacted diagnostics | Self-hosted preferred | Scrub restricted fields |

No third party receives internal staff message bodies by default.

---

## 5. PCI-DSS scope minimisation

- Never store PAN, CVV, or full card data in Postgres, R2, logs, events, or backups.
- Use hosted payment pages/tokenised gateway flows; retain opaque transaction IDs only.
- M-Pesa callback metadata is non-card data but still personal/financial; scope and protect accordingly.
- Confirm target SAQ type with acquirer before go-live.

---

## 6. Pharmaceutical/GMP boundary

Comet Healthcare is a GMP pharmaceutical manufacturer/CDMO. The brief does not require HIPAA, and this platform must **not claim HIPAA compliance**. Phase 1 captures data-classification and audit needs that support GMP record integrity. If regulated GMP batch records or patient-level health data are later stored, a separate regulatory assessment and likely separate validation package are required before use.

---

## 7. Requirement conflicts and proposed resolutions

| Conflict | Resolution |
|---|---|
| “No external email dependency” vs password resets/customer/supplier mail | Internal messaging forbids external addresses; separate external gateway handles only external recipients |
| Cloudflare R2 convenience vs ODPC cross-border duties | Keep R2 as approved default but block production use of real personal data until region/DPA/transfer note is signed off |
| Hardcoded VAT/payroll rates vs changing regulations | Configurable versioned tables with verification status and sign-off |
| Hostinger shared hosting vs WebSocket/Redis/workers | VPS + Compose; Hostinger only optional static/CDN |
| Full SSO/MFA at once vs delivery risk | Phase 3 local + TOTP + OIDC; SAML/LDAP/WebAuthn behind interfaces |
| Manufacturing “if applicable” vs roadmap clarity | Approved for Phase 13; no Phase 1 implementation |
