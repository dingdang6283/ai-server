export interface User {
  id: number
  email: string
  username: string
  role: 'user' | 'admin'
  is_verified: boolean
  is_active?: boolean
  api_key: string
  api_key_masked?: string
  dynamic_token?: string
  created_at?: string
  remaining_tokens?: number
  total_token_quota?: number
  max_concurrent?: number
  priority?: number
}

export interface LoginResponse {
  message: string
  user: User
}

export interface RegisterResponse {
  message: string
  email: string
  user?: User
}

export interface TokenConfig {
  chinese_ratio: number
  english_ratio: number
  other_ratio: number
  updated_by?: number
  updated_at?: string
}

export interface AdminUser {
  id: number
  email: string
  username: string
  role: string
  is_verified: number
  is_active: number
  created_at: string
  remaining_tokens?: number
  max_concurrent?: number
  priority?: number
}

export interface UsageStats {
  total_users: number
  verified_users: number
  unverified_users: number
  active_users: number
  total_upload_tokens: number
  total_download_tokens: number
  total_used_tokens: number
}

export interface TokenStats {
  upload_tokens: number
  download_tokens: number
  total_tokens: number
  user_count: number
}

export interface AdminTask {
  id: number
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'canceled'
  priority: number
  created_by: number | null
  assigned_to: number | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export interface CalculateTokenResult {
  text: string
  tokens: number
  characters: number
  model: string
}

export interface DailyUsage {
  day: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  call_count: number
}

export interface UsageHistory {
  history: DailyUsage[]
  today_usage: { total: number }
}

export interface Space {
  id: number
  user_id: number
  name: string
  description: string
  tokens?: number
  is_active: number
  context_count?: number
  created_at: string
  updated_at: string
}

export interface ContextMessage {
  id: number
  space_id: number
  user_id: number
  role: 'user' | 'assistant' | 'system'
  content: string
  token_count: number
  created_at: string
}

export interface ContextSettings {
  id?: number
  user_id: number
  max_context_messages: number
  max_context_tokens: number
  auto_summary: number
  summary_model: string
  updated_at?: string
}

export interface Notification {
  user_notification_id: number
  is_read: number
  is_claimed?: number
  claimed_at?: string | null
  read_at: string | null
  subject: string
  body: string
  type: 'announcement' | 'token_grant'
  token_amount: number
  created_at: string
  admin_name: string
}

export interface ApiError {
  error: string
}

export interface IPBan {
  id: number
  ip_address: string
  reason: string
  ban_type: string
  banned_by: number | null
  is_active: number
  expires_at: string | null
  created_at: string
  updated_at: string
}

export interface IPTracking {
  ip_address: string
  total_requests: number
  endpoint_count: number
  user_agents: string
  first_seen: string
  last_seen: string
}

export interface AuditLogEntry {
  id: number
  admin_id: number
  admin_name: string
  action: string
  target_type: string | null
  target_id: number | null
  details: string | null
  ip_address: string | null
  created_at: string
}