// Minimal OIDC code-flow adapter. No external dependency: discovery, token
// exchange and RS256 ID-token verification use fetch + node:crypto. SAML, LDAP
// and WebAuthn adapters implement the same shape in packages/shared/identity.js.

import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

let discoveryCache = null
let jwksCache = null

export function isOidcConfigured() {
  return config.oidc.enabled
}

export function createOidcState() {
  const state = crypto.randomBytes(24).toString('hex')
  const nonce = crypto.randomBytes(24).toString('hex')
  const token = jwt.sign({ state, nonce, scope: 'oidc' }, config.jwtSecret, { expiresIn: '10m' })
  return { state, nonce, token }
}

export function verifyOidcState(token) {
  const payload = jwt.verify(token, config.jwtSecret)
  if (payload.scope !== 'oidc') throw new Error('Invalid OIDC state')
  return payload
}

async function discovery() {
  if (discoveryCache) return discoveryCache
  const url = `${config.oidc.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('OIDC discovery failed')
  discoveryCache = await response.json()
  return discoveryCache
}

export async function getAuthorizationUrl({ state, nonce }) {
  const { authorization_endpoint } = await discovery()
  const params = new URLSearchParams({
    response_type: 'code',
    scope: 'openid email profile',
    client_id: config.oidc.clientId,
    redirect_uri: config.oidc.redirectUri,
    state,
    nonce,
  })
  return `${authorization_endpoint}?${params.toString()}`
}

export async function exchangeCode(code) {
  const { token_endpoint } = await discovery()
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.oidc.redirectUri,
    client_id: config.oidc.clientId,
    client_secret: config.oidc.clientSecret,
  })
  const response = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('OIDC token exchange failed')
  return response.json()
}

async function jwks() {
  if (jwksCache) return jwksCache
  const { jwks_uri } = await discovery()
  const response = await fetch(jwks_uri, { signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('OIDC JWKS fetch failed')
  jwksCache = await response.json()
  return jwksCache
}

export async function verifyIdToken(idToken, expectedNonce) {
  const [headerPart, payloadPart, signaturePart] = String(idToken).split('.')
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('Malformed ID token')
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'))
  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))

  if (claims.iss !== config.oidc.issuer) throw new Error('OIDC issuer mismatch')
  if (claims.aud !== config.oidc.clientId && !claims.aud?.includes?.(config.oidc.clientId)) {
    throw new Error('OIDC audience mismatch')
  }
  if (claims.exp * 1000 < Date.now()) throw new Error('OIDC token expired')
  if (expectedNonce && claims.nonce !== expectedNonce) throw new Error('OIDC nonce mismatch')

  const keys = (await jwks()).keys || []
  const jwk = keys.find((key) => key.kid === header.kid) || keys.find((key) => key.kty === 'RSA')
  if (!jwk) throw new Error('OIDC signing key not found')

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' })
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerPart}.${payloadPart}`),
    publicKey,
    Buffer.from(signaturePart, 'base64url')
  )
  if (!valid) throw new Error('OIDC signature invalid')
  return claims
}
