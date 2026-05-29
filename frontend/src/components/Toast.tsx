import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import AlertModal from './AlertModal'

type ToastType = 'success' | 'error' | 'info' | 'warning' | 'confirm' | 'loading'

interface ToastMessage {
  id: number
  type: ToastType
  message: string
  onConfirm?: () => void
  onCancel?: () => void
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
  const [currentToast, setCurrentToast] = useState<ToastMessage | null>(null)

  const closeToast = useCallback((id: number) => {
    setCurrentToast(prev => prev && prev.id === id ? null : prev)
  }, [])

  const showToast = useCallback((message: string, type: ToastType = 'info', duration?: number) => {
    if (type === 'loading' || type === 'confirm') {
      const id = Date.now()
      setCurrentToast({ id, type, message, duration })
      return id
    }
    const id = Date.now()
    setCurrentToast({ id, type, message, duration })
  }, [])

  const showConfirm = useCallback((message: string, onConfirm: () => void) => {
    const id = Date.now()
    setCurrentToast({ id, type: 'confirm', message, onConfirm })
  }, [])

  const showLoading = useCallback((message: string) => {
    const id = Date.now()
    setCurrentToast({ id, type: 'loading', message })
    return id
  }, [])

  const updateLoading = useCallback((id: number, message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setCurrentToast(prev => prev && prev.id === id ? { ...prev, message, type } : prev)
    setTimeout(() => {
      closeToast(id)
    }, 2000)
  }, [closeToast])

  const closeAlert = useCallback(() => {
    setCurrentToast(null)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, showConfirm, showLoading, updateLoading, closeToast }}>
      {children}
      {currentToast && (
        <AlertModal
          type={currentToast.type}
          message={currentToast.message}
          duration={currentToast.duration}
          onClose={() => closeToast(currentToast.id)}
          onConfirm={currentToast.onConfirm}
          onCancel={currentToast.onCancel}
        />
      )}
    </ToastContext.Provider>
  )
}
