// Data-loss prevention patterns shared by the API and future workers.
//
// These are detection patterns, not statutory calculations. No statutory rate
// tables or tax logic belong here. Findings deliberately carry only a type and
// position so callers never accidentally log a restricted value.

export const DLP_TYPES = Object.freeze({
  CARD_NUMBER: 'CARD_NUMBER',
  KENYAN_NATIONAL_ID: 'KENYAN_NATIONAL_ID',
  KRA_PIN: 'KRA_PIN',
  SECRET: 'SECRET',
})

function luhnValid(digits) {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i])
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

const CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g

function cardFindings(text) {
  const findings = []
  for (const match of text.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/\D/g, '')
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      findings.push({ type: DLP_TYPES.CARD_NUMBER, start: match.index, end: match.index + match[0].length })
    }
  }
  return findings
}

const PATTERN_FINDERS = [
  cardFindings,
  (text) => findingsFrom(text, /\b\d{8}\b/g, DLP_TYPES.KENYAN_NATIONAL_ID),
  (text) => findingsFrom(text, /\b[A-Z]\d{9}[A-Z]\b/gi, DLP_TYPES.KRA_PIN),
  (text) => findingsFrom(text, /\b(?:sk_live_|sk_test_|rk_live_|AKIA|ASIA|ghp_|gho_|xox[baprs]-)[A-Za-z0-9_-]{12,}\b/g, DLP_TYPES.SECRET),
  (text) => findingsFrom(text, /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g, DLP_TYPES.SECRET),
  (text) => findingsFrom(text, /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, DLP_TYPES.SECRET),
]

function findingsFrom(text, regex, type) {
  const findings = []
  for (const match of text.matchAll(regex)) {
    findings.push({ type, start: match.index, end: match.index + match[0].length })
  }
  return findings
}

/** Return non-overlapping findings. Values are never returned. */
export function inspectText(text) {
  if (typeof text !== 'string' || !text) return []
  const all = PATTERN_FINDERS.flatMap((find) => find(text))
    .sort((a, b) => a.start - b.start || b.end - a.end)

  const kept = []
  let cursor = -1
  for (const finding of all) {
    if (finding.start >= cursor) {
      kept.push(finding)
      cursor = finding.end
    }
  }
  return kept
}

/** Mask findings for logs/UI. Never emits the matched value in full. */
export function redactText(text) {
  if (typeof text !== 'string' || !text) return ''
  const findings = inspectText(text)
  let out = ''
  let cursor = 0
  for (const finding of findings) {
    out += text.slice(cursor, finding.start)
    out += `[REDACTED:${finding.type}]`
    cursor = finding.end
  }
  return out + text.slice(cursor)
}

/** Distinct finding types, safe to place in audit metadata or an error body. */
export function findingTypes(findings) {
  return [...new Set(findings.map((finding) => finding.type))].sort()
}
