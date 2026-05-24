import { useNavigate, useParams, useLocation } from 'react-router-dom'

interface ErrorConfig {
  code: number
  title: string
  description: string
  icon: string
  primaryAction: { label: string; to: string }
  secondaryAction?: { label: string; to?: string; action?: () => void }
}

const ERROR_MAP: Record<number, ErrorConfig> = {
  400: {
    code: 400,
    title: '请求参数错误',
    description: '服务器无法处理当前请求，请检查您的输入参数是否正确，或调整后重试。',
    icon: '⚠️',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回上一页', action: () => window.history.back() }
  },
  401: {
    code: 401,
    title: '未授权访问',
    description: '您需要先进行身份认证才能访问此资源，请登录后重试。',
    icon: '🔒',
    primaryAction: { label: '前往登录', to: '/login' },
    secondaryAction: { label: '返回首页', to: '/' }
  },
  403: {
    code: 403,
    title: '权限不足',
    description: '抱歉，您没有访问此资源的权限。如需帮助请联系管理员开通相应权限。',
    icon: '🚫',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回上一页', action: () => window.history.back() }
  },
  404: {
    code: 404,
    title: '资源未找到',
    description: '您请求的页面或资源不存在，可能已被移除或地址输入有误。',
    icon: '🔍',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回上一页', action: () => window.history.back() }
  },
  409: {
    code: 409,
    title: '资源冲突',
    description: '操作与当前资源状态存在冲突，可能是因为重复提交或数据已存在。',
    icon: '🔀',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回上一页', action: () => window.history.back() }
  },
  423: {
    code: 423,
    title: '资源已锁定',
    description: '由于多次失败尝试，该账户已被临时锁定。请等待锁定时间过后再试。',
    icon: '🔐',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回登录页', to: '/login' }
  },
  429: {
    code: 429,
    title: '请求过于频繁',
    description: '您在短时间内发送了过多请求，请稍后再试。限流机制有助于保障系统稳定运行。',
    icon: '⏳',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回上一页', action: () => window.history.back() }
  },
  500: {
    code: 500,
    title: '服务器内部错误',
    description: '服务器遇到意外错误，无法完成请求。我们的技术团队已收到通知，请稍后重试。',
    icon: '💥',
    primaryAction: { label: '返回首页', to: '/' },
    secondaryAction: { label: '返回上一页', action: () => window.history.back() }
  }
}

const DEFAULT_ERROR: ErrorConfig = {
  code: 0,
  title: '未知错误',
  description: '发生了一个意外错误，请稍后重试。',
  icon: '❓',
  primaryAction: { label: '返回首页', to: '/' },
  secondaryAction: { label: '返回上一页', action: () => window.history.back() }
}

function getErrorCode(pathname: string, paramCode?: string): number {
  if (paramCode) return parseInt(paramCode)
  const match = pathname.match(/^\/(\d{3})$/)
  if (match) return parseInt(match[1])
  return 0
}

export default function ErrorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { code: paramCode } = useParams()
  const statusCode = getErrorCode(location.pathname, paramCode)
  const config = ERROR_MAP[statusCode] || DEFAULT_ERROR

  const handleSecondaryAction = () => {
    if (!config.secondaryAction) return
    if (config.secondaryAction.to) {
      navigate(config.secondaryAction.to)
    } else if (config.secondaryAction.action) {
      config.secondaryAction.action()
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <div className="card" style={{
        maxWidth: 520,
        width: '100%',
        textAlign: 'center',
        padding: '3rem 2.5rem'
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '1rem',
          lineHeight: 1,
          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))'
        }}>
          {config.icon}
        </div>

        <div style={{
          display: 'inline-block',
          padding: '0.25rem 1rem',
          borderRadius: '9999px',
          background: 'rgba(99, 102, 241, 0.15)',
          color: '#a5b4fc',
          fontSize: '0.875rem',
          fontWeight: 600,
          fontFamily: 'monospace',
          marginBottom: '1rem',
          letterSpacing: '0.05em'
        }}>
          {config.code > 0 ? `HTTP ${config.code}` : 'ERROR'}
        </div>

        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          marginBottom: '0.75rem',
          color: 'var(--gray-100)'
        }}>
          {config.title}
        </h1>

        <p style={{
          color: 'var(--gray-400)',
          fontSize: '0.95rem',
          lineHeight: 1.7,
          marginBottom: '2rem'
        }}>
          {config.description}
        </p>

        <div style={{
          display: 'flex',
          gap: '0.75rem',
          justifyContent: 'center',
          flexWrap: 'wrap'
        }}>
          <button
            className="btn btn-primary"
            onClick={() => navigate(config.primaryAction.to)}
          >
            {config.primaryAction.label}
          </button>

          {config.secondaryAction && (
            <button
              className="btn btn-secondary"
              onClick={handleSecondaryAction}
            >
              {config.secondaryAction.label}
            </button>
          )}
        </div>

        <div style={{
          marginTop: '2rem',
          paddingTop: '1.5rem',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontSize: '0.75rem',
          color: 'var(--gray-500)'
        }}>
          DingDang Cloud · <a href="https://github.com/dingdang6283/ai-server" target="_blank" rel="noopener noreferrer"
            style={{ color: 'inherit' }}>github.com/dingdang6283/ai-server</a> · 如问题持续存在，请联系管理员
        </div>
      </div>
    </div>
  )
}