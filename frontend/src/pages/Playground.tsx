import { useState, useRef } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'

declare const __API_HOST__: string
declare const __API_PROTOCOL__: string

const API_HOST = __API_HOST__
const API_PROTOCOL = __API_PROTOCOL__

type Method = 'GET' | 'POST' | 'PUT'

interface Endpoint {
  method: Method
  path: string
  label: string
  requiresAuth: boolean
  adminOnly?: boolean
  defaultBody?: string
}

const ENDPOINTS: Endpoint[] = [
  {
    method: 'POST', path: '/v1/chat/completions',
    label: 'AI聊天 - /v1/chat/completions', requiresAuth: true,
    defaultBody: JSON.stringify({
      messages: [{ role: 'user', content: '你好，请介绍一下你自己' }],
      max_tokens: 500, temperature: 0.7, stream: false
    }, null, 2)
  },
  {
    method: 'POST', path: '/v1/calculate_tokens',
    label: 'Token计算 - /v1/calculate_tokens', requiresAuth: false,
    defaultBody: JSON.stringify({ text: '你好世界 Hello World 123!@#' }, null, 2)
  },
  {
    method: 'GET', path: '/v1/models',
    label: '模型列表 - /v1/models', requiresAuth: false
  },
  {
    method: 'POST', path: '/api/user/dynamic-token',
    label: '获取动态Token - /api/user/dynamic-token', requiresAuth: true,
    defaultBody: '{}'
  },
  {
    method: 'POST', path: '/v1/batch/jobs',
    label: '异步批处理 - /v1/batch/jobs (提交)', requiresAuth: true,
    defaultBody: JSON.stringify({
      messages: [{ role: 'user', content: '批量处理测试' }],
      model: 'qwen', max_tokens: 500, temperature: 0.7
    }, null, 2)
  },
  {
    method: 'GET', path: '/v1/batch/jobs',
    label: '批处理任务列表 - /v1/batch/jobs', requiresAuth: true
  },
  {
    method: 'GET', path: '/v1/batch/jobs/job_xxx',
    label: '任务状态查询 - /v1/batch/jobs/{id}', requiresAuth: true
  },
  {
    method: 'PUT', path: '/api/admin/token-config',
    label: '修改Token配置 - /api/admin/token-config', requiresAuth: true,
    adminOnly: true,
    defaultBody: JSON.stringify({
      chinese_ratio: 2.0, english_ratio: 4.0, other_ratio: 2.0
    }, null, 2)
  },
  {
    method: 'GET', path: '/v1/batch/files',
    label: '[管理] 文件列表 - /v1/batch/files', requiresAuth: true,
    adminOnly: true
  },
  {
    method: 'GET', path: '/v1/batch/batches',
    label: '[管理] 批次列表 - /v1/batch/batches', requiresAuth: true,
    adminOnly: true
  },
  {
    method: 'POST', path: '/v1/batch/upload',
    label: '[管理] 上传批处理 - /v1/batch/upload', requiresAuth: true,
    adminOnly: true,
    defaultBody: JSON.stringify({
      requests: [{
        custom_id: 'req-1', method: 'POST',
        url: '/v1/chat/completions',
        body: {
          model: 'qwen',
          messages: [{ role: 'user', content: '测试请求1' }]
        }
      }]
    }, null, 2)
  }
]

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export default function Playground() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState<'single' | 'multi' | 'stream'>('single')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'user', content: '你好' }
  ])
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>(ENDPOINTS[0])
  const [method, setMethod] = useState<Method>('POST')
  const [path, setPath] = useState(ENDPOINTS[0].path)
  const [requestBody, setRequestBody] = useState(ENDPOINTS[0].defaultBody || '')
  const [customHeaders, setCustomHeaders] = useState('')
  const [roomId, setRoomId] = useState('1')
  const [streamMode, setStreamMode] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [responseHeaders, setResponseHeaders] = useState('')
  const [responseBody, setResponseBody] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [elapsed, setElapsed] = useState(0)
  const responseRef = useRef<HTMLDivElement>(null)
  const streamAbortRef = useRef<AbortController | null>(null)

  const handleEndpointChange = (endpoint: Endpoint) => {
    setSelectedEndpoint(endpoint)
    setMethod(endpoint.method)
    setPath(endpoint.path)
    setRequestBody(endpoint.defaultBody || '')
    setResponseStatus(null)
    setResponseBody('')
    setResponseHeaders('')
    setError('')
  }

  const handleMethodChange = (m: Method) => {
    setMethod(m)
    setSelectedEndpoint(ENDPOINTS[0])
    setResponseStatus(null)
    setResponseBody('')
    setResponseHeaders('')
    setError('')
  }

  const handleSend = async () => {
    setIsLoading(true)
    setError('')
    setResponseStatus(null)
    setResponseBody('')
    setResponseHeaders('')
    setStreamingContent('')
    setElapsed(0)

    // Check if this is a streaming request
    let useStream = streamMode
    if (!useStream && requestBody.trim()) {
      try {
        const parsed = JSON.parse(requestBody)
        if (parsed.stream === true) useStream = true
      } catch {}
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    const apiKey = localStorage.getItem('api_key')
    if (apiKey && (selectedEndpoint.requiresAuth || customHeaders.includes('Bearer'))) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }

    if (customHeaders.trim()) {
      customHeaders.split('\n').forEach(line => {
        const idx = line.indexOf(':')
        if (idx > 0) {
          const k = line.slice(0, idx).trim()
          const v = line.slice(idx + 1).trim()
          if (k && v) headers[k] = v
        }
      })
    }

    const startTime = performance.now()

    if (useStream && path === '/v1/chat/completions') {
      const controller = new AbortController()
      streamAbortRef.current = controller
      try {
        const fetchOptions: RequestInit = {
          method, headers, signal: controller.signal
        }
        let body = requestBody
        try {
          const parsed = JSON.parse(body)
          parsed.room_id = roomId
          parsed.stream = true
          body = JSON.stringify(parsed)
        } catch {}

        if (method !== 'GET') fetchOptions.body = body

        const url = path.startsWith('http')
          ? path
          : API_PROTOCOL + '://' + API_HOST + '/' + path.replace(/^\//, '')

        const res = await fetch(url, fetchOptions)
        const endTime = performance.now()
        setElapsed(Math.round(endTime - startTime))
        setResponseStatus(res.status)

        const resHeaders: Record<string, string> = {}
        res.headers.forEach((v, k) => { resHeaders[k] = v })
        setResponseHeaders(JSON.stringify(resHeaders, null, 2))

        if (!res.ok) {
          const text = await res.text()
          setResponseBody(text)
          return
        }

        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let fullContent = ''
        setResponseBody('[流式响应进行中...]\n')

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value, { stream: true })
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (!line || line === '\r') continue
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                const delta = parsed?.choices?.[0]?.delta?.content
                if (delta) {
                  fullContent += delta
                  setStreamingContent(fullContent)
                  setResponseBody(fullContent)
                }
              } catch {}
            }
          }
        }

        streamAbortRef.current = null
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setError(err.message || '流式请求失败')
        }
      } finally {
        setIsLoading(false)
        if (responseRef.current) {
          responseRef.current.scrollIntoView({ behavior: 'smooth' })
        }
      }
      return
    }

    try {
      const fetchOptions: RequestInit = { method, headers }

      if (method !== 'GET' && requestBody.trim()) {
        if (path === '/v1/chat/completions') {
          try {
            const parsed = JSON.parse(requestBody)
            parsed.room_id = roomId
            fetchOptions.body = JSON.stringify(parsed)
          } catch {
            fetchOptions.body = requestBody
          }
        } else {
          fetchOptions.body = requestBody
        }
      }

      const url = path.startsWith('http')
        ? path
        : API_PROTOCOL + '://' + API_HOST + '/' + path.replace(/^\//, '')

      const res = await fetch(url, fetchOptions)

      const endTime = performance.now()
      setElapsed(Math.round(endTime - startTime))
      setResponseStatus(res.status)

      const resHeaders: Record<string, string> = {}
      res.headers.forEach((v, k) => { resHeaders[k] = v })
      setResponseHeaders(JSON.stringify(resHeaders, null, 2))

      const text = await res.text()
      try {
        const parsed = JSON.parse(text)
        setResponseBody(JSON.stringify(parsed, null, 2))
      } catch {
        setResponseBody(text)
      }

      if (responseRef.current) {
        responseRef.current.scrollIntoView({ behavior: 'smooth' })
      }
    } catch (err: any) {
      setError(err.message || '请求失败')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>API 调试器</h1>
          <p style={{ color: 'var(--gray-400)' }}>
            在线调试DingDang Cloud API接口 — 服务地址：
            <code style={{ marginLeft: '0.375rem',
              color: 'var(--primary-500)' }}>
              {API_PROTOCOL}://{API_HOST}
            </code>
          </p>
        </div>
      </div>

      <div className="grid-2 stagger-group">
        <div>
          <div className="card stagger-item" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>选择端点</h3>
            <div style={{ display: 'grid', gap: '0.375rem' }}>
              {ENDPOINTS.filter(ep => !ep.adminOnly || user?.role === 'admin').map((ep, i) => (
                <button key={i} onClick={() => handleEndpointChange(ep)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.625rem 0.75rem',
                    background: selectedEndpoint.path === ep.path
                      ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.04)',
                    border: selectedEndpoint.path === ep.path
                      ? '1px solid rgba(99, 102, 241, 0.4)'
                      : '1px solid transparent',
                    borderRadius: '0.5rem', cursor: 'pointer',
                    color: selectedEndpoint.path === ep.path
                      ? 'white' : 'var(--gray-300)',
                    fontSize: '0.8rem', textAlign: 'left', width: '100%'
                  }}>
                  <span className={`tag ${
                    ep.method === 'GET' ? 'tag-active'
                    : ep.method === 'POST' ? 'tag-admin'
                    : 'tag-unverified'}`}
                    style={{ fontSize: '0.6rem', minWidth: 36, textAlign: 'center' }}>
                    {ep.method}
                  </span>
                  <span style={{ flex: 1 }}>{ep.label}</span>
                  {ep.requiresAuth && (
                    <span style={{ fontSize: '0.65rem',
                      color: 'var(--gray-500)' }}>🔑</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="card stagger-item">
            <h3 style={{ marginBottom: '1rem' }}>请求配置</h3>

            <div className="form-group">
              <label className="label">请求方法</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {(['GET', 'POST', 'PUT'] as Method[]).map(m => (
                  <button key={m} onClick={() => handleMethodChange(m)}
                    style={{
                      flex: 1, padding: '0.5rem',
                      background: method === m
                        ? (m === 'GET' ? 'rgba(16, 185, 129, 0.3)'
                          : m === 'POST' ? 'rgba(99, 102, 241, 0.3)'
                          : 'rgba(245, 158, 11, 0.3)')
                        : 'rgba(255,255,255,0.06)',
                      border: method === m
                        ? `1px solid ${
                          m === 'GET' ? 'var(--success)'
                          : m === 'POST' ? 'var(--primary-500)'
                          : 'var(--warning)'}`
                        : '1px solid transparent',
                      borderRadius: '0.375rem', cursor: 'pointer',
                      color: method === m ? 'white' : 'var(--gray-400)',
                      fontWeight: method === m ? 600 : 400,
                      fontSize: '0.8rem'
                    }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="label">请求路径</label>
              <input className="input" type="text"
                placeholder="/v1/chat/completions"
                value={path}
                onChange={e => setPath(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.8rem' }} />
            </div>

            <div className="form-group">
              <label className="label">
                自定义请求头
                <span style={{ color: 'var(--gray-500)',
                  fontSize: '0.7rem', marginLeft: '0.5rem' }}>
                  (可选，每行一个)
                </span>
              </label>
              <textarea className="input" rows={3}
                placeholder="X-Dynamic-Token: your-token"
                value={customHeaders}
                onChange={e => setCustomHeaders(e.target.value)}
                style={{ fontFamily: 'monospace', fontSize: '0.75rem',
                  resize: 'vertical' }} />
            </div>

            {method !== 'GET' && (
              <div className="form-group">
                <label className="label">请求体 (JSON)</label>
                <textarea className="input" rows={10}
                  value={requestBody}
                  onChange={e => setRequestBody(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: '0.75rem',
                    resize: 'vertical', lineHeight: 1.5 }} />
                {/* Room ID for chat sessions: used to isolate context, defaults to "1" */}
                {path === '/v1/chat/completions' && (
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignItems: 'center' }}>
                    <input className="input" type="text" placeholder="room_id 用于隔离上下文，支持 UTF-8"
                      value={roomId} onChange={e => setRoomId(e.target.value)}
                      style={{ flex: 1, fontFamily: 'monospace' }} />
                    <button type="button" className="btn btn-sm btn-secondary"
                      onClick={() => setRoomId(Math.random().toString(36).slice(2, 10))}>生成</button>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={streamMode}
                    onChange={e => {
                      setStreamMode(e.target.checked)
                      if (e.target.checked && path === '/v1/chat/completions') {
                        try {
                          const parsed = JSON.parse(requestBody)
                          parsed.stream = true
                          setRequestBody(JSON.stringify(parsed, null, 2))
                        } catch {}
                      }
                    }}
                    style={{ accentColor: 'var(--primary-500)' }} />
                  <span>流式响应 (SSE)</span>
                </label>
                {isLoading && streamAbortRef.current && (
                  <button type="button" className="btn btn-danger btn-sm"
                    onClick={() => {
                      streamAbortRef.current?.abort()
                      streamAbortRef.current = null
                      setIsLoading(false)
                    }}>
                    停止
                  </button>
                )}
              </div>
            </div>

            <div className="form-group">
              <label className="label" style={{ display: 'flex',
                alignItems: 'center', gap: '0.5rem' }}>
                <span>认证方式</span>
                {user ? (
                  <span className="tag tag-active"
                    style={{ fontSize: '0.65rem' }}>
                    已登录 (自动添加Bearer)
                  </span>
                ) : (
                  <span className="tag tag-disabled"
                    style={{ fontSize: '0.65rem' }}>
                    未登录
                  </span>
                )}
              </label>
            </div>

            <button className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleSend} disabled={isLoading}>
              {isLoading
                ? <><span className="spinner" /> 发送中...</>
                : `发送 ${method} 请求`}
            </button>
          </div>
        </div>

        <div ref={responseRef}>
          <div className="card stagger-item">
            <div style={{ display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3>响应结果</h3>
              {responseStatus && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                    {elapsed}ms
                  </span>
                  <span className={`tag ${
                    responseStatus < 300 ? 'tag-active'
                    : responseStatus < 400 ? 'tag-unverified'
                    : 'tag-disabled'}`}
                    style={{ fontSize: '0.7rem' }}>
                    {responseStatus}
                  </span>
                </div>
              )}
            </div>

            {isLoading && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '3rem', color: 'var(--gray-400)'
              }}>
                <span className="spinner" />
                <span style={{ marginLeft: '0.75rem' }}>正在发送请求...</span>
              </div>
            )}

            {error && (
              <div className="alert alert-error">{error}</div>
            )}

            {!isLoading && !responseStatus && !error && (
              <div className="empty-state" style={{ padding: '3rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚡</div>
                <div>选择端点并点击"发送"按钮</div>
                <div style={{ color: 'var(--gray-500)', fontSize: '0.8rem',
                  marginTop: '0.5rem' }}>
                  API响应将在这里显示
                </div>
              </div>
            )}

            {responseStatus && (
              <>
                <div className="form-group">
                  <label className="label">响应头</label>
                  <div className="code-block" style={{ fontSize: '0.7rem',
                    maxHeight: 200, overflow: 'auto' }}>
                    {responseHeaders}
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">响应体</label>
                  <div className="code-block" style={{
                    fontSize: '0.75rem', maxHeight: 500, overflow: 'auto',
                    position: 'relative'
                  }}>
                    {responseBody}
                    <button className="copy-btn"
                      style={{ position: 'absolute', top: '0.5rem',
                        right: '0.5rem' }}
                      onClick={() => {
                        try {
                          if (navigator.clipboard && navigator.clipboard.writeText) {
                            navigator.clipboard.writeText(responseBody)
                          } else {
                            const ta = document.createElement('textarea')
                            ta.value = responseBody
                            ta.style.position = 'fixed'
                            ta.style.opacity = '0'
                            document.body.appendChild(ta)
                            ta.select()
                            document.execCommand('copy')
                            document.body.removeChild(ta)
                          }
                          showToast('响应内容已复制', 'success')
                        } catch {
                          showToast('复制失败', 'error')
                        }
                      }}>
                      复制
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}