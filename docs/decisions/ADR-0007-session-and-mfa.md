# ADR-0007: Session, MFA, and Password Strategy

- **Status:** Accepted (Phase 3)
- **Date:** 2026-11-22
- **Deciders:** Principal architect

## Context

Phase 3 must deliver local authentication, TOTP MFA, recovery codes, session listing and revocation, concurrent-session limits, and password policy without adding npm dependencies or breaking the existing storefront login contract.

## Decision

- Access tokens are JWTs; refresh tokens are opaque 256-bit random values stored only as SHA-256 hashes in `Session`.
- The refresh token travels in an HttpOnly, Secure (production), SameSite=Strict cookie. It rotates on every use; reuse of a revoked hash is rejected.
- `JWT_ACCESS_TTL` defaults to the existing `JWT_EXPIRES_IN` value so the storefront keeps working. Deployments may opt into `15m` tokens once the web client handles refresh.
- `POST /api/auth/login` keeps returning `{ token, user }`; additional fields are additive. When MFA is enabled it returns a short-lived `scope=mfa` challenge instead of an access token.
- TOTP uses RFC 6238 with a ±1 step window. Recovery codes are ten single-use codes stored as SHA-256 hashes. Secrets are encrypted with AES-256-GCM using `OBJECT_ENCRYPTION_KEY`.
- Passwords require 12–128 characters with upper, lower, digit, and symbol; the last five hashes cannot be reused.
- HIBP k-anonymity checks send only the first five SHA-1 prefix characters. The check fails open by default for offline development; `PASSWORD_BREACH_ENFORCE=true` makes network failure or a known breach fatal.
- Failed logins increment a counter; after `LOGIN_MAX_ATTEMPTS` the account is locked for `LOGIN_WINDOW_SECONDS`. All credential and session events are audited with redaction.
- OIDC is a provider interface. It returns 503 until `OIDC_ISSUER`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET` are configured. SAML, LDAP, and WebAuthn remain deferred behind the same interface.

## Consequences

### Positive

- Existing frontends continue to work unchanged; new clients get stronger session controls.
- Stolen refresh cookies are detectable because rotation invalidates the previous hash.
- Restricted values (secrets, tokens, passwords) never appear in logs or audit metadata.

### Negative

- Refresh cookies require the ERP/CMS clients to call the API with `credentials: 'include'` and same-site deployment in production.
- The default long-lived access token weakens short-TTL assumptions; production deployments should set `JWT_ACCESS_TTL=15m` and add a refresh interceptor.
- HIBP enforcement depends on outbound HTTPS from the API host.

## Review triggers

- Concurrent login tests show sessions being evicted unexpectedly.
- OIDC provider discovery or JWKS rotation fails.
- Compliance requires WebAuthn or SAML sooner than planned.
