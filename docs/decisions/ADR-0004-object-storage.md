# ADR-0004: Cloudflare R2 for Encrypted Object Storage

- **Status:** Accepted with compliance gate (Phase 1, pending architecture review)
- **Date:** 2026-11-22
- **Deciders:** Product owner, principal architect

## Context

Messaging attachments, generated documents, previews, and backups need S3-compatible object storage with signed expiring URLs, lifecycle rules, and predictable cost. The user approved Cloudflare R2. Kenya ODPC cross-border/transfer obligations require the storage location and processor terms to be documented before real personal data is stored.

## Decision

- Use **Cloudflare R2** with S3-compatible API.
- Store objects encrypted with AES-256 server-side encryption plus application-level envelope encryption for restricted files.
- Use short-lived signed URLs for upload/download.
- Keep object metadata, classification, version, and audit references in PostgreSQL.
- Use a separate R2 repository/prefix and separate key for encrypted backups.
- Do not enable production use with real personal data until the ODPC review in `docs/architecture/07-compliance-kenya.md` is complete.

## Consequences

### Positive

- No egress fees; good fit for attachments and document delivery.
- S3 compatibility keeps provider replacement feasible.
- Signed URLs keep object reads auditable and time-bounded.

### Negative

- Data location/region behaviour must be confirmed and documented.
- R2-specific APIs/features must stay behind the storage interface.
- Virus scanning and previews remain our responsibility.

## Alternatives considered

| Alternative | Why not selected |
|---|---|
| Wasabi | Viable; requires latency/residency confirmation |
| MinIO on VPS | Full control but we own durability, patching, and expansion |
| AWS S3 | Mature but higher egress cost; residency still reviewable |

## Review triggers

- ODPC guidance requires in-country storage unavailable from R2.
- Latency tests show unacceptable upload/preview performance.
- Egress or operations pricing changes materially.
