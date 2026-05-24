import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import AlertModal from './AlertModal'

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'confirm' | 'loading'

interface ToastMessage {
  id: number
  type: ToastType
  message: string
  onConfirm?: () => void
  onCancel?: () => void
  exiting?: boolean
  duration?: number
}

interface AlertState {
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  duration?: number
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void
  showConfirm: (message: string, onConfirm: () => void) => void
  showLoading: (message: string) => number
  updateLoading: (id: number, message: string, type?: 'success' | 'error' | 'info') => void
  closeToast: (id: number) => void
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
  showConfirm: () => {},
  showLoading: () => 0,
  updateLoading: () => {},
  closeToast: () => {},
})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [alertState, setAlertState] = useState<AlertState | null>(null)

  const closeToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 300)
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    if (type === 'loading' || type === 'confirm') {
      const id = Date.now()
      setToasts(prev => [...prev, { id, type, message, duration }])
      return id
    }
    setAlertState({ type, message, duration })
  }, [])

  const showConfirm = useCallback((message: string, onConfirm: () => void) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type: 'confirm', message, onConfirm }])
  }, [])

  const showLoading = useCallback((message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type: 'loading', message }])
    return id
  }, [])

  const updateLoading = useCallback((id: number, message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, message, type } : t))
    setTimeout(() => {
      closeToast(id)
    }, 2000)
  }, [closeToast])

  const closeAlert = useCallback(() => {
    setAlertState(null)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, showConfirm, showLoading, updateLoading, closeToast }}>
      {children}
      {alertState && (
        <AlertModal
          type={alertState.type}
          message={alertState.message}
          duration={alertState.duration}
          onClose={closeAlert}
        />
      )}
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
                {toast.type === 'loading' && '◐'}
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
              ) : toast.type !== 'loading' && (
                <button className="toast-close" onClick={() => closeToast(toast.id)}>✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}