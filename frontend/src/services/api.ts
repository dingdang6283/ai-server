import type {
  User, LoginResponse, RegisterResponse, TokenConfig, TokenStats,
  AdminUser, AdminTask, BatchRequest, UsageStats, CalculateTokenResult, UsageHistory,
  Space, ContextMessage, ContextSettings, Notification,
  IPBan, IPTracking, AuditLogEntry
} from '../types/api'

const API_BASE = ''
const REQUEST_TIMEOUT = 30000

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('api_key')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  }
  if (token && token !== 'null') {
    headers['Authorization'] = `Bearer ${token}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers,
      signal: controller.signal
    })

    if (res.status === 401 || res.status === 403) {
      const isAuthEndpoint = url.includes('/api/auth/')
      if (token && token !== 'null' && !isAuthEndpoint) {
        const loginTime = parseInt(localStorage.getItem('login_timestamp') || '0', 10)
        const elapsed = Date.now() - loginTime
        if (elapsed > 5000) {
          localStorage.removeItem('api_key')
          localStorage.removeItem('current_user')
          window.location.href = '/login'
          throw new Error('认证已过期，请重新登录')
        }
      }
      const data = await res.json()
      throw new Error(data.error || `请求失败 (${res.status})`)
    }

    const contentType = res.headers.get('content-type') || ''

    if (!contentType.includes('application/json')) {
      const text = await res.text()
      const snippet = text.slice(0, 200)
      throw new Error(`服务器返回了非 JSON 响应 (${res.status})，请检查后端服务是否正确运行`)
    }

    const data = await res.json()

    if (!res.ok) {
      throw new Error(data.error || `请求失败 (${res.status})`)
    }
    return data as T
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new Error('网络连接失败，请检查后端服务是否正确运行')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export const authApi = {
  register: (data: { email: string; password: string; username: string; captcha_id?: string; captcha_code?: string; code?: string }) =>
    request<RegisterResponse>('/api/auth/register',
      { method: 'POST', body: JSON.stringify(data) }),

  getCaptcha: () =>
    request<{ captcha_id: string; image: string }>('/api/auth/captcha'),

  login: (data: { account: string; password: string }) =>
    request<LoginResponse>('/api/auth/login',
      { method: 'POST', body: JSON.stringify(data) }),

  loginWithCode: (data: { email: string; code: string }) =>
    request<LoginResponse>('/api/auth/login-with-code',
      { method: 'POST', body: JSON.stringify(data) }),

  sendVerification: (email: string, purpose: string = 'register') =>
    request<{ message: string }>('/api/auth/send-verification',
      { method: 'POST', body: JSON.stringify({ email, purpose }) }),

  verifyEmail: (data: { email: string; code: string; purpose?: string }) =>
    request<LoginResponse>('/api/auth/verify-email',
      { method: 'POST', body: JSON.stringify(data) }),

  changePasswordSendCode: () =>
    request<{ message: string }>('/api/auth/change-password-send-code',
      { method: 'POST' }),

  changePassword: (data: { code: string; new_password: string; confirm_password: string }) =>
    request<{ message: string }>('/api/auth/change-password',
      { method: 'POST', body: JSON.stringify(data) }),
}

export const userApi = {
  getProfile: () =>
    request<{ user: User }>('/api/user/profile'),

  updateUsername: (username: string) =>
    request<{ message: string; username: string }>('/api/user/username',
      { method: 'PUT', body: JSON.stringify({ username }) }),

  regenerateApiKey: () =>
    request<{ api_key: string; dynamic_token: string; message: string }>(
      '/api/user/regenerate-api-key', { method: 'POST' }),

  getDynamicToken: () =>
    request<{ dynamic_token: string; expires_in: number }>(
      '/api/user/dynamic-token', { method: 'POST', body: '{}' }),

  getUsageHistory: (days: number = 14) =>
    request<UsageHistory>(`/api/user/usage-history?days=${days}`),
}

export const adminApi = {
  getUsers: (search?: string) =>
    request<{ users: AdminUser[] }>(
      `/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  toggleUserStatus: (userId: number) =>
    request<{ message: string; is_active: boolean }>(
      `/api/admin/users/${userId}/toggle-status`, { method: 'POST' }),

  getUserConfig: (userId: number) =>
    request<AdminUser>(`/api/admin/users/${userId}/config`),

  updateUserConfig: (userId: number, data: {
    remaining_tokens: number; max_concurrent: number; priority: number
  }) =>
    request<AdminUser>(`/api/admin/users/${userId}/config`,
      { method: 'PUT', body: JSON.stringify(data) }),

  updateUserFull: (userId: number, data: any) =>
    request<AdminUser>(`/api/admin/users/${userId}`,
      { method: 'PUT', body: JSON.stringify(data) }),

  deleteUser: (userId: number) =>
    request<{ message: string }>(`/api/admin/users/${userId}`,
      { method: 'DELETE' }),

  updateUserData: (data: any) =>
    request<AdminUser>('/api/admin/update-user-data',
      { method: 'PUT', body: JSON.stringify(data) }),

  getTokenConfig: () =>
    request<TokenConfig>('/api/admin/token-config'),

  updateTokenConfig: (data: TokenConfig) =>
    request<TokenConfig>('/api/admin/token-config',
      { method: 'PUT', body: JSON.stringify(data) }),

  getUsageStats: () =>
    request<UsageStats>('/api/admin/usage-stats'),

  getTokenStats: () =>
    request<TokenStats>('/api/admin/token-stats'),

  getTasks: () =>
    request<{ tasks: AdminTask[] }>('/api/admin/tasks'),

  createTask: (data: { title: string; description?: string; priority?: number }) =>
    request<{ task: AdminTask; message: string }>('/api/admin/tasks',
      { method: 'POST', body: JSON.stringify(data) }),

  updateTask: (taskId: number, data: Partial<AdminTask>) =>
    request<{ task: AdminTask; message: string }>(`/api/admin/tasks/${taskId}`,
      { method: 'PUT', body: JSON.stringify(data) }),

  deleteTask: (taskId: number) =>
    request<{ message: string }>(`/api/admin/tasks/${taskId}`, { method: 'DELETE' }),

  cleanupTasks: () =>
    request<{ message: string }>('/api/admin/tasks/cleanup', { method: 'POST' }),

  getBatchRequests: (params?: { limit?: number; status?: string; user?: string }) => {
    const query = new URLSearchParams()
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.status) query.set('status', params.status)
    if (params?.user) query.set('user', params.user)
    const qs = query.toString()
    return request<{ requests: BatchRequest[] }>(
      `/api/admin/batch-requests${qs ? `?${qs}` : ''}`)
  },

  getBatchRequest: (requestId: number) =>
    request<{ request: BatchRequest }>(`/api/admin/batch-requests/${requestId}`),

  cleanupBatchRequests: (days: number = 7) =>
    request<{ message: string }>(`/api/admin/batch-requests/cleanup?days=${days}`, { method: 'POST' }),

  sendNotification: (data: {
    subject: string; body: string; type: string;
    token_amount?: number; target_type: string;
    target_user_id?: string | number; target_list?: string
  }) =>
    request<{ message: string; notification_id: number; sent_count: number }>(
      '/api/admin/notifications',
      { method: 'POST', body: JSON.stringify(data) }),

  listNotifications: () =>
    request<{ notifications: any[] }>('/api/admin/notifications'),

  getIpBans: (search?: string) =>
    request<{ bans: IPBan[] }>(
      `/api/admin/ip-bans${search ? `?search=${encodeURIComponent(search)}` : ''}`),

  addIpBan: (data: { ip_address: string; reason: string; ban_type?: string; expires_in_minutes?: number }) =>
    request<{ ban: IPBan; message: string }>('/api/admin/ip-bans',
      { method: 'POST', body: JSON.stringify(data) }),

  updateIpBan: (banId: number, data: { reason?: string; is_active?: boolean; expires_in_minutes?: number }) =>
    request<{ ban: IPBan; message: string }>(`/api/admin/ip-bans/${banId}`,
      { method: 'PUT', body: JSON.stringify(data) }),

  deleteIpBan: (banId: number) =>
    request<{ message: string }>(`/api/admin/ip-bans/${banId}`, { method: 'DELETE' }),

  getIpTracking: (params?: { page?: number; per_page?: number; sort_by?: string; sort_order?: string; search?: string }) => {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.per_page) query.set('per_page', String(params.per_page))
    if (params?.sort_by) query.set('sort_by', params.sort_by)
    if (params?.sort_order) query.set('sort_order', params.sort_order)
    if (params?.search) query.set('search', params.search)
    const qs = query.toString()
    return request<{ tracking: IPTracking[]; total: number; page: number; per_page: number }>(
      `/api/admin/ip-tracking${qs ? `?${qs}` : ''}`)
  },

  getAuditLog: (page: number = 1, per_page: number = 50) =>
    request<{ logs: AuditLogEntry[]; total: number; page: number; per_page: number }>(
      `/api/admin/audit-log?page=${page}&per_page=${per_page}`),

  polishText: (data: { subject?: string; body?: string; style?: string }) =>
    request<{ subject?: string; body?: string }>('/api/admin/polish-text',
      { method: 'POST', body: JSON.stringify(data) }),
}

export const spaceApi = {
  list: () =>
    request<{ spaces: Space[] }>('/api/spaces'),

  get: (spaceId: number) =>
    request<{ space: Space }>(`/api/spaces/${spaceId}`),

  create: (data: { name: string; description?: string }) =>
    request<{ space: Space; message: string }>('/api/spaces',
      { method: 'POST', body: JSON.stringify(data) }),

  update: (spaceId: number, data: { name?: string; description?: string }) =>
    request<{ space: Space; message: string }>(`/api/spaces/${spaceId}`,
      { method: 'PUT', body: JSON.stringify(data) }),

  delete: (spaceId: number) =>
    request<{ message: string }>(`/api/spaces/${spaceId}`,
      { method: 'DELETE' }),

  getContexts: (spaceId: number, limit: number = 50) =>
    request<{ contexts: ContextMessage[]; total_count: number; returned_count: number; total_tokens: number }>(
      `/api/spaces/${spaceId}/contexts?limit=${limit}`),

  addContext: (spaceId: number, data: { role: string; content: string }) =>
    request<{ context: ContextMessage; message: string }>(
      `/api/spaces/${spaceId}/contexts`,
      { method: 'POST', body: JSON.stringify(data) }),

  batchAddContexts: (spaceId: number, messages: Array<{ role: string; content: string }>) =>
    request<{ contexts: ContextMessage[]; count: number; message: string }>(
      `/api/spaces/${spaceId}/contexts/batch`,
      { method: 'POST', body: JSON.stringify({ messages }) }),

  deleteContext: (spaceId: number, contextId: number) =>
    request<{ message: string }>(
      `/api/spaces/${spaceId}/contexts/${contextId}`,
      { method: 'DELETE' }),

  clearContexts: (spaceId: number) =>
    request<{ message: string }>(
      `/api/spaces/${spaceId}/contexts`,
      { method: 'DELETE' }),

  getSettings: (spaceId: number) =>
    request<{ settings: ContextSettings }>(
      `/api/spaces/${spaceId}/contexts/settings`),

  updateSettings: (spaceId: number, data: Partial<ContextSettings>) =>
    request<{ settings: ContextSettings; message: string }>(
      `/api/spaces/${spaceId}/contexts/settings`,
      { method: 'PUT', body: JSON.stringify(data) }),
}

export const aiApi = {
  calculateTokens: (text: string) =>
    request<CalculateTokenResult>('/v1/calculate_tokens',
      { method: 'POST', body: JSON.stringify({ text }) }),

  chatCompletions: (messages: Array<{ role: string; content: string }>,
    maxTokens: number = 500, spaceId?: number, roomId?: string) =>
    request<any>('/v1/chat/completions',
      { method: 'POST',
        body: JSON.stringify({
          messages,
          max_tokens: maxTokens,
          ...(spaceId !== undefined ? { space_id: spaceId } : {}),
          ...(roomId ? { room_id: roomId } : {})
        }) }),

  submitBatchJob: (messages: Array<{ role: string; content: string }>,
    model: string = 'qwen', maxTokens: number = 500,
    temperature: number = 0.7) =>
    request<{ job_id: string; status: string; message: string }>(
      '/v1/batch/jobs',
      { method: 'POST', body: JSON.stringify({
        messages, model, max_tokens: maxTokens, temperature
      })}),

  listBatchJobs: () =>
    request<{ object: string; data: any[] }>('/v1/batch/jobs'),

  getBatchJob: (jobId: string) =>
    request<any>(`/v1/batch/jobs/${jobId}`),

  listBatches: (limit: number = 10) =>
    request<{ object: string; data: any[] }>(
      `/v1/batch/batches?limit=${limit}`),

  getBatchStatus: (batchId: string) =>
    request<any>(`/v1/batch/batches/${batchId}`),

  getBatchResults: (batchId: string) =>
    request<{ batch_id: string; status: string; requests: any[]; responses: any[] }>(
      `/v1/batch/batches/${batchId}/results`),

  cancelBatch: (batchId: string) =>
    request<any>(`/v1/batch/batches/${batchId}/cancel`,
      { method: 'POST' }),

  listFiles: (page: number = 1, size: number = 20) =>
    request<{ object: string; data: any[] }>(
      `/v1/batch/files?page=${page}&size=${size}`),

  deleteFile: (fileId: string) =>
    request<{ id: string; deleted: boolean }>(
      `/v1/batch/files/${fileId}`, { method: 'DELETE' }),
}

export const notificationApi = {
  list: () =>
    request<{ notifications: Notification[]; unread_count: number }>(
      '/api/notifications'),

  markRead: (id: number) =>
    request<{ message: string }>(`/api/notifications/${id}/read`,
      { method: 'POST' }),

  markAllRead: () =>
    request<{ message: string }>('/api/notifications/read-all',
      { method: 'POST' }),

  delete: (id: number) =>
    request<{ message: string }>(`/api/notifications/${id}/delete`,
      { method: 'POST' }),

  claim: (id: number) =>
    request<{ message: string; token_amount: number }>(
      `/api/notifications/${id}/claim`,
      { method: 'POST' }),
}