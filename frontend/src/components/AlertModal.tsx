import { useEffect, type ReactNode } from 'react'

type AlertType = 'success' | 'error' | 'info' | 'warning' | 'confirm' | 'loading'

interface AlertModalProps {
  type: AlertType
  message: string
  onClose: () => void
  duration?: number
  icon?: ReactNode
  onConfirm?: () => void
  onCancel?: () => void
}

const typeConfig: Record<AlertType, { icon: string; color: string }> = {
  success: { icon: '✓', color: 'var(--success)' },
  error: { icon: '✕', color: 'var(--error)' },
  info: { icon: 'ℹ', color: 'var(--info)' },
  warning: { icon: '⚠', color: 'var(--warning)' },
  confirm: { icon: '?', color: 'var(--info)' },
  loading: { icon: '◐', color: 'var(--primary-500)' },
}

export default function AlertModal({ 
  type, 
  message, 
  onClose, 
  duration = 2500, 
  icon,
  onConfirm,
  onCancel
}: AlertModalProps) {
  useEffect(() => {
    if (duration > 0 && type !== 'warning' && type !== 'confirm' && type !== 'loading') {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [type, duration, onClose])

  const cfg = typeConfig[type]

  return (
    <div className="alert-modal-overlay" onClick={type === 'loading' ? undefined : onClose}>
      <div className="alert-modal" onClick={e => e.stopPropagation()}>
        <div className="alert-modal-icon" style={{ color: cfg.color }}>
          {icon || cfg.icon}
        </div>
        <div className="alert-modal-message">{message}</div>
        {type === 'confirm' ? (
          <div className="alert-modal-actions" style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => {
                onConfirm?.()
                onClose()
              }}
              style={{ minWidth: '80px' }}
            >
              确定
            </button>
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => {
                onCancel?.()
                onClose()
              }}
              style={{ minWidth: '80px' }}
            >
              取消
            </button>
          </div>
        ) : type !== 'loading' && (
          <button 
            className="btn btn-secondary btn-sm" 
            onClick={onClose}
            style={{ marginTop: '1.5rem', minWidth: '80px' }}
          >
            确定
          </button>
        )}
      </div>
    </div>
  )
}
