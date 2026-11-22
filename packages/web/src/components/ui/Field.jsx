import { AlertCircle } from 'lucide-react'

export function Field({ label, htmlFor, hint, error, required, children, className = '' }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="label">
          {label}
          {required && (
            <span className="text-danger" aria-hidden="true">
              {' '}
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="field-error" role="alert">
          <AlertCircle size={13} aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && <p className="field-hint">{hint}</p>
      )}
    </div>
  )
}

export function Input({ invalid = false, className = '', ...rest }) {
  return <input className={`input ${invalid ? 'input-invalid' : ''} ${className}`} {...rest} />
}

export function Select({ invalid = false, className = '', children, ...rest }) {
  return (
    <select className={`select ${invalid ? 'select-invalid' : ''} ${className}`} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ invalid = false, className = '', ...rest }) {
  return <textarea className={`textarea ${invalid ? 'textarea-invalid' : ''} ${className}`} {...rest} />
}