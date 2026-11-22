// Phase 5 object storage.
//
// Cloudflare R2 is used when the R2_* environment values are configured. The
// S3-compatible SigV4 signing is implemented locally so the platform does not
// need a heavyweight AWS SDK just to mint short-lived PUT/GET URLs. When R2 is
// not configured, objects are encrypted with AES-256-GCM and written beneath
// `storage/objects`, keeping local development and offline demos fully functional.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { encryptBuffer, decryptBuffer, signStorageToken, verifyStorageToken } from './crypto.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')

export const STORAGE_R2 = 'R2'
export const STORAGE_LOCAL = 'LOCAL'

const ALLOWED_KEY = /^[A-Za-z0-9._/-]+$/

export function storageMode() {
  const { r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket } = config.objects
  return r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2Bucket ? STORAGE_R2 : STORAGE_LOCAL
}

export function assertSafeKey(key) {
  if (typeof key !== 'string' || !key || key.length > 500 || !ALLOWED_KEY.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error('Invalid object key')
  }
  return key
}

export function newObjectKey(companyId, fileName, prefix = 'files') {
  const safeCompany = String(companyId).replace(/[^A-Za-z0-9_-]/g, '')
  const ext = path.extname(String(fileName || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10)
  const yyyy = new Date().getUTCFullYear()
  return `${prefix}/${safeCompany}/${yyyy}/${crypto.randomUUID()}${ext}`
}

function localObjectPath(key) {
  const root = path.isAbsolute(config.objects.localDir)
    ? config.objects.localDir
    : path.resolve(repoRoot, config.objects.localDir)
  const file = path.resolve(root, assertSafeKey(key))
  if (!file.startsWith(root + path.sep)) throw new Error('Invalid object path')
  return file
}

// --------------------------------------------------------------- SigV4 (R2)

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value).digest()
}

function sigV4(key, secret, method, expiresSeconds) {
  const host = `${config.objects.r2AccountId}.r2.cloudflarestorage.com`
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateOnly = amzDate.slice(0, 8)
  const scope = `${dateOnly}/auto/s3/aws4_request`
  const canonicalUri = `/${config.objects.r2Bucket}/${key.split('/').map(encodeRfc3986).join('/')}`
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.objects.r2AccessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  }
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${encodeRfc3986(name)}=${encodeRfc3986(query[name])}`)
    .join('&')
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    'host:' + host + '\n',
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
  const dateKey = hmac(`AWS4${secret}`, dateOnly)
  const regionKey = hmac(dateKey, 'auto')
  const serviceKey = hmac(regionKey, 's3')
  const signingKey = hmac(serviceKey, 'aws4_request')
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

export function presignUpload(key, expiresSeconds = config.objects.signedUrlTtlSeconds) {
  assertSafeKey(key)
  if (storageMode() === STORAGE_LOCAL) {
    return {
      provider: STORAGE_LOCAL,
      method: 'POST',
      url: `/api/files/local-upload/${signLocalToken({ purpose: 'upload', key })}`,
      headers: { 'Content-Type': 'application/octet-stream' },
      expiresIn: expiresSeconds,
    }
  }
  return {
    provider: STORAGE_R2,
    method: 'PUT',
    url: sigV4(key, config.objects.r2SecretAccessKey, 'PUT', expiresSeconds),
    headers: { 'Content-Type': 'application/octet-stream' },
    expiresIn: expiresSeconds,
  }
}

export function presignDownload(key, expiresSeconds = config.objects.signedUrlTtlSeconds) {
  assertSafeKey(key)
  if (storageMode() === STORAGE_LOCAL) {
    return {
      provider: STORAGE_LOCAL,
      method: 'GET',
      url: `/api/files/local-download/${signLocalToken({ purpose: 'download', key })}`,
      expiresIn: expiresSeconds,
    }
  }
  return {
    provider: STORAGE_R2,
    method: 'GET',
    url: sigV4(key, config.objects.r2SecretAccessKey, 'GET', expiresSeconds),
    expiresIn: expiresSeconds,
  }
}

function signLocalToken(payload) {
  // Imported lazily to keep the module easy to unit-test without a request.
  return signStorageToken(payload, config.objects.signedUrlTtlSeconds)
}

export function verifyLocalToken(token, purpose) {
  const payload = verifyStorageToken(token)
  if (!payload || payload.purpose !== purpose || !payload.key) return null
  try {
    assertSafeKey(payload.key)
  } catch {
    return null
  }
  return payload
}

// ------------------------------------------------------------ object I/O

export async function putObject(key, buffer, contentType = 'application/octet-stream') {
  assertSafeKey(key)
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (storageMode() === STORAGE_LOCAL) {
    const file = localObjectPath(key)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, encryptBuffer(bytes), { mode: 0o600 })
    return { provider: STORAGE_LOCAL, size: bytes.length }
  }
  const response = await fetch(presignUpload(key).url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: bytes,
  })
  if (!response.ok) throw new Error(`Object storage upload failed (${response.status})`)
  return { provider: STORAGE_R2, size: bytes.length }
}

export async function getObject(key) {
  assertSafeKey(key)
  if (storageMode() === STORAGE_LOCAL) {
    return decryptBuffer(await fs.readFile(localObjectPath(key)))
  }
  const response = await fetch(presignDownload(key).url)
  if (!response.ok) throw new Error(`Object storage download failed (${response.status})`)
  return Buffer.from(await response.arrayBuffer())
}

export async function deleteObject(key) {
  assertSafeKey(key)
  if (storageMode() === STORAGE_LOCAL) {
    await fs.rm(localObjectPath(key), { force: true })
    return
  }
  const response = await fetch(sigV4(key, config.objects.r2SecretAccessKey, 'DELETE', 300), { method: 'DELETE' })
  if (!response.ok && response.status !== 404) throw new Error(`Object storage delete failed (${response.status})`)
}

// ------------------------------------------------------------- MIME policy

const SIGNATURES = [
  { mime: 'application/pdf', bytes: Buffer.from('%PDF-') },
  { mime: 'image/png', bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', bytes: Buffer.from([0xff, 0xd8, 0xff]) },
  { mime: 'image/gif', bytes: Buffer.from('GIF8') },
  { mime: 'application/zip', bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]) },
]

export const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/** Verify the declared MIME type against magic numbers where a signature exists. */
export function verifyMagicNumber(buffer, declaredMime) {
  const detected = SIGNATURES.find((entry) => buffer.subarray(0, entry.bytes.length).equals(entry.bytes))?.mime || null
  const signatureExpected = SIGNATURES.some((entry) => entry.mime === declaredMime)
  if (signatureExpected && detected !== declaredMime) {
    return { ok: false, detected, reason: 'File content does not match its declared type' }
  }
  if (!ALLOWED_UPLOAD_MIME.has(declaredMime)) {
    return { ok: false, detected, reason: 'File type is not allowed' }
  }
  return { ok: true, detected }
}
