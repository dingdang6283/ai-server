import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { aiApi, userApi, authApi, spaceApi, notificationApi } from '../services/api'
import { useToast } from '../components/Toast'
import type { CalculateTokenResult, DailyUsage, Space, ContextMessage, Notification } from '../types/api'

type TabType = 'curl' | 'python'

declare const __API_HOST__: string
declare const __API_PROTOCOL__: string

const API_HOST = (typeof window !== 'undefined' && (window as any).__APP_CONFIG__?.api_host) || __API_HOST__
const API_PROTOCOL = (typeof window !== 'undefined' && (window as any).__APP_CONFIG__?.api_protocol) || __API_PROTOCOL__

function docUrl(path: string) {
  return API_PROTOCOL + '://' + API_HOST + path
}

function buildCurl(apiKey: string) {
  const key = apiKey || 'your-api-key'
  return [
    'curl -X POST `' + docUrl('/v1/chat/completions') + '`  \\',
    '   -H "Content-Type: application/json" \\',
    '   -H "Authorization: Bearer ' + key + '" \\',
    "   -d '{\"messages\": [{\"role\": \"user\", \"content\": \"你好\"}], \"max_tokens\": 500, \"temperature\": 0.7}' \\",
    '   -k',
  ].join('\n')
}

function buildPython(apiKey: string) {
  return [
    'import requests',
    '',
    'url = "' + docUrl('/v1/chat/completions') + '"',
    'headers = {',
    '    "Authorization": "Bearer ' + (apiKey || 'your-api-key') + '"',
    '}',
    'data = {',
    '    "messages": [',
    '        {',
    '            "role": "user",',
    '            "content": "你好"',
    '        }',
    '    ],',
    '    "max_tokens": 500,',
    '    "temperature": 0.7',
    '}',
    '',
    'response = requests.post(url, headers=headers, json=data)',
    '',
    'if response.ok:',
    "    result = response.json()",
    "    answer = result['choices'][0]['message']['content']",
    "    usage = result['usage']",
    "    print('AI回答:', answer)",
    "    print('使用Token:', usage.get('use-token', 'N/A'))",
    "    print('剩余Token:', usage.get('token', 'N/A'))",
    "    if 'warning' in result:",
    "        print('⚠️ 警告:', result['warning'])",
    'else:',
    "    err = response.json()",
    "    print('错误:', err.get('error', '未知错误'))",
    "    if 'warning' in err:",
    "        print('⚠️ 警告:', err['warning'])",
  ].join('\n')
}

function BarChart({ data, maxValue }: { data: DailyUsage[]; maxValue: number }) {
  if (!data || data.length === 0) {
    return <div className="empty-state" style={{ padding: '2rem' }}>暂无使用数据</div>
  }
  return (
    <div className="bar-chart">
      {data.map((d) => {
        const height = maxValue > 0 ? (d.total_tokens / maxValue) * 100 : 0
        const dayLabel = d.day.slice(5)
        const total = d.total_tokens || 1
        const promptPct = (d.prompt_tokens / total) * 100
        const completionPct = (d.completion_tokens / total) * 100
        return (
          <div key={d.day} className="bar-chart-item">
            <div className="bar-chart-bar-wrap">
              <div className="bar-chart-bar" style={{ height: height + '%' }}>
                <div className="bar-chart-bar-fill completion-bar" style={{ height: completionPct + '%', bottom: promptPct + '%' }} />
                <div className="bar-chart-bar-fill prompt-bar" style={{ height: promptPct + '%', bottom: 0 }} />
              </div>
            </div>
            <div className="bar-chart-label">{dayLabel}</div>
            <div className="bar-chart-value">{d.total_tokens}</div>
          </div>
        )
      })}
    </div>
  )
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth()
  const { showToast, showConfirm } = useToast()
  const [text, setText] = useState('')
  const [result, setResult] = useState<CalculateTokenResult | null>(null)
  const [calcLoading, setCalcLoading] = useState(false)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)
  const [dynamicTokenCopied, setDynamicTokenCopied] = useState(false)
  const [codeCopied, setCodeCopied] = useState<number | null>(null)
  const [keyLoading, setKeyLoading] = useState(false)
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [pwdStep, setPwdStep] = useState<'send_code' | 'verify'>('send_code')
  const [pwdCode, setPwdCode] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [codeSending, setCodeSending] = useState(false)
  const [codeCountdown, setCodeCountdown] = useState(0)
  const [activeTab, setActiveTab] = useState<TabType>('curl')
  const [testMessage, setTestMessage] = useState('')
  const [testResponse, setTestResponse] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [spacesLoading, setSpacesLoading] = useState(false)
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null)
  const [chatContexts, setChatContexts] = useState<ContextMessage[]>([])
  const [showCreateSpace, setShowCreateSpace] = useState(false)
  const [newSpaceName, setNewSpaceName] = useState('')
  const [newSpaceDesc, setNewSpaceDesc] = useState('')
  const [editSpaceId, setEditSpaceId] = useState<number | null>(null)
  const [editSpaceName, setEditSpaceName] = useState('')
  const [editSpaceDesc, setEditSpaceDesc] = useState('')
  const [showContextSettings, setShowContextSettings] = useState(false)
  const [contextSettings, setContextSettings] = useState<{
    max_context_messages: number; max_context_tokens: number
  } | null>(null)
  const [usageHistory, setUsageHistory] = useState<DailyUsage[]>([])
  const [todayUsage, setTodayUsage] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageDays, setUsageDays] = useState(14)
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [usernameLoading, setUsernameLoading] = useState(false)

  useEffect(() => {
    loadUsageHistory()
  }, [usageDays])

  const loadUsageHistory = async () => {
    setUsageLoading(true)
    try {
      const res = await userApi.getUsageHistory(usageDays)
      setUsageHistory(res.history || [])
      setTodayUsage(res.today_usage?.total || 0)
    } catch {
    } finally {
      setUsageLoading(false)
    }
  }

  useEffect(() => {
    loadSpaces()
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    setNotifLoading(true)
    try {
      const res = await notificationApi.list()
      setNotifications(res.notifications || [])
      setUnreadCount(res.unread_count || 0)
    } catch {
    } finally {
      setNotifLoading(false)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })))
      setUnreadCount(0)
    } catch {
    }
  }

  const handleNotificationClick = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await notificationApi.markRead(n.user_notification_id)
        setNotifications(prev => prev.map(item =>
          item.user_notification_id === n.user_notification_id
            ? { ...item, is_read: 1 } : item))
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch {
      }
    }
  }

  const handleDeleteNotification = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation()
    try {
      await notificationApi.delete(n.user_notification_id)
      setNotifications(prev => prev.filter(
        item => item.user_notification_id !== n.user_notification_id))
      if (!n.is_read) {
        setUnreadCount(prev => Math.max(0, prev - 1))
      }
    } catch {
    }
  }

  const handleClaimToken = async (e: React.MouseEvent, n: Notification) => {
    e.stopPropagation()
    try {
      const res = await notificationApi.claim(n.user_notification_id)
      setNotifications(prev => prev.map(item =>
        item.user_notification_id === n.user_notification_id
          ? { ...item, is_claimed: 1 } : item))
      showToast(res.message, 'success')
      refreshUser()
    } catch (err: any) {
      showToast(err.message || '领取失败', 'error')
    }
  }

  const loadSpaces = async () => {
    setSpacesLoading(true)
    try {
      const res = await spaceApi.list()
      setSpaces(res.spaces || [])
      if (res.spaces && res.spaces.length > 0 && !selectedSpaceId) {
        setSelectedSpaceId(res.spaces[0].id)
      }
    } catch {
    } finally {
      setSpacesLoading(false)
    }
  }

  const loadContexts = async (spaceId: number) => {
    try {
      const res = await spaceApi.getContexts(spaceId, 100)
      setChatContexts(res.contexts || [])
    } catch {
      setChatContexts([])
    }
  }

  useEffect(() => {
    if (selectedSpaceId) {
      loadContexts(selectedSpaceId)
      loadContextSettings(selectedSpaceId)
    } else {
      setChatContexts([])
    }
  }, [selectedSpaceId])

  const loadContextSettings = async (spaceId: number) => {
    try {
      const res = await spaceApi.getSettings(spaceId)
      setContextSettings({
        max_context_messages: res.settings.max_context_messages,
        max_context_tokens: res.settings.max_context_tokens
      })
    } catch {
      setContextSettings(null)
    }
  }

  const handleCreateSpace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSpaceName.trim()) {
      showToast('请输入空间名称', 'warning')
      return
    }
    try {
      const res = await spaceApi.create({
        name: newSpaceName.trim(),
        description: newSpaceDesc.trim()
      })
      showToast(res.message, 'success')
      setShowCreateSpace(false)
      setNewSpaceName('')
      setNewSpaceDesc('')
      await loadSpaces()
      if (res.space) {
        setSelectedSpaceId(res.space.id)
      }
    } catch (err: any) {
      showToast(err.message || '创建失败', 'error')
    }
  }

  const handleEditSpace = async (spaceId: number) => {
    if (!editSpaceName.trim()) {
      showToast('请输入空间名称', 'warning')
      return
    }
    try {
      const res = await spaceApi.update(spaceId, {
        name: editSpaceName.trim(),
        description: editSpaceDesc.trim()
      })
      showToast(res.message, 'success')
      setEditSpaceId(null)
      setEditSpaceName('')
      setEditSpaceDesc('')
      await loadSpaces()
    } catch (err: any) {
      showToast(err.message || '更新失败', 'error')
    }
  }

  const handleDeleteSpace = async (spaceId: number) => {
    showConfirm('确定要删除这个空间吗？所有上下文将被永久删除。', async () => {
      try {
        const res = await spaceApi.delete(spaceId)
        showToast(res.message, 'success')
        if (selectedSpaceId === spaceId) {
          setSelectedSpaceId(null)
        }
        await loadSpaces()
      } catch (err: any) {
        showToast(err.message || '删除失败', 'error')
      }
    })
  }

  const handleClearContexts = async (spaceId: number) => {
    showConfirm('确定要清空当前空间的上下文吗？', async () => {
      try {
        const res = await spaceApi.clearContexts(spaceId)
        showToast(res.message, 'success')
        setChatContexts([])
      } catch (err: any) {
        showToast(err.message || '清空失败', 'error')
      }
    })
  }

  const handleUpdateSettings = async () => {
    if (!selectedSpaceId || !contextSettings) return
    try {
      const res = await spaceApi.updateSettings(selectedSpaceId, contextSettings)
      showToast(res.message, 'success')
      setShowContextSettings(false)
    } catch (err: any) {
      showToast(err.message || '更新失败', 'error')
    }
  }

  const handleTestCall = async () => {
    if (!testMessage.trim()) {
      showToast('请输入消息内容', 'warning')
      return
    }
    setTestLoading(true)
    setTestResponse('')
    const userMsg = testMessage
    setTestMessage('')
    try {
      const res = await aiApi.chatCompletions(
        [{ role: 'user', content: userMsg }],
        500,
        selectedSpaceId ?? undefined
      )
      const answer = res?.choices?.[0]?.message?.content || ''
      const usage = res?.usage || {}
      const ctxCount = usage['context_messages'] ?? 0
      const ctxTokens = usage['context_tokens'] ?? 0
      const formatted = [
        '━━━ AI 回答 ━━━',
        '',
        answer,
        '',
        '━━━ Token 使用 ━━━',
        '  使用Token: ' + (usage['use-token'] ?? 'N/A'),
        '  剩余Token: ' + (usage['token'] ?? 'N/A'),
        ctxCount > 0 ? '  历史上下文: ' + ctxCount + '条' : '',
        ctxTokens > 0 ? '  load: ' + ctxTokens : '',
        res?.warning ? '⚠️ ' + res.warning : '',
      ].filter(Boolean).join('\n')
      setTestResponse(formatted)
      loadUsageHistory()
      await refreshUser()
      if (selectedSpaceId) {
        loadContexts(selectedSpaceId)
      }
    } catch (err: any) {
      setTestResponse('请求失败: ' + (err.message || '未知错误'))
    } finally {
      setTestLoading(false)
    }
  }

  useEffect(() => {
    if (!text.trim()) { setResult(null); return }
    const timer = setTimeout(async () => {
      setCalcLoading(true)
      try {
        const res = await aiApi.calculateTokens(text)
        setResult(res)
      } catch {} finally { setCalcLoading(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [text])

  const handleCopy = async (textToCopy: string, setter: (v: boolean) => void) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy)
      } else {
        const textarea = document.createElement('textarea')
        textarea.value = textToCopy
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        textarea.style.pointerEvents = 'none'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setter(true)
      setTimeout(() => setter(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      textarea.style.pointerEvents = 'none'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setter(true)
      setTimeout(() => setter(false), 2000)
    }
  }

  const handleRegenerate = async () => {
    showConfirm('确定要重新生成API Key吗？旧的API Key将立即失效。', async () => {
      setKeyLoading(true)
      try {
        const res = await userApi.regenerateApiKey()
        localStorage.setItem('api_key', res.api_key)
        const saved = localStorage.getItem('current_user')
        if (saved) {
          try {
            const userData = JSON.parse(saved)
            userData.api_key = res.api_key
            localStorage.setItem('current_user', JSON.stringify(userData))
          } catch {}
        }
        await refreshUser()
        showToast('API Key已重新生成', 'success')
      } catch (err: any) {
        showToast(err.message || '重新生成失败', 'error')
      } finally {
        setKeyLoading(false)
      }
    })
  }

  const handleUpdateUsername = async () => {
    const name = newUsername.trim()
    if (!name) {
      showToast('请输入用户名', 'warning')
      return
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/.test(name)) {
      showToast('用户名格式不正确（2-20位，支持中英文、数字和下划线）', 'warning')
      return
    }
    setUsernameLoading(true)
    try {
      await userApi.updateUsername(name)
      await refreshUser()
      setEditingUsername(false)
      showToast('用户名已更新', 'success')
    } catch (err: any) {
      showToast(err.message || '修改失败', 'error')
    } finally {
      setUsernameLoading(false)
    }
  }

  const handleSendPwdCode = async () => {
    setCodeSending(true)
    try {
      const res = await authApi.changePasswordSendCode()
      showToast(res.message, 'success')
      setPwdStep('verify')
      setCodeCountdown(60)
      const timer = setInterval(() => {
        setCodeCountdown(prev => {
          if (prev <= 1) { clearInterval(timer); return 0 }
          return prev - 1
        })
      }, 1000)
    } catch (err: any) {
      showToast(err.message || '发送失败', 'error')
    } finally {
      setCodeSending(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      showToast('两次输入的密码不一致', 'warning')
      return
    }
    if (newPwd.length < 8) {
      showToast('新密码至少8位', 'warning')
      return
    }
    if (!/[a-z]/.test(newPwd)) {
      showToast('新密码必须包含小写字母', 'warning')
      return
    }
    if (!/\d/.test(newPwd)) {
      showToast('新密码必须包含数字', 'warning')
      return
    }
    try {
      const res = await authApi.changePassword({
        code: pwdCode, new_password: newPwd, confirm_password: confirmPwd
      })
      showToast(res.message, 'success')
      setShowPwdModal(false)
      setPwdStep('send_code')
      setPwdCode('')
      setNewPwd('')
      setConfirmPwd('')
    } catch (err: any) {
      showToast(err.message || '修改失败', 'error')
    }
  }

  const progress = result ? Math.min((result.tokens / 4096) * 100, 100) : 0

  const maxChartValue = Math.max(...usageHistory.map(d => d.total_tokens), 1)
  const totalUsedTokens = usageHistory.reduce((s, d) => s + d.total_tokens, 0)
  const totalCalls = usageHistory.reduce((s, d) => s + d.call_count, 0)
  const maxDailyTokens = useMemo(() =>
    user?.total_token_quota || user?.remaining_tokens || 50000,
  [user])
  const todayPercent = Math.min((todayUsage / maxDailyTokens) * 100, 100)

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>控制台</h1>
          <p style={{ color: 'var(--gray-400)' }}>
            欢迎回来，{user?.username}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm"
            onClick={() => setShowPwdModal(true)}>
            修改密码
          </button>
          {user?.dynamic_token && (
            <button className="btn btn-secondary btn-sm"
              onClick={() => handleCopy(user?.dynamic_token || '', setDynamicTokenCopied)}>
              {dynamicTokenCopied ? '已复制' : '复制动态Token'}
            </button>
          )}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary btn-sm"
              onClick={() => setShowNotifications(!showNotifications)}
              style={{ position: 'relative' }}>
              <span role="img" aria-label="通知">🔔</span>
              {unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  background: 'var(--error)', color: 'white',
                  borderRadius: '50%', width: '16px', height: '16px',
                  fontSize: '0.65rem', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', fontWeight: 700
                }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
              )}
            </button>
            {showNotifications && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '0.375rem',
                width: 'min(380px, calc(100vw - 2rem))', maxHeight: '480px', overflow: 'auto',
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '0.75rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                zIndex: 100, padding: '0.75rem'
              }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', marginBottom: '0.5rem',
                  padding: '0 0.25rem'
                }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-200)' }}>
                    通知 {unreadCount > 0 && `(${unreadCount}条未读)`}
                  </span>
                  {unreadCount > 0 && (
                    <button className="btn btn-secondary btn-sm"
                      onClick={handleMarkAllRead}
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}>
                      全部标记已读
                    </button>
                  )}
                </div>
                {notifLoading ? (
                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                    <span className="spinner" /> 加载中...
                  </div>
                ) : notifications.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--gray-500)', fontSize: '0.8rem' }}>
                    暂无通知
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.user_notification_id}
                      onClick={() => handleNotificationClick(n)}
                      style={{
                        padding: '0.75rem', borderRadius: '0.5rem',
                        cursor: 'pointer', marginBottom: '0.25rem',
                        position: 'relative',
                        background: n.is_read ? 'transparent' : 'rgba(99,102,241,0.1)',
                        borderLeft: '3px solid ' + (n.is_read ? 'transparent' : 'var(--primary-500)'),
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                      onMouseLeave={e => e.currentTarget.style.background = n.is_read ? 'transparent' : 'rgba(99,102,241,0.1)'}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start', marginBottom: '0.25rem'
                      }}>
                        <span style={{
                          fontSize: '0.8rem', fontWeight: 600, color: 'var(--gray-200)',
                          display: 'flex', alignItems: 'center', gap: '0.375rem'
                        }}>
                          {n.type === 'token_grant' && <span>🎁</span>}
                          {n.subject}
                        </span>
                        <span style={{
                          fontSize: '0.6rem', color: 'var(--gray-500)', whiteSpace: 'nowrap', marginLeft: '0.5rem'
                        }}>
                          {n.created_at?.slice(5, 16)}
                        </span>
                      </div>
                      <p style={{
                        fontSize: '0.75rem', color: 'var(--gray-400)',
                        margin: 0, lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden'
                      }}>
                        {n.body}
                      </p>
                      <div style={{
                        display: 'flex', gap: '0.375rem', marginTop: '0.5rem',
                        alignItems: 'center'
                      }}>
                        {n.type === 'token_grant' && n.token_amount > 0 && (
                          <span style={{
                            fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600,
                            background: 'rgba(16,185,129,0.1)', padding: '0.125rem 0.375rem',
                            borderRadius: '0.25rem'
                          }}>
                            +{n.token_amount.toLocaleString()} Token
                          </span>
                        )}
                        {n.type === 'token_grant' && !n.is_claimed && (
                          <button className="btn btn-primary btn-sm"
                            onClick={e => handleClaimToken(e, n)}
                            style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem' }}>
                            领取
                          </button>
                        )}
                        {n.type === 'token_grant' && n.is_claimed && (
                          <span style={{
                            fontSize: '0.7rem', color: 'var(--gray-500)'
                          }}>
                            已领取
                          </span>
                        )}
                        <div style={{ flex: 1 }} />
                        {n.is_read && (
                          <button className="btn btn-secondary btn-sm"
                            onClick={e => handleDeleteNotification(e, n)}
                            style={{
                              fontSize: '0.65rem', padding: '0.15rem 0.4rem',
                              color: 'var(--gray-500)', opacity: 0.6
                            }}
                            title="删除通知">
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>
            Token 计算器
          </h3>
          <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem',
            marginBottom: '1rem' }}>
            输入文本即可实时计算token数量，支持中英文混合
          </p>
          <div className="form-group">
            <textarea className="input" rows={6}
              placeholder="在此输入文本，实时计算token数量..."
              value={text}
              onChange={e => setText(e.target.value)}
              style={{ resize: 'vertical', fontFamily: 'inherit',
                lineHeight: 1.6 }} />
          </div>

          {calcLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
              color: 'var(--gray-400)', fontSize: '0.875rem' }}>
              <span className="spinner" /> 计算中...
            </div>
          )}

          {result && !calcLoading && (
            <div>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div className="card" style={{ flex: 1, padding: '1rem',
                  textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700,
                    color: 'var(--primary-500)' }}>{result.tokens}</div>
                  <div style={{ fontSize: '0.75rem',
                    color: 'var(--gray-400)' }}>Token 数</div>
                </div>
                <div className="card" style={{ flex: 1, padding: '1rem',
                  textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700,
                    color: 'var(--accent-500)' }}>{result.characters}</div>
                  <div style={{ fontSize: '0.75rem',
                    color: 'var(--gray-400)' }}>字符数</div>
                </div>
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                  fontSize: '0.75rem', color: 'var(--gray-400)',
                  marginBottom: '0.375rem' }}>
                  <span>使用量</span>
                  <span>{result.tokens} / 4096 tokens</span>
                </div>
                <div style={{ height: 8, borderRadius: 4,
                  background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 4,
                    width: progress + '%',
                    background: 'linear-gradient(90deg, ' +
                      'rgba(255,255,255,0.3), rgba(255,255,255,0.8))',
                    transition: 'width 0.3s ease' }} />
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                Token计算基于字符类型和比率配置
              </div>
            </div>
          )}

          {!text.trim() && (
            <div className="empty-state" style={{ padding: '2rem' }}>
              输入文本后自动计算Token数量
            </div>
          )}
        </div>

        <div>
          <div className="card stagger-item" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>我的 API Key</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem',
              marginBottom: '1rem' }}>
              用于调用AI接口的身份凭证，请妥善保管
            </p>
            <div className="api-key-display">
              <span style={{ flex: 1, fontSize: '0.8rem',
                fontFamily: 'monospace' }}>
                {user?.api_key_masked || (user?.api_key ? user.api_key.slice(0, 6) + '****' + user.api_key.slice(-3) : '')}
              </span>
              <button className="copy-btn"
                onClick={() => handleCopy(user?.api_key || '', setApiKeyCopied)}>
                {apiKeyCopied ? '已复制' : '复制'}
              </button>
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <button className="btn btn-danger btn-sm"
                onClick={handleRegenerate} disabled={keyLoading}>
                {keyLoading ? '重新生成中...' : '重新生成 API Key'}
              </button>
            </div>
          </div>

          <div className="card stagger-item">
            <h3 style={{ marginBottom: '1rem' }}>账户信息</h3>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <span style={{ color: 'var(--gray-400)',
                  fontSize: '0.8rem' }}>邮箱</span>
                <div style={{ fontSize: '0.9rem' }}>{user?.email}</div>
              </div>
              <div>
                <span style={{ color: 'var(--gray-400)',
                  fontSize: '0.8rem' }}>用户名</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {editingUsername ? (
                    <>
                      <input className="input" type="text"
                        style={{ flex: 1, fontSize: '0.875rem', padding: '0.375rem 0.5rem' }}
                        value={newUsername}
                        onChange={e => setNewUsername(e.target.value)}
                        placeholder="2-20位，中英文数字和下划线"
                        maxLength={20} />
                      <button className="btn btn-primary btn-sm"
                        onClick={handleUpdateUsername}
                        disabled={usernameLoading}>
                        {usernameLoading ? '保存中...' : '保存'}
                      </button>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => setEditingUsername(false)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '0.9rem' }}>{user?.username}</span>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => { setNewUsername(user?.username || ''); setEditingUsername(true) }}>
                        修改
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--gray-400)',
                  fontSize: '0.8rem' }}>角色</span>
                <div>
                  <span className={'tag ' + (user?.role === 'admin'
                    ? 'tag-admin' : 'tag-user')}>
                    {user?.role === 'admin' ? '管理员' : '普通用户'}
                  </span>
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--gray-400)',
                  fontSize: '0.8rem' }}>剩余Token</span>
                <div style={{ fontSize: '1.25rem', fontWeight: 600,
                  color: user?.remaining_tokens
                    && user.remaining_tokens < 1000
                    ? 'var(--warning)' : 'var(--success)' }}>
                  {(user?.remaining_tokens || 0).toLocaleString()}
                  {user?.remaining_tokens && user.remaining_tokens < 1000 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 400,
                      color: 'var(--gray-400)', marginLeft: '0.5rem' }}>
                      (即将耗尽)
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card stagger-item" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3>使用分析</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
              时间范围:
            </span>
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setUsageDays(d)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: usageDays === d
                    ? 'var(--primary-500)' : 'rgba(255,255,255,0.06)',
                  border: usageDays === d
                    ? '1px solid var(--primary-500)' : '1px solid transparent',
                  borderRadius: '0.25rem', cursor: 'pointer',
                  color: usageDays === d ? 'white' : 'var(--gray-400)',
                  fontSize: '0.7rem'
                }}>
                {d}天
              </button>
            ))}
          </div>
        </div>

        {usageLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '3rem', color: 'var(--gray-400)' }}>
            <span className="spinner" />
          </div>
        ) : (
          <>
            <div className="grid-4" style={{ marginBottom: '1.5rem' }}>
              <div className="card stat-card" style={{ padding: '1rem' }}>
                <div className="stat-label">今日使用</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--primary-500)' }}>
                  {todayUsage.toLocaleString()}
                </div>
                <div style={{ marginTop: '0.375rem', height: 4, borderRadius: 2,
                  background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: todayPercent + '%',
                    background: 'linear-gradient(90deg, var(--primary-500), var(--primary-600))',
                    borderRadius: 2, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--gray-500)', marginTop: '0.25rem' }}>
                  / {maxDailyTokens.toLocaleString()} Token
                </div>
              </div>
              <div className="card stat-card" style={{ padding: '1rem' }}>
                <div className="stat-label">总调用次数</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--accent-500)' }}>
                  {totalCalls}
                </div>
              </div>
              <div className="card stat-card" style={{ padding: '1rem' }}>
                <div className="stat-label">总消耗Token</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--warning)' }}>
                  {totalUsedTokens.toLocaleString()}
                </div>
              </div>
              <div className="card stat-card" style={{ padding: '1rem' }}>
                <div className="stat-label">日均消耗</div>
                <div className="stat-value" style={{ fontSize: '1.5rem', color: 'var(--info)' }}>
                  {usageHistory.length > 0
                    ? Math.round(totalUsedTokens / usageHistory.length).toLocaleString()
                    : 0}
                </div>
              </div>
            </div>

            <div className="chart-section">
              <div className="chart-section-header">
                <span>每日Token消耗趋势</span>
                <div className="chart-legend">
                  <div className="chart-legend-item">
                    <div className="legend-dot prompt-dot" />
                    <span>提示Token</span>
                  </div>
                  <div className="chart-legend-item">
                    <div className="legend-dot completion-dot" />
                    <span>生成Token</span>
                  </div>
                </div>
              </div>
              <BarChart data={usageHistory} maxValue={maxChartValue} />
            </div>

            {usageHistory.length > 0 && (
              <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                共 {usageHistory.length} 天数据 | 平均每天 {Math.round(totalUsedTokens / usageHistory.length).toLocaleString()} Token | 日均调用 {Math.round(totalCalls / usageHistory.length)} 次
              </div>
            )}
          </>
        )}
      </div>

      <div className="card stagger-item" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div>
            <h3 style={{ marginBottom: '0.25rem' }}>API 使用示例</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>
              使用您的 API Key 调用 AI 接口 — 服务地址：
              <code style={{ marginLeft: '0.25rem',
                color: 'var(--primary-500)' }}>{API_HOST}</code>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {(['curl', 'python'] as TabType[]).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{
                  padding: '0.375rem 0.75rem',
                  background: activeTab === t
                    ? 'var(--primary-500)' : 'rgba(255,255,255,0.1)',
                  border: 'none', borderRadius: '0.375rem',
                  color: activeTab === t ? 'white' : 'var(--gray-400)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500
                }}>
                {t === 'curl' ? 'cURL' : 'Python'}
              </button>
            ))}
          </div>
        </div>
        <div className="code-block" style={{ position: 'relative' }}>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap',
            fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.5 }}>
            {activeTab === 'curl'
              ? buildCurl(user?.api_key || '')
              : buildPython(user?.api_key || '')}
          </pre>
          <button className="copy-btn"
            style={{ position: 'absolute', top: '0.5rem', right: '0.5rem' }}
            onClick={() => handleCopy(
              activeTab === 'curl'
                ? buildCurl(user?.api_key || '')
                : buildPython(user?.api_key || ''),
              (v: boolean) => setCodeCopied(v ? 1 : null))}>
            {codeCopied !== null ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="card stagger-item" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>试用</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {selectedSpaceId && (
              <>
                <button className="btn btn-secondary btn-sm"
                  onClick={() => setShowContextSettings(true)}>
                  上下文设置
                </button>
                <button className="btn btn-danger btn-sm"
                  onClick={() => handleClearContexts(selectedSpaceId)}>
                  清空上下文
                </button>
              </>
            )}
            <button className="btn btn-primary btn-sm"
              onClick={() => setShowCreateSpace(true)}>
              + 新建空间
            </button>
          </div>
        </div>

        {spacesLoading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem', color: 'var(--gray-400)' }}>
            <span className="spinner" /> 加载空间...
          </div>
        ) : spaces.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <p>还没有创建任何空间，点击上方按钮创建一个</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {spaces.map(space => (
                <div key={space.id} style={{
                  display: 'flex', alignItems: 'center', gap: '0.25rem',
                  padding: '0.375rem 0.75rem',
                  background: selectedSpaceId === space.id ? 'var(--primary-500)' : 'rgba(255,255,255,0.06)',
                  border: selectedSpaceId === space.id ? '1px solid var(--primary-500)' : '1px solid transparent',
                  borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.8rem',
                  color: selectedSpaceId === space.id ? 'white' : 'var(--gray-300)'
                }}>
                  <span onClick={() => setSelectedSpaceId(space.id)}
                    style={{ cursor: 'pointer' }}>
                    {space.name}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--gray-500)', marginLeft: '0.25rem' }}>
                    ({space.context_count ?? 0})
                  </span>
                  {space.tokens !== undefined && space.tokens >= 0 && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--accent-500)', marginLeft: '0.125rem' }}>
                      {(space.tokens / 1000).toFixed(0)}k
                    </span>
                  )}
                  {editSpaceId === space.id ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', cursor: 'pointer', marginLeft: '0.25rem' }}
                      onClick={() => handleEditSpace(space.id)}>✓</span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: 'var(--gray-500)', cursor: 'pointer', marginLeft: '0.25rem' }}
                      onClick={() => { setEditSpaceId(space.id); setEditSpaceName(space.name); setEditSpaceDesc(space.description || '') }}>✎</span>
                  )}
                  <span style={{ fontSize: '0.7rem', color: 'var(--danger)', cursor: 'pointer', marginLeft: '0.125rem' }}
                    onClick={() => handleDeleteSpace(space.id)}>✕</span>
                </div>
              ))}
            </div>

            {editSpaceId && (
              <div style={{ padding: '0.75rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.04)', borderRadius: '0.5rem' }}>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <input className="input" placeholder="空间名称"
                    value={editSpaceName}
                    onChange={e => setEditSpaceName(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <input className="input" placeholder="空间描述（可选）"
                    value={editSpaceDesc}
                    onChange={e => setEditSpaceDesc(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary btn-sm" onClick={() => handleEditSpace(editSpaceId)}>保存</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditSpaceId(null)}>取消</button>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div className="form-group">
                  <textarea className="input" rows={3} placeholder={
                    selectedSpaceId ? '输入消息，包含历史上下文发送...' : '请先选择一个空间或创建新空间'
                  }
                    value={testMessage}
                    onChange={e => setTestMessage(e.target.value)}
                    disabled={!selectedSpaceId} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary btn-sm"
                    onClick={handleTestCall}
                    disabled={testLoading || !selectedSpaceId}>
                    {testLoading ? '调用中...' : '发送'}
                  </button>
                  {selectedSpaceId && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)', alignSelf: 'center' }}>
                      已启用上下文 ({chatContexts.length} 条历史消息)
                    </span>
                  )}
                </div>
              </div>

              {selectedSpaceId && chatContexts.length > 0 && (
                <div style={{ width: '300px', maxHeight: '300px', overflow: 'auto', fontSize: '0.75rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: 'var(--gray-400)' }}>
                    最近上下文 ({chatContexts.length} 条)
                  </div>
                  {chatContexts.slice(-10).map((ctx, i) => (
                    <div key={ctx.id || i} style={{
                      padding: '0.375rem 0.5rem', marginBottom: '0.25rem',
                      background: 'rgba(255,255,255,0.04)', borderRadius: '0.25rem',
                      borderLeft: '2px solid ' + (
                        ctx.role === 'user' ? 'var(--primary-500)' :
                        ctx.role === 'assistant' ? 'var(--success)' : 'var(--warning)'
                      )
                    }}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--gray-500)', marginBottom: '0.125rem' }}>
                        {ctx.role === 'user' ? '用户' : ctx.role === 'assistant' ? 'AI' : '系统'} · {ctx.token_count}t
                      </div>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ctx.content.slice(0, 80)}{ctx.content.length > 80 ? '...' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {testResponse && (
          <div className="code-block" style={{ marginTop: '1rem', whiteSpace: 'pre-wrap' }}>
            {testResponse}
          </div>
        )}
      </div>

      {showCreateSpace && (
        <div className="modal-overlay" onClick={() => setShowCreateSpace(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>新建空间</h3>
              <button className="modal-close" onClick={() => setShowCreateSpace(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateSpace}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">空间名称</label>
                  <input className="input" placeholder="输入空间名称" autoFocus
                    value={newSpaceName}
                    onChange={e => setNewSpaceName(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">描述（可选）</label>
                  <textarea className="input" rows={2} placeholder="输入空间描述"
                    value={newSpaceDesc}
                    onChange={e => setNewSpaceDesc(e.target.value)} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary"
                  onClick={() => setShowCreateSpace(false)}>取消</button>
                <button type="submit" className="btn btn-primary">创建</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showContextSettings && selectedSpaceId && contextSettings && (
        <div className="modal-overlay" onClick={() => setShowContextSettings(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>上下文设置</h3>
              <button className="modal-close" onClick={() => setShowContextSettings(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">最大上下文消息数</label>
                <input className="input" type="number" min={1} max={200}
                  value={contextSettings.max_context_messages}
                  onChange={e => setContextSettings({ ...contextSettings, max_context_messages: parseInt(e.target.value) || 20 })} />
                <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>每条消息单独计数，超出部分自动丢弃最旧消息</span>
              </div>
              <div className="form-group">
                <label className="form-label">最大上下文 Token 数</label>
                <input className="input" type="number" min={100} max={32000}
                  value={contextSettings.max_context_tokens}
                  onChange={e => setContextSettings({ ...contextSettings, max_context_tokens: parseInt(e.target.value) || 4000 })} />
                <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>超出此 Token 数限制后，最旧的上下文将被丢弃</span>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary"
                onClick={() => setShowContextSettings(false)}>取消</button>
              <button type="button" className="btn btn-primary"
                onClick={handleUpdateSettings}>保存</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>API 文档</h3>
        <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem',
          marginBottom: '1.5rem' }}>
          DingDang Cloud 提供兼容 OpenAI 格式的 API 接口，支持 Bearer Token
          和动态Token两种认证方式。所有API端点基地址为：
          <code style={{ marginLeft: '0.375rem', color: 'var(--primary-500)',
            fontWeight: 600 }}>
            {API_PROTOCOL}://{API_HOST}
          </code>
        </p>

        <div style={{ display: 'grid', gap: '2rem' }}>

          <DocBlock
            color="var(--primary-500)"
            tag="需认证"
            tagType="admin"
            method="POST"
            title="/v1/chat/completions"
            desc="创建聊天完成请求，返回AI模型生成的回答。兼容OpenAI格式，支持普通请求。"
            extraTags={[
              { label: 'POST', type: 'admin', small: true },
              { label: 'application/json', type: 'verified', small: true }
            ]}
            sections={[
              {
                label: '请求参数 (Request Body)',
                code: [
                  '{',
                  '  "messages": [',
                  '    {',
                  '      "role": "user",',
                  '      "content": "你的问题"',
                  '    }',
                  '  ],',
                  '  "max_tokens": 500,',
                  '  "temperature": 0.7',
                  '}',
                ].join('\n')
              },
              {
                label: '请求参数说明',
                table: true,
                rows: [
                  ['messages', 'array', '是', '对话消息列表，支持多轮对话'],
                  ['messages[].role', 'string', '是', '角色: user / assistant / system'],
                  ['messages[].content', 'string', '是', '消息内容'],
                  ['max_tokens', 'int', '否', '最大生成Token数（默认500, 最大4096）'],
                  ['temperature', 'float', '否', '生成温度 (0-2, 默认0.7)'],
                ]
              },
              {
                label: '成功响应',
                code: [
                  '{',
                  '  "id": "chatcmpl-xxx",',
                  '  "object": "chat.completion",',
                  '  "created": 1742000000,',
                  '  "choices": [',
                  '    {',
                  '      "index": 0,',
                  '      "message": {',
                  '        "role": "assistant",',
                  '        "content": "回答内容"',
                  '      },',
                  '      "finish_reason": "stop"',
                  '    }',
                  '  ],',
                  '  "usage": {',
                  '    "use-token": 10,',
                  '    "token": 9990',
                  '  }',
                  '}',
                ].join('\n')
              },
              {
                label: '认证方式说明',
                code: [
                  '# 方式一：Bearer Token 认证（推荐）',
                  '# 在请求头中添加您的 API Key',
                  'Authorization: Bearer ' + (user?.api_key || 'your-api-key'),
                  '',
                  '# 方式二：动态Token认证',
                  '# 1. 先调用 /api/user/dynamic-token 获取临时Token',
                  '# 2. 在请求头中添加',
                  'X-Dynamic-Token: <dynamic_token>',
                  '',
                  '# 注意：动态Token有效期1小时，到期后需重新获取',
                ].join('\n')
              },
              {
                label: '错误响应',
                code: [
                  '{',
                  '  "error": "错误描述信息"',
                  '}',
                  '',
                  '状态码说明:',
                  '  200  - 成功',
                  '  400  - 请求参数错误',
                  '  401  - 未提供有效认证凭证',
                  '  403  - 账户被禁用或未验证邮箱',
                  '  429  - 请求过于频繁',
                  '  500  - 服务器内部错误',
                ].join('\n')
              },
            ]}
          />

          <DocBlock
            color="var(--primary-500)"
            tag="公开注册"
            tagType="verified"
            method="POST"
            title="/api/auth/register"
            desc="注册新用户账号。注意：同一邮箱地址只能注册或绑定一个账号，重复注册将返回 409 冲突错误。"
            sections={[
              {
                label: '请求示例',
                code: [
                  'POST ' + API_PROTOCOL + '://' + API_HOST + '/api/auth/register',
                  'Content-Type: application/json',
                  '',
                  '{',
                  '  "email": "user@example.com",',
                  '  "password": "yourPassword123",',
                  '  "username": "yourname",',
                  '  "code": "123456"  # 可选：邮件验证码（若启用）',
                  '}',
                ].join('\n')
              },
              {
                label: '成功响应示例',
                code: [
                  '{',
                  '  "message": "注册成功",',
                  '  "email": "user@example.com",',
                  '  "user": { "id": 1, "email": "user@example.com", "username": "yourname" }',
                  '}',
                ].join('\n')
              },
              {
                label: '错误示例（邮箱已注册）',
                code: [
                  'HTTP/1.1 409 Conflict',
                  '{',
                  '  "error": "该邮箱已注册"',
                  '}',
                ].join('\n')
              },
            ]}
          />

          <DocBlock
            color="var(--accent-500)"
            tag="无需认证"
            tagType="verified"
            method="POST"
            title="/v1/calculate_tokens"
            desc="计算文本的Token数量，无需认证。支持中英文混合文本，按DingDang Cloud的Token计算策略返回结果。"
            sections={[
              {
                label: '请求示例',
                code: [
                  'POST ' + API_PROTOCOL + '://' + API_HOST + '/v1/calculate_tokens',
                  'Content-Type: application/json',
                  '',
                  '{',
                  '  "text": "你好世界 Hello World"',
                  '}',
                ].join('\n')
              },
              {
                label: '响应示例',
                code: [
                  '{',
                  '  "text": "你好世界 Hello World",',
                  '  "tokens": 5,',
                  '  "characters": 16,',
                  '  "model": "qwen",',
                  '  "config_used": {',
                  '    "chinese_ratio": 2.0,',
                  '    "english_ratio": 4.0,',
                  '    "other_ratio": 2.0',
                  '  }',
                  '}',
                ].join('\n')
              },
            ]}
          />

          <DocBlock
            color="var(--info)"
            tag="无需认证"
            tagType="verified"
            method="GET"
            title="/v1/models"
            desc="获取当前支持的AI模型列表，兼容OpenAI格式。"
            sections={[
              {
                label: '响应示例',
                code: [
                  'GET ' + API_PROTOCOL + '://' + API_HOST + '/v1/models',
                  '',
                  '{',
                  '  "object": "list",',
                  '  "data": [',
                  '    {',
                  '      "id": "qwen",',
                  '      "object": "model",',
                  '      "created": 1742000000,',
                  '      "owned_by": "alibaba",',
                  '      "max_tokens": 4096,',
                  '      "name": "Qwen"',
                  '    },',
                  '    {',
                  '      "id": "qwen-max",',
                  '      "object": "model",',
                  '      "created": 1742000000,',
                  '      "owned_by": "alibaba",',
                  '      "max_tokens": 4096,',
                  '      "name": "Qwen-Max"',
                  '    }',
                  '  ]',
                  '}',
                ].join('\n')
              },
            ]}
          />

          <DocBlock
            color="var(--warning)"
            tag="需Bearer认证"
            tagType="admin"
            method="POST"
            title="/api/user/dynamic-token"
            desc="生成动态加密Token（有效期1小时），用于非用户API接口认证。适合服务端对服务端调用场景，无需暴露永久API Key。"
            sections={[
              {
                label: '请求示例',
                code: [
                  'POST ' + API_PROTOCOL + '://' + API_HOST + '/api/user/dynamic-token',
                  'Authorization: Bearer ' + (user?.api_key || 'your-api-key'),
                  '',
                  '{}',
                ].join('\n')
              },
              {
                label: '响应示例',
                code: [
                  '{',
                  '  "dynamic_token": "eyJ1aWQiOiAxLCAicGVybSI6ICJyZWFkIn0...",',
                  '  "expires_in": 3600',
                  '}',
                ].join('\n')
              },
              {
                label: 'Python使用示例',
                code: [
                  'import requests',
                  '',
                  '# 1. 先获取动态Token',
                  'resp = requests.post(',
                  '    "' + API_PROTOCOL + '://' + API_HOST + '/api/user/dynamic-token",',
                  '    headers={"Authorization": "Bearer your-api-key"}',
                  ')',
                  'dynamic_token = resp.json()["dynamic_token"]',
                  '',
                  '# 2. 使用动态Token调用AI接口',
                  'resp = requests.post(',
                  '    "' + API_PROTOCOL + '://' + API_HOST + '/v1/chat/completions",',
                  '    headers={"X-Dynamic-Token": dynamic_token},',
                  '    json={',
                  '        "messages": [',
                  '            {"role": "user", "content": "你好"}',
                  '        ]',
                  '    }',
                  ')',
                  'print(resp.json())',
                ].join('\n')
              },
            ]}
          />

          <DocBlock
            color="var(--error)"
            tag="无需认证"
            tagType="verified"
            method="GET"
            title="/health"
            desc="健康检查端点，用于监控系统运行状态。"
            sections={[
              {
                label: '响应示例',
                code: [
                  'GET ' + API_PROTOCOL + '://' + API_HOST + '/health',
                  '',
                  '{',
                  '  "status": "ok",',
                  '  "timestamp": 1742000000.123',
                  '}',
                ].join('\n')
              },
            ]}
          />

          {user?.role === 'admin' && (
            <DocBlock
              color="var(--success)"
              tag="需管理员"
              tagType="admin"
              method="GET"
              title="/api/admin/users"
              desc="获取用户列表（需要管理员权限），支持按邮箱/用户名搜索。"
              sections={[
                {
                  label: '请求示例',
                  code: [
                    'GET ' + API_PROTOCOL + '://' + API_HOST + '/api/admin/users',
                    'Authorization: Bearer <admin-api-key>',
                    '',
                    '# 搜索用户',
                    'GET ' + API_PROTOCOL + '://' + API_HOST + '/api/admin/users?search=test',
                  ].join('\n')
                },
                {
                  label: '管理端 API 概览',
                  table: true,
                  rows: [
                    ['GET', '/api/admin/users', '用户列表（支持?search=）'],
                    ['PUT', '/api/admin/users/{id}', '编辑用户数据'],
                    ['POST', '/api/admin/users/{id}/toggle-status', '启用/禁用用户'],
                    ['GET', '/api/admin/token-config', '获取Token计算配置'],
                    ['PUT', '/api/admin/token-config', '修改Token计算配置'],
                    ['GET', '/api/admin/usage-stats', '系统使用统计'],
                  ]
                },
              ]}
            />
          )}

          <div>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem',
              color: 'var(--gray-300)' }}>
              通用错误码说明
            </h4>
            <table style={{ fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th>状态码</th>
                  <th>含义</th>
                  <th>常见原因</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><span className="tag tag-active">200</span></td>
                  <td>成功</td>
                  <td style={{ fontSize: '0.75rem' }}>请求处理完成</td>
                </tr>
                <tr>
                  <td><span className="tag tag-unverified">400</span></td>
                  <td>请求错误</td>
                  <td style={{ fontSize: '0.75rem' }}>缺少必填参数或格式不正确</td>
                </tr>
                <tr>
                  <td><span className="tag tag-unverified">401</span></td>
                  <td>未认证</td>
                  <td style={{ fontSize: '0.75rem' }}>API Key无效或未提供</td>
                </tr>
                <tr>
                  <td><span className="tag tag-unverified">403</span></td>
                  <td>无权限</td>
                  <td style={{ fontSize: '0.75rem' }}>账户禁用/未验证邮箱/非管理员</td>
                </tr>
                <tr>
                  <td><span className="tag tag-disabled">404</span></td>
                  <td>不存在</td>
                  <td style={{ fontSize: '0.75rem' }}>请求的资源不存在</td>
                </tr>
                <tr>
                  <td><span className="tag tag-disabled">409</span></td>
                  <td>冲突</td>
                  <td style={{ fontSize: '0.75rem' }}>邮箱已注册等资源冲突</td>
                </tr>
                <tr>
                  <td><span className="tag tag-disabled">423</span></td>
                  <td>已锁定</td>
                  <td style={{ fontSize: '0.75rem' }}>账户因多次失败尝试被临时锁定</td>
                </tr>
                <tr>
                  <td><span className="tag tag-unverified">429</span></td>
                  <td>频率限制</td>
                  <td style={{ fontSize: '0.75rem' }}>请求过于频繁，请稍后再试</td>
                </tr>
                <tr>
                  <td><span className="tag tag-disabled">500</span></td>
                  <td>服务器错误</td>
                  <td style={{ fontSize: '0.75rem' }}>服务器内部异常，请联系管理员</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showPwdModal && (
        <div className="modal-overlay"
          onClick={() => {
            setShowPwdModal(false)
            setPwdStep('send_code')
            setPwdCode('')
            setNewPwd('')
            setConfirmPwd('')
          }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            {pwdStep === 'send_code' ? (
              <>
                <div className="modal-header">
                  <h3>修改密码</h3>
                  <button className="modal-close" onClick={() => {
                    setShowPwdModal(false)
                    setPwdStep('send_code')
                  }}>✕</button>
                </div>
                <div className="modal-body">
                  <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem',
                    marginBottom: '1rem' }}>
                    点击下方按钮，验证码将发送到您的注册邮箱
                  </p>
                  <button className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={handleSendPwdCode}
                    disabled={codeSending}>
                    {codeSending ? '发送中...' : '发送验证码到邮箱'}
                  </button>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary"
                    onClick={() => {
                      setShowPwdModal(false)
                      setPwdStep('send_code')
                    }}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-header">
                  <h3>修改密码</h3>
                  <button className="modal-close" onClick={() => {
                    setShowPwdModal(false)
                    setPwdStep('send_code')
                    setPwdCode('')
                    setNewPwd('')
                    setConfirmPwd('')
                  }}>✕</button>
                </div>
                <div className="modal-body">
                  <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem',
                    marginBottom: '1rem' }}>
                    验证码已发送到您的邮箱，请查收后设置新密码
                  </p>
                  <form onSubmit={handleChangePassword}>
                    <div className="form-group">
                      <label className="label">邮箱验证码</label>
                      <input className="input" type="text"
                        placeholder="请输入6位验证码" maxLength={6}
                        value={pwdCode}
                        onChange={e => setPwdCode(
                          e.target.value.replace(/\D/g, ''))} required />
                      <div style={{ marginTop: '0.375rem' }}>
                        <button type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handleSendPwdCode}
                          disabled={codeSending || codeCountdown > 0}>
                          {codeCountdown > 0
                            ? codeCountdown + 's后重发'
                            : (codeSending ? '发送中...' : '重新发送')}
                        </button>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="label">新密码（至少8位，需包含小写字母和数字）</label>
                      <input className="input" type="password"
                        placeholder="至少8位，需包含小写字母和数字"
                        value={newPwd}
                        onChange={e => setNewPwd(e.target.value)}
                        minLength={8} required />
                    </div>
                    <div className="form-group">
                      <label className="label">确认新密码</label>
                      <input className="input" type="password"
                        placeholder="请再次输入新密码"
                        value={confirmPwd}
                        onChange={e => setConfirmPwd(e.target.value)}
                        minLength={8} required />
                    </div>
                  </form>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary"
                    onClick={() => {
                      setShowPwdModal(false)
                      setPwdStep('send_code')
                      setPwdCode('')
                      setNewPwd('')
                      setConfirmPwd('')
                    }}>
                    取消
                  </button>
                  <button className="btn btn-primary"
                    onClick={handleChangePassword}>
                    确认修改
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DocBlock(props: {
  color: string
  tag: string
  tagType: string
  method: string
  title: string
  desc: string
  extraTags?: Array<{ label: string; type: string; small: boolean }>
  sections: Array<{
    label: string
    code?: string
    table?: boolean
    rows?: Array<string[]>
  }>
}) {
  return (
    <div className="card" style={{
      borderLeft: '3px solid ' + props.color,
      padding: '1rem 1.25rem'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
        marginBottom: '0.5rem' }}>
        <span className={'tag tag-' + props.tagType}
          style={{ fontSize: '0.65rem' }}>{props.tag}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--gray-500)',
          fontFamily: 'monospace' }}>{props.method}</span>
      </div>
      <h4 style={{ fontSize: '1.1rem', fontWeight: 700,
        marginBottom: '0.375rem', color: props.color,
        fontFamily: 'monospace' }}>
        {props.title}
      </h4>
      <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem',
        marginBottom: '1rem' }}>
        {props.desc}
      </p>

      {props.extraTags && (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
          marginBottom: '0.75rem' }}>
          {props.extraTags.map((t, i) => (
            <span key={i} className={'tag tag-' + t.type}
              style={{ fontSize: '0.7rem' }}>{t.label}</span>
          ))}
        </div>
      )}

      {props.sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: '0.75rem' }}>
          {sec.code && (
            <>
              <span style={{ color: 'var(--gray-500)', fontSize: '0.75rem',
                display: 'block', marginBottom: '0.375rem' }}>{sec.label}</span>
              <div className="code-block" style={{
                fontSize: '0.75rem',
                whiteSpace: 'pre-wrap',
                fontFamily: 'monospace',
                lineHeight: 1.5,
                overflow: 'auto'
              }}>
                {sec.code}
              </div>
            </>
          )}
          {sec.table && sec.rows && (
            <>
              <span style={{ color: 'var(--gray-500)', fontSize: '0.75rem',
                display: 'block', marginBottom: '0.375rem' }}>{sec.label}</span>
              <table style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    {sec.rows[0].map((h, hi) => (
                      <th key={hi}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.slice(1).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={ci > 1 ? { fontSize: '0.75rem' } : {}}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {sec.rows.length === 1 && (
                    <tr>
                      <td colSpan={sec.rows[0].length}
                        style={{ textAlign: 'center', padding: '2rem',
                          color: 'var(--gray-500)' }}>
                        暂无数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      ))}
    </div>
  )
}