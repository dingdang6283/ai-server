import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'confirm'

interface ToastMessage {
  id: number
  type: ToastType
  message: string
  onConfirm?: () => void
  onCancel?: () => void
  exiting?: boolean
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
  showConfirm: (message: string, onConfirm: () => void) => void
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showConfirm: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const closeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      closeToast(id)
    }, 3000)
  }, [closeToast])

  const showConfirm = useCallback((message: string, onConfirm: () => void) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type: 'confirm', message, onConfirm }])
  }, [])



  return (
    <ToastContext.Provider value={{ showToast, showConfirm }}>
      {children}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map(toast => (
            <div key={toast.id} className={`toast toast-${toast.type}${toast.exiting ? ' toast-exit' : ''}`}>
              <div className="toast-icon">
                {toast.type === 'success' && '✓'}
                {toast.type === 'error' && '✕'}
                {toast.type === 'info' && 'ℹ'}
                {toast.type === 'warning' && '⚠'}
                {toast.type === 'confirm' && '?'}
              </div>
              <div className="toast-message">{toast.message}</div>
              {toast.type === 'confirm' ? (
                <div className="toast-actions">
                  <button className="btn btn-primary btn-sm"
                    onClick={() => {
                      toast.onConfirm?.()
                      closeToast(toast.id)
                    }}>
                    确定
                  </button>
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => {
                      toast.onCancel?.()
                      closeToast(toast.id)
                    }}>
                    取消
                  </button>
                </div>
              ) : (
                <button className="toast-close" onClick={() => closeToast(toast.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}