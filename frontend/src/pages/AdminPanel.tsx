import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { adminApi, aiApi } from '../services/api'
import { useToast } from '../components/Toast'
import type { AdminUser, TokenConfig, UsageStats, IPBan, IPTracking, AuditLogEntry, AdminTask, AutoBanRule } from '../types/api'

type AdminTab = 'users' | 'ip_monitor' | 'ip_bans' | 'security_config' | 'audit_log' | 'tasks' | 'badges'

const priorityLabels: Record<number, string> = {
  0: '最高', 1: '高', 2: '中', 3: '较低', 4: '低', 5: '最低'
}

const TAB_NAMES: Record<AdminTab, string> = {
  users: '用户管理',
  ip_monitor: 'IP 监控',
  ip_bans: 'IP 封禁',
  security_config: '安全配置',
  audit_log: '审计日志',
  tasks: '任务管理',
  badges: '称号系统'
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const { showToast, showConfirm, showLoading, closeToast } = useToast()

  return (
    <div className="container">
      <div className="page-header">
        <div>
          <h1>管理中心</h1>
          <p style={{ color: 'var(--gray-400)' }}>用户管理与系统安全监控</p>
        </div>
      </div>

      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '1.5rem',
        padding: '0.375rem', background: 'rgba(0,0,0,0.2)', borderRadius: '0.5rem',
        flexWrap: 'wrap'
      }}>
        {(Object.entries(TAB_NAMES) as [AdminTab, string][]).map(([key, label]) => (
          <button key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1, padding: '0.5rem 1rem', minWidth: '5rem',
              background: activeTab === key ? 'var(--primary-500)' : 'transparent',
              border: 'none', borderRadius: '0.375rem',
              color: activeTab === key ? 'white' : 'var(--gray-400)',
              cursor: 'pointer', fontWeight: activeTab === key ? 600 : 400,
              fontSize: '0.85rem', fontFamily: 'inherit',
              transition: 'all 0.2s'
            }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'users' && <UserManagementTab showToast={showToast} showConfirm={showConfirm} />}
      {activeTab === 'ip_monitor' && <IpMonitorTab showToast={showToast} showConfirm={showConfirm} showLoading={showLoading} closeToast={closeToast} />}
      {activeTab === 'ip_bans' && <IpBansTab showToast={showToast} showConfirm={showConfirm} />}
      {activeTab === 'security_config' && <SecurityConfigTab showToast={showToast} />}
      {activeTab === 'audit_log' && <AuditLogTab showToast={showToast} />}
      {activeTab === 'tasks' && <TasksManagementTab showToast={showToast} />}
      {activeTab === 'badges' && <BadgesManagementTab showToast={showToast} />}
    </div>
  )
}

function TasksManagementTab({ showToast }: { showToast: any }) {
  const [tasks, setTasks] = useState<AdminTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState(2)
  const [editId, setEditId] = useState<number | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getTasks()
      setTasks(res.tasks)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleSubmit = async () => {
    if (!title.trim()) return showToast('请输入任务标题', 'error')
    try {
      const data: any = { title: title.trim(), description: description.trim(), priority }
      if (editId) {
        await adminApi.updateTask(editId, data)
        showToast('任务已更新', 'success')
      } else {
        await adminApi.createTask(data)
        showToast('任务已创建', 'success')
      }
      setShowForm(false)
      setEditId(null)
      setTitle('')
      setDescription('')
      setPriority(2)
      loadData()
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  const handleEdit = (task: AdminTask) => {
    setEditId(task.id)
    setTitle(task.title)
    setDescription(task.description)
    setPriority(task.priority)
    setShowForm(true)
  }

  const handleDelete = async (taskId: number) => {
    try {
      await adminApi.deleteTask(taskId)
      showToast('任务已删除', 'success')
      loadData()
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error')
    }
  }

  const handleStatusChange = async (task: AdminTask, status: string) => {
    try {
      await adminApi.updateTask(task.id, { status } as any)
      showToast('状态已更新', 'success')
      loadData()
    } catch (err: any) {
      showToast(err.message || '更新失败', 'error')
    }
  }

  const handleCleanup = async () => {
    try {
      const res = await adminApi.cleanupTasks()
      showToast(res.message, 'success')
      loadData()
    } catch (err: any) {
      showToast(err.message || '清理失败', 'error')
    }
  }

  const statusColor = (s: string) => ({
    pending: '#f59e0b', in_progress: '#3b82f6',
    completed: '#22c55e', failed: '#ef4444', canceled: '#6b7280'
  }[s] || '#6b7280')

  const priorityLabel = (p: number) =>
    priorityLabels[p] || (p < 2 ? '高' : p > 3 ? '低' : '中')

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => {
          setEditId(null); setTitle(''); setDescription(''); setPriority(2); setShowForm(true)
        }}>
          新建任务
        </button>
        <button className="btn btn-secondary btn-sm" onClick={handleCleanup}>
          清理过期
        </button>
        <button className="btn btn-secondary btn-sm" onClick={loadData} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <h4 style={{ marginBottom: '0.75rem' }}>{editId ? '编辑任务' : '新建任务'}</h4>
          <div className="form-group">
            <label className="form-label">标题</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="任务标题" />
          </div>
          <div className="form-group">
            <label className="form-label">描述</label>
            <textarea className="input" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="任务描述（可选）" rows={3} style={{ resize: 'vertical' }} />
          </div>
          <div className="form-group">
            <label className="form-label">优先级</label>
            <select className="input" value={priority} onChange={e => setPriority(Number(e.target.value))}>
              <option value={0}>最高</option>
              <option value={1}>高</option>
              <option value={2}>中</option>
              <option value={3}>较低</option>
              <option value={4}>低</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button className="btn btn-primary btn-sm" onClick={handleSubmit}>
              {editId ? '保存' : '创建'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => {
              setShowForm(false); setEditId(null); setTitle(''); setDescription('')
            }}>
              取消
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
          <span className="spinner" /> 加载中...
        </div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-500)' }}>
          暂无任务
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ fontSize: '0.75rem', width: '100%', minWidth: 700 }}>
            <thead>
              <tr>
                <th>ID</th>
                <th>标题</th>
                <th>状态</th>
                <th>优先级</th>
                <th>创建时间</th>
                <th>完成时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'monospace' }}>{t.id}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.description}>
                    {t.title}
                    {t.description ? <span style={{ color: 'var(--gray-500)', marginLeft: '0.25rem' }}>- {t.description}</span> : null}
                  </td>
                  <td>
                    <span style={{ color: statusColor(t.status), fontWeight: 600 }}>{t.status}</span>
                  </td>
                  <td>{priorityLabel(t.priority)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{t.created_at?.replace('T', ' ').slice(0, 16)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--gray-500)' }}>
                    {t.completed_at ? t.completed_at.replace('T', ' ').slice(0, 16) : '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                      {t.status === 'pending' && (
                        <button className="btn btn-sm btn-primary" style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                          onClick={() => handleStatusChange(t, 'in_progress')}>
                          开始
                        </button>
                      )}
                      {t.status === 'in_progress' && (
                        <button className="btn btn-sm btn-success" style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                          onClick={() => handleStatusChange(t, 'completed')}>
                          完成
                        </button>
                      )}
                      {t.status === 'pending' && (
                        <button className="btn btn-sm btn-secondary" style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                          onClick={() => handleEdit(t)}>
                          编辑
                        </button>
                      )}
                      <button className="btn btn-sm btn-danger" style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                        onClick={() => handleDelete(t.id)}>
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function UserManagementTab({ showToast, showConfirm }: { showToast: any; showConfirm: any }) {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [config, setConfig] = useState<TokenConfig>({
    chinese_ratio: 2, english_ratio: 4, other_ratio: 2
  })
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [editUser, setEditUser] = useState<AdminUser | null>(null)
  const [editForm, setEditForm] = useState({
    email: '', username: '', remaining_tokens: 0,
    max_concurrent: 20, priority: 2
  })
  const [notifSubject, setNotifSubject] = useState('')
  const [notifBody, setNotifBody] = useState('')
  const [notifType, setNotifType] = useState<'announcement' | 'token_grant'>('announcement')
  const [notifTokenAmount, setNotifTokenAmount] = useState(1000)
  const [notifTargetType, setNotifTargetType] = useState<'all' | 'single' | 'batch'>('all')
  const [notifTargetInput, setNotifTargetInput] = useState('')
  const [notifBatchFormat, setNotifBatchFormat] = useState<'list' | 'json'>('list')
  const [notifSending, setNotifSending] = useState(false)
  const [polishing, setPolishing] = useState(false)

  const filteredUsers = users.filter(u => u.role !== 'admin')

  const loadData = async (searchTerm?: string) => {
    setLoading(true)
    try {
      const [userRes, configRes, statsRes] = await Promise.all([
        adminApi.getUsers(searchTerm),
        adminApi.getTokenConfig(),
        adminApi.getUsageStats()
      ])
      setUsers(userRes.users)
      setConfig(configRes)
      setStats(statsRes)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    const socket = io({ transports: ['websocket', 'polling'] })
    socket.on('connect', () => {
      socket.emit('join_admin_ai_requests')
    })
    socket.on('user_token_updated', () => {
      loadData()
    })
    return () => { socket.disconnect() }
  }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadData(search)
  }

  const handleToggleStatus = async (userId: number) => {
    try {
      const res = await adminApi.toggleUserStatus(userId)
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_active: res.is_active ? 1 : 0 } : u))
      showToast('用户状态已' + (res.is_active ? '启用' : '禁用'), 'success')
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  const handleDeleteUser = (userId: number, username: string) => {
    showConfirm(`确定要删除用户「${username}」吗？此操作不可恢复！`, async () => {
      try {
        await adminApi.deleteUser(userId)
        setUsers(prev => prev.filter(u => u.id !== userId))
        showToast('用户已删除', 'success')
      } catch (err: any) {
        showToast(err.message || '删除失败', 'error')
      }
    })
  }

  const handleSaveConfig = async () => {
    setSaving(true)
    try {
      const res = await adminApi.updateTokenConfig(config)
      setConfig(res)
      showToast('Token配置已更新', 'success')
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (u: AdminUser) => {
    setEditUser(u)
    setEditForm({
      email: u.email,
      username: u.username,
      remaining_tokens: u.remaining_tokens ?? 10000,
      max_concurrent: u.max_concurrent || 20,
      priority: u.priority || 2
    })
  }

  const handleSaveEdit = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      const res = await adminApi.updateUserFull(editUser.id, editForm)
      setUsers(prev => prev.map(u => u.id === editUser.id ? res : u))
      showToast('用户数据已更新', 'success')
      setEditUser(null)
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handlePolish = async () => {
    if (!notifSubject.trim() && !notifBody.trim()) {
      showToast('请先输入要润色的通知主题或内容', 'warning')
      return
    }
    setPolishing(true)
    try {
      const res = await adminApi.polishText({
        subject: notifSubject.trim() || undefined,
        body: notifBody.trim() || undefined,
        style: 'formal'
      })
      if (res.subject) setNotifSubject(res.subject)
      if (res.body) setNotifBody(res.body)
      showToast('AI润色完成', 'success')
    } catch (err: any) {
      showToast(err.message || '润色失败', 'error')
    } finally {
      setPolishing(false)
    }
  }

  const handleSendNotification = async () => {
    if (!notifSubject.trim()) {
      showToast('请输入通知主题', 'warning')
      return
    }
    if (!notifBody.trim()) {
      showToast('请输入通知内容', 'warning')
      return
    }
    if (notifType === 'token_grant' && notifTokenAmount <= 0) {
      showToast('Token数量必须大于0', 'warning')
      return
    }
    if (notifTargetType === 'single' && !notifTargetInput) {
      showToast('请输入目标用户的ID、邮箱或用户名', 'warning')
      return
    }
    if (notifTargetType === 'batch' && !notifTargetInput.trim()) {
      showToast('请输入目标用户列表', 'warning')
      return
    }
    setNotifSending(true)
    try {
      const res = await adminApi.sendNotification({
        subject: notifSubject.trim(),
        body: notifBody.trim(),
        type: notifType,
        token_amount: notifType === 'token_grant' ? notifTokenAmount : 0,
        target_type: notifTargetType,
        target_user_id: notifTargetType === 'single' ? notifTargetInput : undefined,
        target_list: notifTargetType === 'batch' ? notifTargetInput.trim() : undefined
      })
      showToast(res.message, 'success')
      setNotifSubject('')
      setNotifBody('')
      setNotifType('announcement')
      setNotifTokenAmount(1000)
      setNotifTargetType('all')
      setNotifTargetInput('')
    } catch (err: any) {
      showToast(err.message || '发送失败', 'error')
    } finally {
      setNotifSending(false)
    }
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  return (
    <>
      {stats && (
        <div className="grid-4 stagger-group" style={{ marginBottom: '1.5rem' }}>
          <div className="card stat-card stagger-item">
            <div className="stat-label">总用户数</div>
            <div className="stat-value" style={{ color: 'var(--primary-500)' }}>
              {stats.total_users - 1}
            </div>
          </div>
          <div className="card stat-card stagger-item">
            <div className="stat-label">已验证邮箱</div>
            <div className="stat-value" style={{ color: 'var(--success)' }}>
              {stats.verified_users}
            </div>
          </div>
          <div className="card stat-card stagger-item">
            <div className="stat-label">活跃用户</div>
            <div className="stat-value" style={{ color: 'var(--accent-500)' }}>
              {stats.active_users}
            </div>
          </div>
          <div className="card stat-card stagger-item">
            <div className="stat-label">未验证</div>
            <div className="stat-value" style={{ color: 'var(--warning)' }}>
              {Math.max(0, stats.total_users - stats.verified_users)}
            </div>
          </div>
          <div className="card stat-card stagger-item">
            <div className="stat-label">上传Token</div>
            <div className="stat-value" style={{ color: '#f59e0b', fontSize: '1.1rem' }}>
              {(stats.total_upload_tokens ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="card stat-card stagger-item">
            <div className="stat-label">下载Token</div>
            <div className="stat-value" style={{ color: '#8b5cf6', fontSize: '1.1rem' }}>
              {(stats.total_download_tokens ?? 0).toLocaleString()}
            </div>
          </div>
          <div className="card stat-card stagger-item">
            <div className="stat-label">总Token消耗</div>
            <div className="stat-value" style={{ color: '#ec4899', fontSize: '1.1rem' }}>
              {(stats.total_used_tokens ?? 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      <div className="grid-2 stagger-group">
        <div className="card stagger-item">
          <h3 style={{ marginBottom: '1rem' }}>用户管理</h3>

          <form onSubmit={handleSearch}
            style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <input className="input" type="text"
              placeholder="搜索邮箱或用户名..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1 }} />
            <button type="submit" className="btn btn-primary btn-sm">搜索</button>
            {search && (
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => { setSearch(''); loadData() }}>清除</button>
            )}
          </form>

          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>邮箱</th>
                  <th>用户名</th>
                  <th>Token</th>
                  <th>并发</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--gray-400)' }}>{u.id}</td>
                    <td style={{
                      maxWidth: 150, overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}>{u.email}</td>
                    <td>{u.username}</td>
                    <td>{(u.remaining_tokens || 0).toLocaleString()}</td>
                    <td>{u.max_concurrent || 20}</td>
                    <td>
                      <span className={'tag ' + (
                        (u.priority ?? 2) === 0
                          ? 'tag-admin'
                          : (u.priority ?? 2) <= 2
                            ? 'tag-verified' : 'tag-user')}>
                        {priorityLabels[u.priority ?? 2] || '中'}
                      </span>
                    </td>
                    <td>
                      <span className={'tag ' + (
                        u.is_active ? 'tag-active' : 'tag-disabled')}>
                        {u.is_active ? '正常' : '禁用'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-sm btn-primary"
                          onClick={() => openEdit(u)}>编辑</button>
                        <button className={'btn btn-sm ' + (
                          u.is_active ? 'btn-danger' : 'btn-success')}
                          onClick={() => handleToggleStatus(u.id)}>
                          {u.is_active ? '禁用' : '启用'}
                        </button>
                        <button className="btn btn-sm"
                          style={{ background: 'rgba(239,68,68,0.2)',
                            color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)' }}
                          onClick={() => handleDeleteUser(u.id, u.username)}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
            <div className="empty-state" style={{ padding: '2rem' }}>
              {search ? '未找到匹配的用户' : '暂无用户数据'}
            </div>
          )}
        </div>

        <div>
          <div className="card stagger-item" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Token 计算配置</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem',
              marginBottom: '1rem' }}>
              管理员可调整Token计算的分母比率，值越大Token越少
            </p>
            <div className="form-group">
              <label className="label">中文比率（字符/token）</label>
              <input className="input" type="number" step="0.5" min="0.5"
                max="10" value={config.chinese_ratio}
                onChange={e => setConfig({
                  ...config, chinese_ratio: parseFloat(e.target.value) || 2
                })} />
            </div>
            <div className="form-group">
              <label className="label">英文比率（字符/token）</label>
              <input className="input" type="number" step="0.5" min="0.5"
                max="10" value={config.english_ratio}
                onChange={e => setConfig({
                  ...config, english_ratio: parseFloat(e.target.value) || 4
                })} />
            </div>
            <div className="form-group">
              <label className="label">其他字符比率（字符/token）</label>
              <input className="input" type="number" step="0.5" min="0.5"
                max="10" value={config.other_ratio}
                onChange={e => setConfig({
                  ...config, other_ratio: parseFloat(e.target.value) || 2
                })} />
            </div>
            <button className="btn btn-primary"
              onClick={handleSaveConfig} disabled={saving}
              style={{ width: '100%' }}>
              {saving
                ? <><span className="spinner" /> 保存中...</>
                : '保存配置'}
            </button>
          </div>

          <div className="card stagger-item">
            <h3 style={{ marginBottom: '0.75rem' }}>系统信息</h3>
            <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem' }}>
              DingDang Cloud v3.2
            </p>
            <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem',
              marginTop: '0.25rem' }}>
              管理平台 - 用户总数: {stats?.total_users || 0}
            </p>
          </div>

          <div className="card stagger-item" style={{ marginTop: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>发送通知</h3>
            <div className="form-group">
              <label className="form-label">通知类型</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={'btn btn-sm ' + (notifType === 'announcement' ? 'btn-primary' : 'btn-secondary')}
                  onClick={() => setNotifType('announcement')}>公告</button>
                <button className={'btn btn-sm ' + (notifType === 'token_grant' ? 'btn-primary' : 'btn-secondary')}
                  onClick={() => setNotifType('token_grant')}>发放Token</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">发送目标</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className={'btn btn-sm ' + (notifTargetType === 'all' ? 'btn-primary' : 'btn-secondary')}
                  onClick={() => setNotifTargetType('all')}>全部用户</button>
                <button className={'btn btn-sm ' + (notifTargetType === 'single' ? 'btn-primary' : 'btn-secondary')}
                  onClick={() => setNotifTargetType('single')}>指定用户</button>
                <button className={'btn btn-sm ' + (notifTargetType === 'batch' ? 'btn-primary' : 'btn-secondary')}
                  onClick={() => setNotifTargetType('batch')}>批量导入</button>
              </div>
            </div>
            {notifTargetType === 'single' && (
              <div className="form-group">
                <label className="form-label">用户ID / 邮箱 / 用户名</label>
                <input className="input" type="text"
                  placeholder="输入用户ID、邮箱或用户名"
                  value={notifTargetInput}
                  onChange={e => setNotifTargetInput(e.target.value)} />
              </div>
            )}
            {notifTargetType === 'batch' && (
              <div className="form-group">
                <label className="form-label">
                  目标用户列表
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button className={'btn btn-xs ' + (notifBatchFormat === 'list' ? 'btn-primary' : 'btn-secondary')}
                      onClick={() => setNotifBatchFormat('list')}>列表模式</button>
                    <button className={'btn btn-xs ' + (notifBatchFormat === 'json' ? 'btn-primary' : 'btn-secondary')}
                      onClick={() => setNotifBatchFormat('json')}>JSON模式</button>
                  </div>
                </label>
                {notifBatchFormat === 'list' ? (
                  <textarea className="input" rows={4}
                    placeholder={'每行或逗号分隔输入邮箱/用户名\n示例:\nuser1@example.com\nuser2,user3\nuser4'}
                    value={notifTargetInput}
                    onChange={e => setNotifTargetInput(e.target.value)} />
                ) : (
                  <textarea className="input" rows={4}
                    placeholder={'每行一个JSON对象\n示例:\n{"e":"user1@example.com","token":500}\n{"e":"user2","token":1000}'}
                    value={notifTargetInput}
                    onChange={e => setNotifTargetInput(e.target.value)} />
                )}
                <div style={{ fontSize: '0.75rem', color: 'var(--gray-400)', marginTop: '0.25rem' }}>
                  {notifBatchFormat === 'list'
                    ? '支持逗号或换行分隔，所有用户获得相同Token数量'
                    : 'JSON格式：{"e":"邮箱或用户名","token":数量}，每行一个'}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">通知主题</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input className="input" type="text"
                  placeholder="输入通知主题"
                  value={notifSubject}
                  onChange={e => setNotifSubject(e.target.value)}
                  style={{ flex: 1 }} />
                <button type="button" className="btn btn-sm btn-secondary"
                  onClick={handlePolish} disabled={polishing}
                  style={{ whiteSpace: 'nowrap' }}>
                  {polishing ? '润色中...' : 'AI润色'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">通知内容</label>
              <textarea className="input" rows={4}
                placeholder="输入通知内容"
                value={notifBody}
                onChange={e => setNotifBody(e.target.value)} />
            </div>
            {notifType === 'token_grant' && (
              <div className="form-group">
                <label className="form-label">Token 数量</label>
                <input className="input" type="number" min="1"
                  value={notifTokenAmount}
                  onChange={e => setNotifTokenAmount(parseInt(e.target.value) || 1000)} />
              </div>
            )}
            <button className="btn btn-primary"
              onClick={handleSendNotification} disabled={notifSending}
              style={{ width: '100%' }}>
              {notifSending
                ? <><span className="spinner" /> 发送中...</>
                : (notifType === 'token_grant'
                  ? `发送通知并发放 ${notifTokenAmount.toLocaleString()} Token`
                  : '发送通知')}
            </button>
          </div>
        </div>
      </div>

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>编辑用户数据</h3>
              <button className="modal-close" onClick={() => setEditUser(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem',
                marginBottom: '1rem' }}>
                修改用户: {editUser.username}（ID: {editUser.id}）
              </p>

              <div className="form-group">
                <label className="label">邮箱</label>
                <input className="input" type="email"
                  placeholder="新邮箱地址"
                  value={editForm.email}
                  onChange={e => setEditForm({
                    ...editForm, email: e.target.value
                  })} />
              </div>
              <div className="form-group">
                <label className="label">用户名</label>
                <input className="input" type="text"
                  placeholder="新用户名"
                  value={editForm.username}
                  onChange={e => setEditForm({
                    ...editForm, username: e.target.value
                  })} />
              </div>
              <div className="form-group">
                <label className="label">剩余Token</label>
                <input className="input" type="number" min="0"
                  value={editForm.remaining_tokens}
                  onChange={e => setEditForm({
                    ...editForm,
                    remaining_tokens: parseInt(e.target.value) || 0
                  })} />
              </div>
              <div className="form-group">
                <label className="label">最大并发数（1-100）</label>
                <input className="input" type="number" min="1" max="100"
                  value={editForm.max_concurrent}
                  onChange={e => setEditForm({
                    ...editForm,
                    max_concurrent: Math.min(100, Math.max(1,
                      parseInt(e.target.value) || 20))
                  })} />
              </div>
              <div className="form-group">
                <label className="label">优先级</label>
                <select className="input" value={editForm.priority}
                  onChange={e => setEditForm({
                    ...editForm, priority: parseInt(e.target.value) || 2
                  })}>
                  {[0, 1, 2, 3, 4, 5].map(p => (
                    <option key={p} value={p}>
                      {p} - {priorityLabels[p]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary"
                onClick={() => setEditUser(null)}>取消</button>
              <button className="btn btn-primary"
                onClick={handleSaveEdit} disabled={saving}>
                {saving
                  ? <><span className="spinner" /> 保存中...</>
                  : '保存修改'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function IpMonitorTab({ showToast, showConfirm, showLoading, closeToast }: { showToast: any; showConfirm: any; showLoading: any; closeToast: any }) {
  const [tracking, setTracking] = useState<IPTracking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_seen')
  const [sortOrder, setSortOrder] = useState('DESC')
  const [loading, setLoading] = useState(true)
  
  // 批量封禁相关状态
  const [selectedIps, setSelectedIps] = useState<Set<string>>(new Set())
  const [showBatchBanModal, setShowBatchBanModal] = useState(false)
  const [batchBanForm, setBatchBanForm] = useState({
    reason: '',
    ban_type: 'manual' as string,
    ban_method: '403' as '302' | 'timeout' | '403',
    expires_in_minutes: '' as string
  })

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getIpTracking({
        page, per_page: perPage, sort_by: sortBy,
        sort_order: sortOrder, search: search || undefined
      })
      setTracking(res.tracking)
      setTotal(res.total)
      // 清空已选择的 IP（如果不在当前列表中）
      setSelectedIps(new Set())
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [page, sortBy, sortOrder])

  // 复选框处理
  const toggleIpSelection = (ip: string) => {
    const newSelected = new Set(selectedIps)
    if (newSelected.has(ip)) {
      newSelected.delete(ip)
    } else {
      newSelected.add(ip)
    }
    setSelectedIps(newSelected)
  }

  const toggleAllIps = () => {
    if (selectedIps.size === tracking.length) {
      setSelectedIps(new Set())
    } else {
      setSelectedIps(new Set(tracking.map(t => t.ip_address)))
    }
  }

  // 批量封禁处理
  const handleBatchBan = async () => {
    if (selectedIps.size === 0) {
      showToast('请选择至少一个 IP', 'warning')
      return
    }
    if (!batchBanForm.reason.trim()) {
      showToast('请输入封禁原因', 'warning')
      return
    }

    const loadingMsg = showLoading('正在批量封禁中...')
    try {
      const ipList = Array.from(selectedIps)
      let successCount = 0
      let failCount = 0

      for (const ip of ipList) {
        try {
          await adminApi.addIpBan({
            ip_address: ip,
            reason: batchBanForm.reason.trim(),
            ban_type: batchBanForm.ban_type,
            expires_in_minutes: batchBanForm.expires_in_minutes ? parseInt(batchBanForm.expires_in_minutes) : undefined
          })
          successCount++
        } catch (err: any) {
          failCount++
        }
      }

      closeToast(loadingMsg)
      showToast(`批量封禁完成：成功 ${successCount} 个，失败 ${failCount} 个`, successCount > 0 ? 'success' : 'error')
      setShowBatchBanModal(false)
      setSelectedIps(new Set())
      setBatchBanForm({ reason: '', ban_type: 'manual', ban_method: '403', expires_in_minutes: '' })
      loadData()
    } catch (err: any) {
      closeToast(loadingMsg)
      showToast(err.message || '批量封禁失败', 'error')
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadData()
  }

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')
    } else {
      setSortBy(field)
      setSortOrder('DESC')
    }
  }

  const totalPages = Math.ceil(total / perPage)

  if (loading && tracking.length === 0) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  // 获取IP类型显示标签
  const getIpTypeLabel = (type?: string) => {
    const labels: Record<string, { text: string; color: string }> = {
      normal: { text: '普通', color: '#22c55e' },
      proxy: { text: '代理', color: '#f59e0b' },
      vpn: { text: 'VPN', color: '#ef4444' },
      datacenter: { text: '数据中心', color: '#8b5cf6' },
      unknown: { text: '未知', color: '#6b7280' }
    }
    return labels[type || 'unknown'] || labels.unknown
  }

  // 获取VPN风险度颜色
  const getVpnRiskColor = (score?: number) => {
    if (!score || score === 0) return '#22c55e'
    if (score < 30) return '#84cc16'
    if (score < 50) return '#eab308'
    if (score < 70) return '#f59e0b'
    if (score < 90) return '#ef4444'
    return '#dc2626'
  }

  // 获取VPN风险等级文字
  const getVpnRiskLevel = (score?: number) => {
    if (!score || score === 0) return '安全'
    if (score < 30) return '低风险'
    if (score < 50) return '中风险'
    if (score < 70) return '较高风险'
    if (score < 90) return '高风险'
    return '极高风险'
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>IP 请求监控</h3>
          <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            监控所有 API 请求的 IP 来源、IP 类型、VPN 风险度和请求频率
          </p>
        </div>
        {selectedIps.size > 0 && (
          <button className="btn btn-warning btn-sm" onClick={() => setShowBatchBanModal(true)}>
            批量封禁 ({selectedIps.size} 个 IP)
          </button>
        )}
      </div>

      <form onSubmit={handleSearch}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input className="input" type="text"
          placeholder="搜索IP地址..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm">搜索</button>
        {search && (
          <button type="button" className="btn btn-secondary btn-sm"
            onClick={() => { setSearch(''); setPage(1); setTimeout(loadData, 0) }}>清除</button>
        )}
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={tracking.length > 0 && selectedIps.size === tracking.length}
                  onChange={toggleAllIps}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('last_seen')}>
                IP 地址 {sortBy === 'last_seen' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
              </th>
              <th>IP 类型</th>
              <th>VPN 风险度</th>
              <th>地理位置</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('request_count')}>
                请求数 {sortBy === 'request_count' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
              </th>
              <th>端点</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('first_seen')}>
                首次请求 {sortBy === 'first_seen' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
              </th>
              <th>最后请求</th>
            </tr>
          </thead>
          <tbody>
            {tracking.map((t, i) => {
              const ipType = getIpTypeLabel(t.ip_type)
              const vpnColor = getVpnRiskColor(t.vpn_score)
              const vpnLevel = getVpnRiskLevel(t.vpn_score)
              const location = [t.country, t.region, t.city].filter(Boolean).join(' / ') || '-'
              const isSelected = selectedIps.has(t.ip_address)

              return (
                <tr key={t.ip_address + i}>
                  <td style={{ width: '40px', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleIpSelection(t.ip_address)}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {t.ip_address}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: ipType.color + '20',
                      color: ipType.color,
                      border: `1px solid ${ipType.color}40`
                    }}>
                      {ipType.text}
                    </span>
                  </td>
                  <td>
                    {t.vpn_score !== undefined && t.vpn_score > 0 ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{
                          width: '60px',
                          height: '6px',
                          backgroundColor: '#374151',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.min(t.vpn_score, 100)}%`,
                            height: '100%',
                            backgroundColor: vpnColor,
                            borderRadius: '3px'
                          }} />
                        </div>
                        <span style={{
                          fontSize: '0.75rem',
                          color: vpnColor,
                          fontWeight: 600,
                          whiteSpace: 'nowrap'
                        }}>
                          {t.vpn_score} - {vpnLevel}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: '#22c55e' }}>安全</span>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={location}>
                    {location}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    <span className={'tag ' + (
                      (t.total_requests || 0) > 1000 ? 'tag-admin' :
                      (t.total_requests || 0) > 200 ? 'tag-verified' : 'tag-user'
                    )}>
                      {(t.total_requests || 0).toLocaleString()}
                    </span>
                  </td>
                  <td>{t.endpoint_count || 0}</td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.first_seen}</td>
                  <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{t.last_seen}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {tracking.length === 0 && (
        <div className="empty-state" style={{ padding: '2rem' }}>
          暂无IP追踪数据
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-sm btn-secondary"
            disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ color: 'var(--gray-400)', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
            第 {page} / {totalPages} 页 (共 {total} 条)
          </span>
          <button className="btn btn-sm btn-secondary"
                disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}

      {/* 批量封禁模态框 */}
      {showBatchBanModal && (
        <div className="modal-overlay" onClick={() => setShowBatchBanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>批量封禁 IP</h3>
              <button className="modal-close" onClick={() => setShowBatchBanModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                即将封禁 {selectedIps.size} 个 IP 地址
              </p>
              
              <div className="form-group">
                <label className="label">封禁原因</label>
                <textarea className="input" rows={3}
                  placeholder="请描述封禁原因"
                  value={batchBanForm.reason}
                  onChange={e => setBatchBanForm({ ...batchBanForm, reason: e.target.value })} />
              </div>
              
              <div className="form-group">
                <label className="label">封禁类型</label>
                <select className="input" value={batchBanForm.ban_type}
                  onChange={e => setBatchBanForm({ ...batchBanForm, ban_type: e.target.value })}>
                  <option value="manual">手动封禁</option>
                  <option value="auto">自动封禁</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="label">封禁方式</label>
                <select className="input" value={batchBanForm.ban_method}
                  onChange={e => setBatchBanForm({ ...batchBanForm, ban_method: e.target.value as '302' | 'timeout' | '403' })}>
                  <option value="403">返回 403 禁止访问</option>
                  <option value="302">302 重定向</option>
                  <option value="timeout">请求超时</option>
                </select>
              </div>
              
              <div className="form-group">
                <label className="label">
                  封禁时长（分钟）
                  <span style={{ color: 'var(--gray-500)', fontSize: '0.7rem', marginLeft: '0.375rem' }}>
                    (留空为永久封禁)
                  </span>
                </label>
                <input className="input" type="number" min="1"
                  placeholder="留空为永久封禁"
                  value={batchBanForm.expires_in_minutes}
                  onChange={e => setBatchBanForm({ ...batchBanForm, expires_in_minutes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary"
                onClick={() => setShowBatchBanModal(false)}>取消</button>
              <button className="btn btn-warning"
                onClick={handleBatchBan}>确认批量封禁</button>
            </div>
          </div>
        </div>
      )}
        </div>
      )
    }

function IpBansTab({ showToast, showConfirm }: { showToast: any; showConfirm: any }) {
  const [activeSubTab, setActiveSubTab] = useState<'bans' | 'rules'>('bans')
  
  // IP 封禁相关状态
  const [bans, setBans] = useState<IPBan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editBan, setEditBan] = useState<IPBan | null>(null)

  const [banForm, setBanForm] = useState({
    ip_address: '', reason: '', ban_type: 'manual' as string,
    expires_in_minutes: '' as string
  })

  // 自动封禁规则相关状态
  const [rules, setRules] = useState<AutoBanRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(true)
  const [showRuleModal, setShowRuleModal] = useState(false)
  const [editingRule, setEditingRule] = useState<AutoBanRule | null>(null)
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    trigger_honeypot: false,
    trigger_fake_report: false,
    user_agent_regex: '',
    vpn_score_threshold: 70,
    ban_method: '403' as '302' | 'timeout' | '403',
    ban_duration_minutes: 60,
    ban_reason: ''
  })

  const loadData = async (searchTerm?: string) => {
    setLoading(true)
    try {
      const res = await adminApi.getIpBans(searchTerm)
      setBans(res.bans)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  // 加载自动封禁规则
  const loadRules = async () => {
    setRulesLoading(true)
    try {
      const res = await adminApi.getAutoBanRules()
      setRules(res.rules)
    } catch (err: any) {
      showToast(err.message || '加载规则失败', 'error')
    } finally {
      setRulesLoading(false)
    }
  }

  useEffect(() => { 
    loadData()
    if (activeSubTab === 'rules') {
      loadRules()
    }
  }, [activeSubTab])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadData(search)
  }

  // 添加/更新规则
  const handleSaveRule = async () => {
    if (!ruleForm.name.trim()) {
      showToast('请输入规则名称', 'warning')
      return
    }
    if (!ruleForm.ban_reason.trim()) {
      showToast('请输入封禁原因', 'warning')
      return
    }

    try {
      const data = {
        name: ruleForm.name.trim(),
        description: ruleForm.description.trim() || undefined,
        trigger_honeypot: ruleForm.trigger_honeypot,
        trigger_fake_report: ruleForm.trigger_fake_report,
        user_agent_regex: ruleForm.user_agent_regex || undefined,
        vpn_score_threshold: ruleForm.vpn_score_threshold,
        ban_method: ruleForm.ban_method,
        ban_duration_minutes: ruleForm.ban_duration_minutes,
        ban_reason: ruleForm.ban_reason.trim()
      }

      if (editingRule) {
        await adminApi.updateAutoBanRule(editingRule.id, data)
        showToast('规则已更新', 'success')
      } else {
        await adminApi.addAutoBanRule(data)
        showToast('规则已添加', 'success')
      }
      setShowRuleModal(false)
      setEditingRule(null)
      setRuleForm({
        name: '',
        description: '',
        trigger_honeypot: false,
        trigger_fake_report: false,
        user_agent_regex: '',
        vpn_score_threshold: 70,
        ban_method: '403',
        ban_duration_minutes: 60,
        ban_reason: ''
      })
      loadRules()
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  // 打开规则编辑
  const openRuleEdit = (rule: AutoBanRule) => {
    setEditingRule(rule)
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      trigger_honeypot: !!rule.trigger_honeypot,
      trigger_fake_report: !!rule.trigger_fake_report,
      user_agent_regex: rule.user_agent_regex || '',
      vpn_score_threshold: rule.vpn_score_threshold ?? 70,
      ban_method: rule.ban_method ?? '403',
      ban_duration_minutes: rule.ban_duration_minutes ?? 60,
      ban_reason: rule.ban_reason || ''
    })
    setShowRuleModal(true)
  }

  // 删除规则
  const handleDeleteRule = async (ruleId: number) => {
    showConfirm('确定要删除此自动封禁规则吗？', async () => {
      try {
        await adminApi.deleteAutoBanRule(ruleId)
        showToast('规则已删除', 'success')
        loadRules()
      } catch (err: any) {
        showToast(err.message || '删除失败', 'error')
      }
    })
  }

  // 切换规则状态
  const handleToggleRule = async (ruleId: number) => {
    try {
      await adminApi.toggleAutoBanRule(ruleId)
      showToast('规则状态已更新', 'success')
      loadRules()
    } catch (err: any) {
      showToast(err.message || '操作失败', 'error')
    }
  }

  const handleAddBan = async () => {
    if (!banForm.ip_address.trim()) {
      showToast('请输入IP地址', 'warning')
      return
    }
    if (!banForm.reason.trim()) {
      showToast('请输入封禁原因', 'warning')
      return
    }
    try {
      const res = await adminApi.addIpBan({
        ip_address: banForm.ip_address.trim(),
        reason: banForm.reason.trim(),
        ban_type: banForm.ban_type,
        expires_in_minutes: banForm.expires_in_minutes ? parseInt(banForm.expires_in_minutes) : undefined
      })
      setBans(prev => [res.ban, ...prev])
      showToast('IP已封禁', 'success')
      setShowAddModal(false)
      setBanForm({ ip_address: '', reason: '', ban_type: 'manual', expires_in_minutes: '' })
    } catch (err: any) {
      showToast(err.message || '封禁失败', 'error')
    }
  }

  const handleUnban = (ban: IPBan) => {
    const isActiveBan = isActive(ban)
    const confirmMsg = isActiveBan 
      ? `确定要解封 IP ${ban.ip_address} 吗？` 
      : `确定要删除 IP ${ban.ip_address} 的记录吗？`
    showConfirm(confirmMsg, async () => {
      try {
        await adminApi.deleteIpBan(ban.id)
        setBans(prev => prev.filter(b => b.id !== ban.id))
        showToast(isActiveBan ? 'IP 已解封' : 'IP 记录已删除', 'success')
      } catch (err: any) {
        showToast(err.message || (isActiveBan ? '解封失败' : '删除失败'), 'error')
      }
    })
  }

  const getBanTypeLabel = (type: string) => {
    const labels: Record<string, string> = { auto: '自动', manual: '手动' }
    return labels[type] || type
  }

  const isExpired = (ban: IPBan) => {
    if (!ban.expires_at) return false
    return new Date(ban.expires_at) < new Date()
  }

  const isActive = (ban: IPBan) => ban.is_active && !isExpired(ban)

  if (loading && bans.length === 0) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ margin: 0 }}>IP 封禁管理</h3>
          <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            管理被封禁的 IP 地址，支持自动封禁和手动封禁
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-warning btn-sm"
            onClick={async () => {
              showConfirm('确定要清理过期的封禁记录吗？此操作不可恢复。', async () => {
                try {
                  const res = await adminApi.cleanExpiredIpBans()
                  showToast(res.message || '清理完成', 'success')
                  loadData()
                } catch (err: any) {
                  showToast(err.message || '清理失败', 'error')
                }
              })
            }}>清理过期记录</button>
          <button className="btn btn-primary btn-sm"
            onClick={() => setShowAddModal(true)}>添加封禁</button>
        </div>
      </div>

      <form onSubmit={handleSearch}
        style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input className="input" type="text"
          placeholder="搜索IP地址..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm">搜索</button>
        {search && (
          <button type="button" className="btn btn-secondary btn-sm"
            onClick={() => { setSearch(''); loadData() }}>清除</button>
        )}
      </form>

      <div className="table-wrap">
        <table style={{ minWidth: 750 }}>
          <colgroup>
            <col style={{ width: '20%' }} />
            <col style={{ width: '30%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '12%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>IP地址</th>
              <th>原因</th>
              <th>类型</th>
              <th>状态</th>
              <th>封禁时间</th>
              <th>解封时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {bans.map(ban => (
              <tr key={ban.id}>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{ban.ip_address}</td>
                <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ban.reason}>{ban.reason}</td>
                <td>
                  <span className={'tag ' + (ban.ban_type === 'auto' ? 'tag-warning' : 'tag-admin')}>
                    {getBanTypeLabel(ban.ban_type)}
                  </span>
                </td>
                <td>
                  <span className={'tag ' + (isActive(ban) ? 'tag-disabled' : 'tag-active')}>
                    {isActive(ban) ? '已封禁' : (ban.is_active ? '已过期' : '已解封')}
                  </span>
                </td>
                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{ban.created_at}</td>
                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{ban.expires_at || '永久'}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '0.25rem' }}>
                    {isActive(ban) ? (
                      <button className="btn btn-sm btn-success"
                        onClick={() => handleUnban(ban)}>解封</button>
                    ) : (
                      <button className="btn btn-sm btn-danger"
                        onClick={() => handleUnban(ban)}>删除</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {bans.length === 0 && (
        <div className="empty-state" style={{ padding: '2rem' }}>
          暂无封禁记录
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>添加 IP 封禁</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">IP 地址</label>
                <input className="input" type="text"
                  placeholder="如 192.168.1.1"
                  value={banForm.ip_address}
                  onChange={e => setBanForm({ ...banForm, ip_address: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">封禁原因</label>
                <textarea className="input" rows={3}
                  placeholder="请描述封禁原因"
                  value={banForm.reason}
                  onChange={e => setBanForm({ ...banForm, reason: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="label">封禁类型</label>
                <select className="input" value={banForm.ban_type}
                  onChange={e => setBanForm({ ...banForm, ban_type: e.target.value })}>
                  <option value="manual">手动封禁</option>
                  <option value="auto">自动封禁</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">
                  封禁时长（分钟）
                  <span style={{ color: 'var(--gray-500)', fontSize: '0.7rem', marginLeft: '0.375rem' }}>
                    (留空为永久封禁)
                  </span>
                </label>
                <input className="input" type="number" min="1"
                  placeholder="留空为永久封禁"
                  value={banForm.expires_in_minutes}
                  onChange={e => setBanForm({ ...banForm, expires_in_minutes: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary"
                onClick={() => setShowAddModal(false)}>取消</button>
              <button className="btn btn-primary"
                onClick={handleAddBan}>确认封禁</button>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'rules' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0 }}>自动封禁规则</h3>
              <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                配置自动触发 IP 封禁的规则
              </p>
            </div>
            <button className="btn btn-primary btn-sm"
              onClick={() => {
                setEditingRule(null)
                setRuleForm({
                  name: '',
                  description: '',
                  trigger_honeypot: false,
                  trigger_fake_report: false,
                  user_agent_regex: '',
                  vpn_score_threshold: 70,
                  ban_method: '403',
                  ban_duration_minutes: 60,
                  ban_reason: ''
                })
                setShowRuleModal(true)
              }}>添加规则</button>
          </div>

          {rulesLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
              <span className="spinner" /> 加载中...
            </div>
          ) : rules.length === 0 ? (
            <div className="empty-state" style={{ padding: '2rem' }}>
              暂无自动封禁规则
            </div>
          ) : (
            <div className="table-wrap">
              <table style={{ minWidth: 900 }}>
                <colgroup>
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '15%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '15%' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>描述</th>
                    <th>状态</th>
                    <th>触发条件</th>
                    <th>封禁方式</th>
                    <th>封禁时长</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id}>
                      <td style={{ fontWeight: 600 }}>{rule.name}</td>
                      <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.85rem' }} title={rule.description || '-'}>
                        {rule.description || '-'}
                      </td>
                      <td>
                        <span className={'tag ' + (rule.is_active ? 'tag-active' : 'tag-disabled')}>
                          {rule.is_active ? '已启用' : '已禁用'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          {rule.trigger_honeypot && (
                            <span className="tag tag-warning" style={{ fontSize: '0.7rem' }}>蜜罐触发</span>
                          )}
                          {rule.trigger_fake_report && (
                            <span className="tag tag-warning" style={{ fontSize: '0.7rem' }}>虚假报告</span>
                          )}
                          {rule.user_agent_regex && (
                            <span className="tag tag-admin" style={{ fontSize: '0.7rem' }}>UA 匹配</span>
                          )}
                          {(rule.vpn_score_threshold ?? 0) > 0 && (
                            <span className="tag" style={{ fontSize: '0.7rem', background: '#8b5cf620', color: '#8b5cf6', border: '1px solid #8b5cf640' }}>
                              VPN≥{rule.vpn_score_threshold ?? 0}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className="tag tag-admin" style={{ fontSize: '0.75rem' }}>
                          {rule.ban_method === '403' ? '403 禁止' : rule.ban_method === '302' ? '302 重定向' : '请求超时'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {rule.ban_duration_minutes} 分钟
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className={'btn btn-sm ' + (rule.is_active ? 'btn-warning' : 'btn-success')}
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                            onClick={() => handleToggleRule(rule.id)}>
                            {rule.is_active ? '禁用' : '启用'}
                          </button>
                          <button className="btn btn-sm btn-primary"
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                            onClick={() => openRuleEdit(rule)}>
                            编辑
                          </button>
                          <button className="btn btn-sm btn-danger"
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.3rem' }}
                            onClick={() => handleDeleteRule(rule.id)}>
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 规则编辑模态框 */}
          {showRuleModal && (
            <div className="modal-overlay" onClick={() => setShowRuleModal(false)}>
              <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>{editingRule ? '编辑规则' : '添加规则'}</h3>
                  <button className="modal-close" onClick={() => setShowRuleModal(false)}>✕</button>
                </div>
                <div className="modal-body">
                  <div className="form-group">
                    <label className="label">规则名称</label>
                    <input className="input" type="text"
                      placeholder="如：高 VPN 风险自动封禁"
                      value={ruleForm.name}
                      onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="label">规则描述</label>
                    <textarea className="input" rows={2}
                      placeholder="描述此规则的用途（可选）"
                      value={ruleForm.description}
                      onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="label">触发条件</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox"
                          checked={ruleForm.trigger_honeypot}
                          onChange={e => setRuleForm({ ...ruleForm, trigger_honeypot: e.target.checked })} />
                        <span>触发蜜罐时</span>
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input type="checkbox"
                          checked={ruleForm.trigger_fake_report}
                          onChange={e => setRuleForm({ ...ruleForm, trigger_fake_report: e.target.checked })} />
                        <span>触发虚假报告时</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox"
                          checked={!!ruleForm.user_agent_regex}
                          onChange={e => setRuleForm({ 
                            ...ruleForm, 
                            user_agent_regex: e.target.checked ? '.*' : '' 
                          })} />
                        <span>User-Agent 匹配</span>
                      </div>
                      {ruleForm.user_agent_regex && (
                        <input className="input" type="text"
                          placeholder="正则表达式，如：.*bot.*"
                          value={ruleForm.user_agent_regex}
                          onChange={e => setRuleForm({ ...ruleForm, user_agent_regex: e.target.value })} />
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input type="checkbox"
                          checked={ruleForm.vpn_score_threshold > 0}
                          onChange={e => setRuleForm({ 
                            ...ruleForm, 
                            vpn_score_threshold: e.target.checked ? 70 : 0 
                          })} />
                        <span>VPN 风险度阈值</span>
                      </div>
                      {ruleForm.vpn_score_threshold > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1.5rem' }}>
                          <input type="range" min="0" max="100"
                            value={ruleForm.vpn_score_threshold}
                            onChange={e => setRuleForm({ ...ruleForm, vpn_score_threshold: parseInt(e.target.value) })}
                            style={{ flex: 1 }} />
                          <span style={{ width: '40px', textAlign: 'center' }}>{ruleForm.vpn_score_threshold}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="label">封禁方式</label>
                    <select className="input" value={ruleForm.ban_method}
                      onChange={e => setRuleForm({ ...ruleForm, ban_method: e.target.value as '302' | 'timeout' | '403' })}>
                      <option value="403">返回 403 禁止访问</option>
                      <option value="302">302 重定向</option>
                      <option value="timeout">请求超时</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="label">封禁时长（分钟）</label>
                    <input className="input" type="number" min="1" max="10080"
                      value={ruleForm.ban_duration_minutes}
                      onChange={e => setRuleForm({ ...ruleForm, ban_duration_minutes: parseInt(e.target.value) || 60 })} />
                  </div>
                  <div className="form-group">
                    <label className="label">封禁原因</label>
                    <textarea className="input" rows={2}
                      placeholder="说明封禁原因"
                      value={ruleForm.ban_reason}
                      onChange={e => setRuleForm({ ...ruleForm, ban_reason: e.target.value })} />
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn btn-secondary"
                    onClick={() => setShowRuleModal(false)}>取消</button>
                  <button className="btn btn-primary"
                    onClick={handleSaveRule}>
                    {editingRule ? '保存修改' : '添加规则'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SecurityConfigTab({ showToast }: { showToast: any }) {
  const [config, setConfig] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // 本地编辑状态
  const [vpnThreshold, setVpnThreshold] = useState('70')
  const [proxyAutoBan, setProxyAutoBan] = useState(true)
  const [datacenterAutoBan, setDatacenterAutoBan] = useState(false)
  const [banDuration, setBanDuration] = useState('60')
  const [suspiciousThreshold, setSuspiciousThreshold] = useState('100')

  const loadConfig = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getSecurityConfig()
      setConfig(res.config)
      // 同步到本地状态
      setVpnThreshold(res.config.vpn_auto_ban_threshold || '70')
      setProxyAutoBan(res.config.proxy_auto_ban === 'true')
      setDatacenterAutoBan(res.config.datacenter_auto_ban === 'true')
      setBanDuration(res.config.auto_ban_duration_minutes || '60')
      setSuspiciousThreshold(res.config.suspicious_request_threshold || '100')
    } catch (err: any) {
      showToast(err.message || '加载配置失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadConfig() }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = {
        vpn_auto_ban_threshold: vpnThreshold,
        proxy_auto_ban: String(proxyAutoBan),
        datacenter_auto_ban: String(datacenterAutoBan),
        auto_ban_duration_minutes: banDuration,
        suspicious_request_threshold: suspiciousThreshold
      }
      await adminApi.updateSecurityConfig(data)
      showToast('安全配置已保存', 'success')
      loadConfig()
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>安全配置</h3>
      <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginBottom: '1.5rem' }}>
        配置IP自动封禁阈值和安全策略
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* VPN风险度自动封禁 */}
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--gray-200)' }}>
            VPN风险度自动封禁
          </h4>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--gray-400)' }}>
              VPN评分阈值 (0-100)
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="range"
                min="0"
                max="100"
                value={vpnThreshold}
                onChange={e => setVpnThreshold(e.target.value)}
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min="0"
                max="100"
                value={vpnThreshold}
                onChange={e => setVpnThreshold(e.target.value)}
                style={{ width: '80px' }}
                className="input"
              />
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
              VPN评分超过此值的IP将被自动封禁。当前设置: {vpnThreshold} 分
            </p>
          </div>
        </div>

        {/* IP类型自动封禁 */}
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--gray-200)' }}>
            IP类型自动封禁
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={proxyAutoBan}
                onChange={e => setProxyAutoBan(e.target.checked)}
              />
              <span>自动封禁代理IP</span>
              <span style={{ 
                fontSize: '0.75rem', 
                color: proxyAutoBan ? '#ef4444' : '#6b7280',
                marginLeft: 'auto'
              }}>
                {proxyAutoBan ? '已启用' : '已禁用'}
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={datacenterAutoBan}
                onChange={e => setDatacenterAutoBan(e.target.checked)}
              />
              <span>自动封禁数据中心IP</span>
              <span style={{ 
                fontSize: '0.75rem', 
                color: datacenterAutoBan ? '#ef4444' : '#6b7280',
                marginLeft: 'auto'
              }}>
                {datacenterAutoBan ? '已启用' : '已禁用'}
              </span>
            </label>
          </div>
        </div>

        {/* 封禁时长 */}
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--gray-200)' }}>
            自动封禁时长
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input
              type="number"
              min="1"
              max="10080"
              value={banDuration}
              onChange={e => setBanDuration(e.target.value)}
              className="input"
              style={{ width: '120px' }}
            />
            <span style={{ color: 'var(--gray-400)' }}>分钟</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
            自动封禁的持续时间，范围 1-10080 分钟（1分钟-7天）
          </p>
        </div>

        {/* 可疑请求阈值 */}
        <div style={{ 
          padding: '1rem', 
          background: 'rgba(0,0,0,0.2)', 
          borderRadius: '0.5rem',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h4 style={{ marginBottom: '1rem', color: 'var(--gray-200)' }}>
            可疑请求阈值
          </h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input
              type="number"
              min="10"
              max="10000"
              value={suspiciousThreshold}
              onChange={e => setSuspiciousThreshold(e.target.value)}
              className="input"
              style={{ width: '120px' }}
            />
            <span style={{ color: 'var(--gray-400)' }}>请求/小时</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginTop: '0.5rem' }}>
            单IP每小时请求数超过此值将被标记为可疑
          </p>
        </div>

        {/* 保存按钮 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button
            className="btn btn-secondary"
            onClick={loadConfig}
            disabled={saving}
          >
            重置
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AuditLogTab({ showToast }: { showToast: any }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getAuditLog(page, perPage)
      setLogs(res.logs)
      setTotal(res.total)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [page])

  const totalPages = Math.ceil(total / perPage)

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      toggle_user_status: '切换用户状态',
      delete_user: '删除用户',
      update_user_full: '更新用户',
      update_token_config: '更新Token配置',
      send_notification: '发送通知',
      add_ip_ban: '封禁IP',
      update_ip_ban: '更新IP封禁',
      remove_ip_ban: '解封IP'
    }
    return labels[action] || action
  }

  if (loading && logs.length === 0) {
    return <div className="loading-screen"><div className="spinner" /></div>
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>管理操作审计日志</h3>
      <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginBottom: '1rem' }}>
        记录所有管理员的重要操作，用于安全审计和追溯
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>管理员</th>
              <th>操作</th>
              <th>目标类型</th>
              <th>目标ID</th>
              <th>详情</th>
              <th>IP地址</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id}>
                <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{log.created_at}</td>
                <td>{log.admin_name}</td>
                <td>
                  <span className="tag tag-admin" style={{ fontSize: '0.75rem' }}>
                    {getActionLabel(log.action)}
                  </span>
                </td>
                <td style={{ fontSize: '0.8rem' }}>{log.target_type || '-'}</td>
                <td style={{ fontSize: '0.8rem' }}>{log.target_id ?? '-'}</td>
                <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.8rem' }}
                  title={log.details || ''}>
                  {log.details || '-'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{log.ip_address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {logs.length === 0 && (
        <div className="empty-state" style={{ padding: '2rem' }}>
          暂无审计日志
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
          <button className="btn btn-sm btn-secondary"
            disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ color: 'var(--gray-400)', padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}>
            第 {page} / {totalPages} 页 (共 {total} 条)
          </span>
          <button className="btn btn-sm btn-secondary"
            disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}
    </div>
  )
}
function BadgesManagementTab({ showToast }: { showToast: any }) {
  const [badges, setBadges] = useState<any[]>([])
  const [stats, setStats] = useState({
    total: 0,
    total_normal: 0,
    total_hacker: 0,
    max_normal: 10,
    max_hacker: 20
  })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'normal_easy' | 'normal_hard' | 'hacker'>('all')

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/badges', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('api_key')}`
        }
      })
      const data = await res.json()
      setBadges(data.badges || [])
      setStats({
        total: data.total || 0,
        total_normal: data.total_normal || 0,
        total_hacker: data.total_hacker || 0,
        max_normal: data.max_normal || 10,
        max_hacker: data.max_hacker || 20
      })
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const filteredBadges = filter === 'all' 
    ? badges 
    : badges.filter(b => b.type === filter)

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      normal_easy: '简单普通',
      normal_hard: '困难普通',
      hacker: '黑客'
    }
    return labels[type] || type
  }

  const getBadgeStyle = (type: string) => {
    if (type === 'normal_easy') {
      return {
        background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.15))',
        border: '1px solid rgba(59,130,246,0.3)',
        color: '#60a5fa'
      }
    }
    if (type === 'normal_hard') {
      return {
        background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(147,51,234,0.15))',
        border: '1px solid rgba(168,85,247,0.3)',
        color: '#c084fc'
      }
    }
    if (type === 'hacker') {
      return {
        background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.15))',
        border: '1px solid rgba(239,68,68,0.3)',
        color: '#f87171'
      }
    }
    return {}
  }

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>称号系统总览</h3>
        <p style={{ color: 'var(--gray-400)', fontSize: '0.85rem' }}>
          当前用户已获得 {stats.total} 个称号，普通称号 {stats.total_normal}/{stats.max_normal}，黑客称号 {stats.total_hacker}/{stats.max_hacker}
        </p>
      </div>

      <div className="grid-4 stagger-group" style={{ marginBottom: '1.5rem' }}>
        <div className="card stat-card stagger-item">
          <div className="stat-label">总称号数</div>
          <div className="stat-value" style={{ color: 'var(--primary-500)' }}>
            {stats.total}
          </div>
        </div>
        <div className="card stat-card stagger-item">
          <div className="stat-label">简单普通称号</div>
          <div className="stat-value" style={{ color: '#60a5fa', fontSize: '1.1rem' }}>
            {badges.filter(b => b.type === 'normal_easy').length}
          </div>
        </div>
        <div className="card stat-card stagger-item">
          <div className="stat-label">困难普通称号</div>
          <div className="stat-value" style={{ color: '#c084fc', fontSize: '1.1rem' }}>
            {badges.filter(b => b.type === 'normal_hard').length}
          </div>
        </div>
        <div className="card stat-card stagger-item">
          <div className="stat-label">黑客称号</div>
          <div className="stat-value" style={{ color: '#f87171', fontSize: '1.1rem' }}>
            {badges.filter(b => b.type === 'hacker').length}
          </div>
        </div>
      </div>

      <div className="card stagger-item">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h4 style={{ margin: 0 }}>称号详情</h4>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('all')}
            >
              全部
            </button>
            <button
              className={`btn btn-sm ${filter === 'normal_easy' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('normal_easy')}
              style={{ borderColor: '#60a5fa' }}
            >
              简单普通
            </button>
            <button
              className={`btn btn-sm ${filter === 'normal_hard' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('normal_hard')}
              style={{ borderColor: '#c084fc' }}
            >
              困难普通
            </button>
            <button
              className={`btn btn-sm ${filter === 'hacker' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilter('hacker')}
              style={{ borderColor: '#f87171' }}
            >
              黑客
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--gray-400)' }}>
            <span className="spinner" /> 加载中...
          </div>
        ) : filteredBadges.length === 0 ? (
          <div className="empty-state" style={{ padding: '2rem' }}>
            暂无称号
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '0.75rem'
          }}>
            {filteredBadges.map(badge => {
              const style = getBadgeStyle(badge.type)
              return (
                <div
                  key={badge.id}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    background: style.background,
                    border: style.border,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    transition: 'all 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)'
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <span style={{ fontSize: '1.75rem' }}>{badge.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      color: style.color, 
                      fontWeight: 600, 
                      fontSize: '0.95rem',
                      marginBottom: '0.25rem'
                    }}>
                      {badge.name}
                    </div>
                    <div style={{ 
                      fontSize: '0.8rem', 
                      color: 'rgba(255,255,255,0.7)',
                      marginBottom: '0.375rem'
                    }}>
                      {badge.desc}
                    </div>
                    <div style={{ 
                      fontSize: '0.7rem', 
                      color: 'rgba(255,255,255,0.5)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>类型：{getTypeLabel(badge.type)}</span>
                      {badge.unlocked_at && (
                        <span>获得：{badge.unlocked_at.replace('T', ' ').slice(0, 16)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
