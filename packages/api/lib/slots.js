// Availability engine — pure, unit-testable functions that convert a provider's
// weekly schedule + existing appointments into bookable time slots.
//
// Design notes:
//  * Everything is computed in LOCAL dates ("2026-09-14") and 24h "HH:MM" times.
//    Appointments are stored the same way, so the engine never depends on the
//    server's physical timezone being the behaviour one.
//  * Only SCHEDULED/CONFIRMED appointments block a slot. COMPLETED/CANCELLED
//    releases the time.
//  * A slot that is currently in progress (started before `now`) is not offered.

export const MIN_PER_DAY = 24 * 60
export const BLOCKING_STATUSES = ['SCHEDULED', 'CONFIRMED']

/** "09:05" -> 545 */
export function timeToMinutes(time) {
  const [h, m] = String(time).split(':').map((n) => Number.parseInt(n, 10))
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/** 545 -> "09:05" */
export function minutesToTime(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Local availability window for today, e.g. "2026-09-14" (based on the passed date). */
export function localIsoDay(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Add `n` calendar days to an ISO date string ("2026-09-14" + 3 = "2026-09-17"). */
export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return localIsoDay(date)
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function isValidIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

export function isValidIsoTime(value) {
  return ISO_TIME_RE.test(value)
}

export function isToday(isoDate, now = new Date()) {
  return isoDate === localIsoDay(now)
}

export function isPastDate(isoDate, now = new Date()) {
  return isoDate < localIsoDay(now)
}

/**
 * True when [startM, endM) overlaps an opaque list of busy windows
 * [{ start, end }] measured in minutes-of-day.
 */
export function hasConflict(busyWindows, startM, endM) {
  return busyWindows.some((b) => b.start < endM && b.end > startM)
}

/**
 * Build one day of slots for a provider schedule.
 *
 * @param {object} schedule { startTime, endTime, slotMinutes }
 * @param {string} date      local "yyyy-mm-dd"
 * @param {Array}  existing  appointments with { startTime, endTime, status }
 * @param {Date}   now       reference "now" for past-slot filtering (defaults to real now)
 * @returns {Array<{start: string, end: string, available: boolean}>}
 */
export function generateSlots({ schedule, date, existing = [], now = new Date() }) {
  const startM = timeToMinutes(schedule.startTime)
  const endM = timeToMinutes(schedule.endTime)
  const slotLen = schedule.slotMinutes || 30
  if (startM === null || endM === null || endM <= startM || slotLen <= 0) return []

  const busy = existing
    .filter((a) => BLOCKING_STATUSES.includes(a.status))
    .map((a) => ({ start: timeToMinutes(a.startTime), end: timeToMinutes(a.endTime) }))
    .filter((b) => b.start !== null && b.end !== null)

  const slots = []
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  for (let s = startM; s + slotLen <= endM; s += slotLen) {
    const available = !hasConflict(busy, s, s + slotLen)
    // Never offer slots that are already in progress today.
    const notStarted = !isToday(date, now) || s > nowMinutes
    slots.push({
      start: minutesToTime(s),
      end: minutesToTime(s + slotLen),
      available: available && notStarted,
    })
  }
  return slots
}