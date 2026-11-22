// Server-side DLP policy for internal messages. Pattern definitions live in
// packages/shared/src/dlp.js; this module applies the deployment's mode.

import { config } from './config.js'
import { findingTypes, inspectText, redactText } from '../../shared/src/dlp.js'

export class DlpViolationError extends Error {
  constructor(types) {
    super('Message contains restricted data and was blocked')
    this.name = 'DlpViolationError'
    this.status = 422
    this.types = types
  }
}

/**
 * @param {Record<string, string>} fields text fields to inspect (body, subject)
 * @returns {{ types: string[], count: number, preview: string }}
 */
export function enforceDlp(fields) {
  const findings = Object.values(fields || {}).flatMap((value) => inspectText(value))
  const types = findingTypes(findings)
  const preview = redactText(fields?.body || '').slice(0, 500)

  if (types.length && config.dlp.mode === 'block') {
    throw new DlpViolationError(types)
  }
  return { types, count: findings.length, preview }
}
