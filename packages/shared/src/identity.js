// Identity provider and MFA contracts. Phase 3 implements LocalIdentityProvider,
// OidcIdentityProvider and TotpMfaProvider. SAML, LDAP and WebAuthn adapters can
// implement these interfaces later without changing callers or UI.

/**
 * @typedef {object} IdentityResult
 * @property {string} email
 * @property {string} [firstName]
 * @property {string} [lastName]
 * @property {string} [externalId]
 * @property {Record<string, unknown>} [claims]
 */

/**
 * @typedef {object} IdentityProvider
 * @property {string} id
 * @property {(options: Record<string, unknown>) => string} authorizationUrl
 * @property {(code: string, options: Record<string, unknown>) => Promise<IdentityResult>} exchangeCode
 */

/**
 * @typedef {object} MfaChallenge
 * @property {string} secretEncrypted
 * @property {string[]} recoveryCodes
 */

/**
 * @typedef {object} MfaProvider
 * @property {string} id
 * @property {() => MfaChallenge} enrol
 * @property {(secret: string, code: string) => boolean} verify
 */

export const IDENTITY_PROVIDER_IDS = Object.freeze(['local', 'oidc'])
export const MFA_PROVIDER_IDS = Object.freeze(['totp'])

export const PASSWORD_POLICY = Object.freeze({
  minLength: 12,
  maxLength: 128,
  historyLimit: 5,
  requireUpper: true,
  requireLower: true,
  requireDigit: true,
  requireSymbol: true,
})

export const SESSION_POLICY = Object.freeze({
  accessTokenTtl: '15m',
  refreshTokenTtlSeconds: 30 * 24 * 60 * 60,
  maxConcurrentSessions: 5,
  idleTimeoutSeconds: 8 * 60 * 60,
  absoluteTimeoutSeconds: 30 * 24 * 60 * 60,
})

export const MFA_POLICY = Object.freeze({
  issuer: 'Comet Healthcare',
  digits: 6,
  periodSeconds: 30,
  window: 1,
  recoveryCodeCount: 10,
})

export function isBreachedPassword(breachCount) {
  return Number.isFinite(breachCount) && breachCount > 0
}
