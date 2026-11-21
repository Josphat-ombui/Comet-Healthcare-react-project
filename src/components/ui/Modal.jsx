import { useEffect } from 'react'
import { X } from 'lucide-react'

// Accessible modal: focus trap + Escape to close + scroll lock.
export default function Modal({ open, onClose, title, children, footer, labelledBy }) {
  useEffect(() => {
    if (!open) return undefined
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    // Move focus into the dialog for keyboard users.
    const el = document.getElementById('comet-modal-panel')
    el?.focus({ preventScroll: true })
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-primary-deeper/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        id="comet-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || undefined}
        tabIndex={-1}
        className="relative w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-pop animate-fade-in-up max-h-[88vh] flex flex-col outline-none"
      >
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-mist">
          <h3 id={labelledBy} className="font-heading text-xl font-semibold text-ink">
            {title}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate hover:text-ink hover:bg-cream transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-6 pb-5 pt-1 flex justify-end gap-3 border-t border-mist mt-2 pt-4">{footer}</div>}
      </div>
    </div>
  )
}