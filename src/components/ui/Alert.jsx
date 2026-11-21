import { CheckCircle2, Info, XCircle, AlertTriangle, Loader2 } from 'lucide-react'

const MAPS = {
  success: { icon: CheckCircle2, cls: 'text-success bg-success-light', label: 'Success' },
  info: { icon: Info, cls: 'text-primary bg-primary-50', label: 'Information' },
  warning: { icon: AlertTriangle, cls: 'text-warning bg-warning-light', label: 'Warning' },
  error: { icon: XCircle, cls: 'text-danger bg-danger-light', label: 'Error' },
}

export default function Alert({ type = 'info', title, children, className = '' }) {
  const { icon: Icon, cls, label } = MAPS[type] || MAPS.info
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-label={label}
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${cls} border-current/20 ${className}`}
    >
      <Icon size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold mb-0.5">{title}</p>}
        {children && <div className={title ? 'opacity-90' : undefined}>{children}</div>}
      </div>
    </div>
  )
}

export function Spinner({ label = 'Loading…', className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm text-slate ${className}`} role="status">
      <Loader2 size={18} className="animate-spin text-primary" aria-hidden="true" />
      {label}
    </span>
  )
}