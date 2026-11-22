# ADR-0005: Phased Authentication Strategy

- **Status:** Accepted (Phase 1, pending architecture review)
- **Date:** 2026-11-22
- **Deciders:** Product owner, principal architect

## Context

The brief requests local auth, OIDC, SAML 2.0, optional LDAP/AD, TOTP, WebAuthn/passkeys, recovery codes, session management, and password breach checks. Delivering every mechanism in Phase 3 would delay the internal messaging goal and multiply test surface. The user approved a phased scope.

## Decision

### Phase 3 delivers

- Local username/password auth with policy enforcement.
- Password breach-list check using HaveIBeenPwned k-anonymity API.
- TOTP MFA and recovery codes.
- OIDC SSO integration behind a provider interface.
- Device/session list, force logout, concurrent-session limits, and anomaly alerts.
- RBAC + ABAC policy enforcement and audit log.

### Deferred behind interfaces

- SAML 2.0 SSO.
- LDAP / Active Directory directory sync.
- WebAuthn/passkeys.

Deferred adapters implement the same `IdentityProvider` and `MfaProvider` interfaces in `packages/shared` so later phases do not require UI rewrites.

## Consequences

### Positive

- Faster path to usable ERP and messaging.
- Focused security testing on fewer mechanisms.
- Clear extension points for enterprise customers.

### Negative

- SAML/LDAP/WebAuthn customers cannot be onboarded in Phase 3.
- Provider interfaces must be designed carefully to avoid premature abstraction mistakes.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Full OIDC/SAML/LDAP/WebAuthn in Phase 3 | Too large; higher defect and review risk |
| Local + TOTP only | Would not meet approved OIDC direction |
| External identity only | Would block local/offline/admin recovery paths |

## Review triggers

- Customer contract requires SAML/LDAP/WebAuthn before later phases.
- OIDC provider choice changes data location or DPA posture.
- Passkey support becomes a baseline expectation for admin accounts.
