// Shared site-wide defaults. The server CMS seeds these values into the
// `global` branch of site_content, and the UI uses the same object as its
// offline fallback so contacts stay consistent when the API is unavailable.

export const DEFAULT_GLOBAL = {
  brand: 'Comet Healthcare',
  tagline: "Kenya's Premier Pharmaceutical Manufacturer",
  email: 'info@comethealthcares.com',
  phone: '+254 725 519 844',
  address: 'Mua-Kitanga Road, off Mombasa Road, Machakos, Kenya',
  poBox: 'P.O. BOX 6293, Nairobi, Kenya 00300',
  hours: 'Mon–Fri 8:00am–5:00pm EAT · Sat 8:30am–3:00pm',
}

/** Build a tel:/mailto: href from an admin-editable contact string. */
export function contactHref(value, kind = 'tel') {
  const raw = String(value || '').trim()
  if (kind === 'mailto') return `mailto:${raw}`
  return `tel:${raw.replace(/[^\d+]/g, '')}`
}
