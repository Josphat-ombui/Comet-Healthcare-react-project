# OpenAPI Contract

Comet Healthcare Enterprise Platform — Phase 1 skeleton

This directory holds the versioned REST and webhook contracts. Phase 1 creates the skeleton only; endpoints are added and verified in the phase that implements them.

## Files

- `openapi.yaml` — authoritative source of truth.
- Generated HTML/TypeScript clients will be added in Phase 2+ using an OpenJS/permissively licensed generator.

## Conventions

1. All business endpoints are under `/api/<module>/v1/...` from Phase 2 onward.
2. Every request/response includes `X-Correlation-ID`.
3. Tenant context comes from the authenticated session/token, never from a client-supplied `companyId` header.
4. Errors use `application/problem+json` (RFC 9457 style).
5. Request and response DTOs are Zod schemas in `packages/shared` and must match these documents.
6. Webhooks are documented under `webhooks` / `components.webhooks` and tested by contract tests in CI.
7. Breaking changes require a new versioned path or event version.

## Security schemes

- `bearerAuth` — short-lived access JWT for ERP/CMS users.
- `cookieAuth` — refresh session cookie (`HttpOnly; Secure; SameSite=Strict`).
- `apiKeyAuth` — scoped public API key header `X-API-Key`.
- `oauth2` — client credentials for external integrations.

## Phase gate requirement

Each phase ending with an API must update `openapi.yaml`, add/adjust contract tests, and record the change in `CHANGELOG.md` before review.

## Open decisions

- Final generated documentation host (internal only vs developer portal in Phase 15).
- Exact OIDC issuer and claim mapping after provider selection.
- eTIMS payload schema version after current KRA verification.
