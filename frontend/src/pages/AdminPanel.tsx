import { useState, useEffect, useRef } from 'react'
import { adminApi, aiApi } from '../services/api'
import { useToast } from '../components/Toast'
import type { AdminUser, TokenConfig, UsageStats, IPBan, IPTracking, AuditLogEntry } from '../types/api'

type AdminTab = 'users' | 'ip_monitor' | 'ip_bans' | 'audit_log' | 'batch'

const priorityLabels: Record<number, string> = {
  0: '最高', 1: '高', 2: '中', 3: '较低', 4: '低', 5: '最低'
}

const TAB_NAMES: Record<AdminTab, string> = {
  users: '用户管理',
  ip_monitor: 'IP监控',
  ip_bans: 'IP封禁',
  audit_log: '审计日志',
  batch: '批处理管理'
}

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('users')
  const { showToast, showConfirm } = useToast()

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
      {activeTab === 'ip_monitor' && <IpMonitorTab showToast={showToast} />}
      {activeTab === 'ip_bans' && <IpBansTab showToast={showToast} showConfirm={showConfirm} />}
      {activeTab === 'audit_log' && <AuditLogTab showToast={showToast} />}
      {activeTab === 'batch' && <BatchManagementTab showToast={showToast} />}
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
              {(stats.total_users - 1) - stats.verified_users}
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

function IpMonitorTab({ showToast }: { showToast: any }) {
  const [tracking, setTracking] = useState<IPTracking[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('last_seen')
  const [sortOrder, setSortOrder] = useState('DESC')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const res = await adminApi.getIpTracking({
        page, per_page: perPage, sort_by: sortBy,
        sort_order: sortOrder, search: search || undefined
      })
      setTracking(res.tracking)
      setTotal(res.total)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [page, sortBy, sortOrder])

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

  return (
    <div className="card">
      <h3 style={{ marginBottom: '1rem' }}>IP请求监控</h3>
      <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginBottom: '1rem' }}>
        监控所有API请求的IP来源、请求频率和User-Agent信息
      </p>

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
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('last_seen')}>
                IP地址 {sortBy === 'last_seen' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('request_count')}>
                请求总数 {sortBy === 'request_count' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
              </th>
              <th>端点数量</th>
              <th>User-Agent</th>
              <th style={{ cursor: 'pointer' }} onClick={() => toggleSort('first_seen')}>
                首次请求 {sortBy === 'first_seen' ? (sortOrder === 'DESC' ? '↓' : '↑') : ''}
              </th>
              <th>最后请求</th>
            </tr>
          </thead>
          <tbody>
            {tracking.map((t, i) => {
              const uaPreview = t.user_agents ? t.user_agents.slice(0, 60) : '-'
              return (
                <tr key={t.ip_address + i}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {t.ip_address}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    <span className={'tag ' + (
                      t.total_requests > 1000 ? 'tag-admin' :
                      t.total_requests > 200 ? 'tag-verified' : 'tag-user'
                    )}>
                      {t.total_requests.toLocaleString()}
                    </span>
                  </td>
                  <td>{t.endpoint_count}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.75rem' }}
                    title={t.user_agents || ''}>
                    {uaPreview}
                  </td>
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
        </div>
      )
    }

function BatchManagementTab({ showToast }: { showToast: any }) {
  const [batches, setBatches] = useState<any[]>([])
  const [files, setFiles] = useState<any[]>([])
  const [activeSubTab, setActiveSubTab] = useState<'files' | 'batches'>('batches')
  const [loading, setLoading] = useState(false)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [batchDetail, setBatchDetail] = useState<any>(null)
  const [batchDetailLoading, setBatchDetailLoading] = useState(false)
  const [batchResults, setBatchResults] = useState<any>(null)
  const [batchResultsLoading, setBatchResultsLoading] = useState(false)
  const [sseConnected, setSseConnected] = useState(false)
  const sseRef = useRef<EventSource | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (activeSubTab === 'batches') {
      loadBatches()
    } else {
      loadFiles()
    }
  }, [activeSubTab])

  useEffect(() => {
    const apiKey = localStorage.getItem('api_key')
    if (!apiKey) return

    let reconnectAttempt = 0

    const connectSSE = () => {
      if (sseRef.current) sseRef.current.close()
      const evtSource = new EventSource(`/v1/batch/events?token=${apiKey}`)
      sseRef.current = evtSource

      evtSource.addEventListener('batches_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          setBatches(data?.data || [])
        } catch {}
      })

      evtSource.addEventListener('files_updated', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data)
          setFiles(data?.data || [])
        } catch {}
      })

      evtSource.onopen = () => {
        setSseConnected(true)
        reconnectAttempt = 0
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
        }
      }

      evtSource.onerror = () => {
        setSseConnected(false)
        evtSource.close()
        reconnectAttempt++
        const delay = Math.min(1000 * reconnectAttempt, 10000)
        reconnectTimerRef.current = setTimeout(connectSSE, delay)
        if (!pollRef.current) {
          pollRef.current = setInterval(() => {
            if (activeSubTab === 'batches') loadBatches()
            else loadFiles()
          }, 5000)
        }
      }
    }

    connectSSE()

    return () => {
      if (sseRef.current) sseRef.current.close()
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      if (pollRef.current) clearInterval(pollRef.current)
      sseRef.current = null
      pollRef.current = null
      reconnectTimerRef.current = null
    }
  }, [])

  const loadBatches = async () => {
    setLoading(true)
    try {
      const res = await aiApi.listBatches()
      setBatches(res?.data || [])
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadFiles = async () => {
    setLoading(true)
    try {
      const res = await aiApi.listFiles()
      setFiles(res?.data || [])
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleQueryBatch = async () => {
    if (!selectedBatchId.trim()) return
    setBatchDetailLoading(true)
    setBatchDetail(null)
    try {
      const res = await aiApi.getBatchStatus(selectedBatchId.trim())
      setBatchDetail(res)
    } catch (err: any) {
      showToast(err.message || '查询失败', 'error')
    } finally {
      setBatchDetailLoading(false)
    }
  }

  const handleCancelBatch = async (batchId: string) => {
    try {
      const res = await aiApi.cancelBatch(batchId)
      showToast(res?.status || '已取消', 'success')
      loadBatches()
    } catch (err: any) {
      showToast(err.message || '取消失败', 'error')
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      const res = await aiApi.deleteFile(fileId)
      showToast(res?.deleted ? '已删除' : '删除失败', res?.deleted ? 'success' : 'error')
      loadFiles()
    } catch (err: any) {
      showToast(err.message || '删除失败', 'error')
    }
  }

  const loadResults = async (batchId: string) => {
    setBatchResultsLoading(true)
    setBatchResults(null)
    try {
      const res = await aiApi.getBatchResults(batchId)
      setBatchResults(res)
    } catch (err: any) {
      showToast(err.message || '加载失败', 'error')
    } finally {
      setBatchResultsLoading(false)
    }
  }

  const renderQAPairs = (requests: any[], responses: any[]) => {
    if (!requests || requests.length === 0) {
      return <div style={{ color: 'var(--gray-500)', padding: '0.5rem 0' }}>无请求数据</div>
    }
    const paired: { user_message: string; answer: string }[] = []
    const respByCustomId: Record<string, string> = {}
    for (const r of responses) {
      if (r.custom_id) respByCustomId[r.custom_id] = r.answer || ''
    }
    for (const req of requests) {
      const answer = req.custom_id ? (respByCustomId[req.custom_id] || '') : ''
      paired.push({ user_message: req.user_message || '', answer })
    }
    if (paired.length === 1 && !paired[0].user_message && !paired[0].answer) {
      return <div style={{ color: 'var(--gray-500)', padding: '0.5rem 0' }}>无问答数据</div>
    }
    return (
      <div style={{ fontSize: '0.75rem' }}>
        {paired.map((p, i) => (
          <div key={i} style={{
            marginBottom: '0.75rem', padding: '0.5rem',
            border: '1px solid var(--border)',
            borderRadius: '6px', background: 'var(--surface-1)'
          }}>
            <div style={{ marginBottom: '0.3rem' }}>
              <span style={{ color: 'var(--info)', fontWeight: 600 }}>Q{i + 1}: </span>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {p.user_message || <span style={{ color: 'var(--gray-500)' }}>（空）</span>}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--success)', fontWeight: 600 }}>A{i + 1}: </span>
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {p.answer || <span style={{ color: 'var(--gray-500)' }}>（无回答）</span>}
              </span>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const formatTime = (ts: number | null | undefined) => {
    if (!ts) return '-'
    return new Date(ts * 1000).toLocaleString('zh-CN')
  }

  const statusTag = (status: string) => {
    const colorMap: Record<string, string> = {
      completed: 'var(--success)',
      failed: 'var(--error)',
      in_progress: 'var(--primary-500)',
      queuing: 'var(--warning)',
      finalizing: 'var(--info)',
      expired: 'var(--gray-500)',
      canceled: 'var(--danger)'
    }
    return (
      <span style={{
        color: colorMap[status] || 'var(--gray-400)',
        fontWeight: 600, fontSize: '0.75rem'
      }}>
        {status}
      </span>
    )
  }

  const purposeTag = (purpose: string) => {
    const labelMap: Record<string, string> = {
      batch: '输入文件',
      'batch_processor:success': '结果文件(成功)',
      'batch_processor:failed': '结果文件(失败)',
    }
    const colorMap: Record<string, string> = {
      batch: 'var(--info)',
      'batch_processor:success': 'var(--success)',
      'batch_processor:failed': 'var(--error)',
    }
    const label = labelMap[purpose] || purpose
    const color = colorMap[purpose] || 'var(--gray-400)'
    return (
      <span style={{ color, fontSize: '0.75rem' }}>
        {label}
      </span>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center' }}>
        <button className={`btn btn-sm ${activeSubTab === 'batches' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('batches')}>
          Xfyun 批次列表
        </button>
        <button className={`btn btn-sm ${activeSubTab === 'files' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveSubTab('files')}>
          Xfyun 文件列表
        </button>
        <span style={{
          fontSize: '0.6rem', padding: '0.1rem 0.3rem', borderRadius: 3,
          color: sseConnected ? '#22c55e' : '#6b7280',
          border: `1px solid ${sseConnected ? '#22c55e' : '#6b7280'}`,
          marginLeft: 'auto'
        }}>
          {sseConnected ? '实时' : '轮询'}
        </span>
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '2rem', color: 'var(--gray-400)' }}>
          <span className="spinner" /> 加载中...
        </div>
      ) : activeSubTab === 'batches' ? (
        <>
          <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input className="input" type="text" placeholder="输入 batch_id 查询状态 (batch_xxx)"
                value={selectedBatchId}
                onChange={e => setSelectedBatchId(e.target.value)}
                style={{ flex: 1, fontFamily: 'monospace' }} />
              <button className="btn btn-primary btn-sm" onClick={handleQueryBatch}
                disabled={batchDetailLoading || !selectedBatchId.trim()}>
                {batchDetailLoading ? '查询中...' : '查询'}
              </button>
            </div>
          </div>

          {batchDetail && (
            <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0 }}>批次详情: {batchDetail.id}</h4>
                <button className="btn btn-secondary btn-sm" onClick={() => setBatchDetail(null)}>关闭</button>
              </div>
              <div className="code-block" style={{ fontSize: '0.75rem' }}>
                {JSON.stringify(batchDetail, null, 2)}
              </div>
            </div>
          )}

          {batchResultsLoading && (
            <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--gray-400)' }}>
                <span className="spinner" /> 加载问答结果...
              </div>
            </div>
          )}

          {batchResults && (
            <div className="card" style={{ marginBottom: '1rem', padding: '0.75rem', overflowX: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ margin: 0 }}>问答结果: {batchResults.batch_id}</h4>
                <button className="btn btn-secondary btn-sm" onClick={() => setBatchResults(null)}>关闭</button>
              </div>
              {renderQAPairs(batchResults.requests, batchResults.responses)}
            </div>
          )}

          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table style={{ fontSize: '0.75rem', width: '100%', minWidth: 800 }}>
              <thead>
                <tr>
                  <th>Batch ID</th>
                  <th>状态</th>
                  <th>创建时间</th>
                  <th>完成时间</th>
                  <th>输入文件</th>
                  <th>输出文件</th>
                  <th>请求数</th>
                  <th>成功/失败</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                      暂无批次数据
                    </td>
                  </tr>
                ) : batches.map((b: any, i: number) => (
                  <tr key={b.id || i}>
                    <td style={{ fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.id}
                    </td>
                    <td>{statusTag(b.status)}</td>
                    <td>{formatTime(b.created_at)}</td>
                    <td>{formatTime(b.completed_at)}</td>
                    <td style={{ fontFamily: 'monospace', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.65rem' }}>
                      {b.input_file_id || '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.65rem' }}>
                      {b.output_file_id || '-'}
                    </td>
                    <td>{b.request_counts?.total || 0}</td>
                    <td>
                      <span style={{ color: 'var(--success)' }}>{b.request_counts?.completed || 0}</span>
                      /<span style={{ color: 'var(--error)' }}>{b.request_counts?.failed || 0}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {b.status === 'queuing' || b.status === 'in_progress' ? (
                          <button className="btn btn-danger btn-sm"
                            onClick={() => handleCancelBatch(b.id)}
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                            取消
                          </button>
                        ) : null}
                        {b.status === 'completed' && (
                          <button className="btn btn-primary btn-sm"
                            onClick={() => loadResults(b.id)}
                            style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                            结果
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ fontSize: '0.75rem', width: '100%', minWidth: 600 }}>
            <thead>
              <tr>
                <th>File ID</th>
                <th>文件名</th>
                <th>大小</th>
                <th>用途</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray-500)' }}>
                    暂无文件数据
                  </td>
                </tr>
              ) : files.map((f: any, i: number) => (
                <tr key={f.id || i}>
                  <td style={{ fontFamily: 'monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.id}
                  </td>
                  <td>{f.filename || '-'}</td>
                  <td>{f.bytes ? (f.bytes / 1024).toFixed(1) + 'KB' : '-'}</td>
                  <td>{purposeTag(f.purpose)}</td>
                  <td>{formatTime(f.created_at)}</td>
                  <td>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteFile(f.id)}
                      style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: '1rem' }}>
        <h4 style={{ marginBottom: '0.75rem' }}>批处理状态说明</h4>
        <table style={{ fontSize: '0.75rem' }}>
          <thead>
            <tr><th>状态</th><th>说明</th></tr>
          </thead>
          <tbody>
            <tr><td>{statusTag('queuing')}</td><td>排队中，等待处理</td></tr>
            <tr><td>{statusTag('in_progress')}</td><td>正在处理</td></tr>
            <tr><td>{statusTag('finalizing')}</td><td>结果上传中</td></tr>
            <tr><td>{statusTag('completed')}</td><td>处理完成</td></tr>
            <tr><td>{statusTag('failed')}</td><td>处理失败</td></tr>
            <tr><td>{statusTag('expired')}</td><td>超时</td></tr>
            <tr><td>{statusTag('canceled')}</td><td>已取消</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IpBansTab({ showToast, showConfirm }: { showToast: any; showConfirm: any }) {
  const [bans, setBans] = useState<IPBan[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editBan, setEditBan] = useState<IPBan | null>(null)

  const [banForm, setBanForm] = useState({
    ip_address: '', reason: '', ban_type: 'manual' as string,
    expires_in_minutes: '' as string
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

  useEffect(() => { loadData() }, [])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    loadData(search)
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
    showConfirm(`确定要解封 IP ${ban.ip_address} 吗？`, async () => {
      try {
        await adminApi.deleteIpBan(ban.id)
        setBans(prev => prev.map(b => b.id === ban.id ? { ...b, is_active: 0 } : b))
        showToast('IP已解封', 'success')
      } catch (err: any) {
        showToast(err.message || '解封失败', 'error')
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
          <h3 style={{ margin: 0 }}>IP封禁管理</h3>
          <p style={{ color: 'var(--gray-400)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            管理被封禁的IP地址，支持自动封禁和手动封禁
          </p>
        </div>
        <button className="btn btn-primary btn-sm"
          onClick={() => setShowAddModal(true)}>添加封禁</button>
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

      <div style={{ overflowX: 'auto' }}>
        <table>
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
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ban.ip_address}</td>
                <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ban.reason}</td>
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
                <td>
                  {isActive(ban) && (
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button className="btn btn-sm btn-success"
                        onClick={() => handleUnban(ban)}>解封</button>
                    </div>
                  )}
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
              <h3>添加IP封禁</h3>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="label">IP地址</label>
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