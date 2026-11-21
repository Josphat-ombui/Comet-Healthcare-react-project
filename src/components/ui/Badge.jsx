// Small pill + status badges with accessible color pairs.

const TONES = {
  neutral: 'bg-cream text-slate border border-mist',
  primary: 'bg-primary-50 text-primary border border-primary-100',
  success: 'bg-success-light text-success border border-success/20',
  warning: 'bg-warning-light text-warning border border-warning/20',
  danger: 'bg-danger-light text-danger border border-danger/20',
  gold: 'bg-secondary/15 text-secondary-dark border border-secondary/30',
}

// Appointment status → tone
export const APPOINTMENT_TONE = {
  SCHEDULED: 'primary',
  CONFIRMED: 'success',
  COMPLETED: 'gold',
  CANCELLED: 'danger',
}

// Inquiry status → tone
export const INQUIRY_TONE = {
  NEW: 'primary',
  REVIEWED: 'gold',
  ARCHIVED: 'neutral',
}

// Role (client  = PATIENT in DB)
export const ROLE_TONE = {
  ADMIN: 'danger',
  PROVIDER: 'gold',
  PATIENT: 'primary',
}

export default function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`chip ${TONES[tone] || TONES.neutral} ${className}`}>{children}</span>
  )
}