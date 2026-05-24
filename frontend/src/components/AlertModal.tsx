import { useEffect, type ReactNode } from 'react'

type AlertType = 'success' | 'error' | 'info' | 'warning'

interface AlertModalProps {
  type: AlertType
  message: string
  onClose: () => void
  duration?: number
  icon?: ReactNode
}

const typeConfig: Record<AlertType, { icon: string; color: string }> = {
  success: { icon: '✓', color: 'var(--success)' },
  error: { icon: '✕', color: 'var(--error)' },
  info: { icon: 'ℹ', color: 'var(--info)' },
  warning: { icon: '⚠', color: 'var(--warning)' },
}

export default function AlertModal({ type, message, onClose, duration = 2500, icon }: AlertModalProps) {
  useEffect(() => {
    if (duration > 0 && type !== 'warning') {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [type, duration, onClose])

  const cfg = typeConfig[type]

  return (
    <div className="alert-modal-overlay" onClick={onClose}>
      <div className="alert-modal" onClick={e => e.stopPropagation()}>
        <div className="alert-modal-icon" style={{ color: cfg.color }}>
          {icon || cfg.icon}
        </div>
        <div className="alert-modal-message">{message}</div>
        <button className="btn btn-secondary btn-sm" onClick={onClose}
          style={{ marginTop: '1rem', minWidth: '80px' }}>
          确定
        </button>
      </div>
    </div>
  )
}