// Client-side date helpers (mirrors server/lib/slots.js logic for local dates).

export function localIsoDay(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number)
  const date = new Date(y, m - 1, d + n)
  return localIsoDay(date)
}

export function prettyDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}