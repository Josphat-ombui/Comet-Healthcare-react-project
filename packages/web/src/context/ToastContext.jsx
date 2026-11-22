import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext(null)

let idSeq = 1

function ToastItem({ toast, onDismiss }) {
  const icons = {
    success: <CheckCircle2 size={18} className="text-success shrink-0" aria-hidden="true" />,
    error: <AlertTriangle size={18} className="text-danger shrink-0" aria-hidden="true" />,
    info: <Info size={18} className="text-primary shrink-0" aria-hidden="true" />,
  }
  return (
    <div
      role="status"
      className="animate-toast-in pointer-events-auto flex items-start gap-3 rounded-xl bg-dark text-white px-4 py-3 shadow-pop border border-white/10 w-[min(92vw,22rem)]"
    >
      {icons[toast.type]}
      <p className="text-sm leading-snug flex-1">{toast.message}</p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="text-white/60 hover:text-white transition-colors shrink-0 mt-0.5"
      >
        <X size={16} />
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback(
    (message, type = 'success') => {
      const id = idSeq++
      setToasts((prev) => [...prev.slice(-3), { id, message, type }])
      timers.current[id] = setTimeout(() => dismiss(id), 4500)
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}