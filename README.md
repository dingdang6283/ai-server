# DingDang AI Cloud v4.0（重构版）

AI API 适配器管理平台，基于讯飞星火 API 的适配代理层，提供用户管理、核心 AI 请求流程、联网搜索和深度思考等功能。

## 功能特性

- **AI 对话** — 支持 `/v1/chat/completions` 和 `/v1/completions` 接口（OpenAI 兼容）
- **核心流程重构** — 问题提交 → token 计算 → JSON 数据持久化 → 唯一 ID 生成 → AI 处理 → 状态管理 → 格式化返回
- **联网搜索** — 每次联网搜索消耗 20 token（`web_search` 参数）
- **深度思考** — 启用时额外增加 1 token（`deep_think` 参数）
- **房间隔离** — 通过 `room_id` 隔离对话上下文，默认值为 "1"
- **用户系统** — 注册/登录、邮箱验证、密码修改、API Key 管理
- **空间管理** — 创建独立空间，每个空间可隔离上下文和配额
- **管理员面板** — 用户/IP/审计日志/AI请求管理
- **动态 Token** — 支持临时授权链接，可设过期时间
- **邮件通知** — 验证码、空间邀请等邮件通知

## 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- SQLite3

### 安装

```bash
# 后端
pip install flask requests

# 前端
cd frontend
npm install
```

### 配置

#### 1. 后端配置 `config.yml`

完整配置参考 [config.yml](config.yml)，主要配置段如下：

```yaml
# ---- 应用基础 ----
app:
  secret_key: "your-secret-key"          # Flask 密钥
  host: "127.0.0.1"                      # 监听地址
  port: 8081                             # 监听端口
  proxy_protocol_version: 1              # 代理协议 (0=关闭, 1=HTTP头, 2=PPv2)
  email_whitelist: ""                    # 邮箱域名白名单，逗号分隔

# ---- 邮件服务 ----
smtp:
  display_name: "aicloud"                # 发件人显示名称
  sender_email: "your@email.com"         # 发件邮箱
  username: "your@email.com"             # SMTP 用户名
  password: "your-smtp-password"         # SMTP 密码/授权码
  server: "smtp.example.com"             # SMTP 服务器
  port: 465                              # SMTP 端口
  encryption: "SSL"                      # 加密方式

# ---- API 密钥 ----
api:
  xfyun_password: "your-xfyun-key"       # 讯飞星火 API Key

# ---- 邮件模板 ----
email_templates:
  verification: "email.html"             # 验证码模板
  notification: "notification.html"      # 通知模板
  token_grant: "token_grant.html"        # Token 授权模板

# ---- 前端 ----
frontend:
  api_host: "127.0.0.1"                 # API 地址（示例用）
  api_protocol: "http"                   # API 协议
  page_title: "DingDang Cloud"          # 浏览器标签页标题
  site_title: "ai平台"                   # 页面站点名称

# ---- 数据库 ----
database:
  mode: "sqlite"                         # 模式：sqlite / mysql / postgresql / mongodb
  path: "."                              # SQLite 文件存储目录
  sqlite:
    filename: "data.db"                  # SQLite 文件名
    auto_create: true                    # 首次启动自动创建
  mysql:
    host: "127.0.0.1"
    port: 3306
    user: "root"
    password: ""
    database: "dingdang_cloud"
  postgresql:
    host: "127.0.0.1"
    port: 5432
    user: "postgres"
    password: ""
    database: "dingdang_cloud"
  mongodb:
    host: "127.0.0.1"
    port: 27017
    user: ""
    password: ""
    database: "dingdang_cloud"
    uri: ""
```

所有配置项支持通过同名环境变量覆盖（前缀 `YML_`），例如：
```bash
YML_SMTP_PASSWORD=xxx YML_XFYUN_PASSWORD=xxx python3 server.py
```

#### 2. 前端配置（已合并至 config.yml）

前端地址配置已合并到 `config.yml` 的 `frontend` 段，配置注入由后端自动完成。
不再需要独立的 `.env` 文件。

### 运行

```bash
# 安装依赖
pip install -r requirements.txt
cd frontend && npm install

# 启动后端
python3 server.py

# 启动前端开发模式（可选）
cd frontend && npx vite --host 0.0.0.0 --port 5173
```

## API 概览

### 认证
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |
| POST | `/api/auth/send-verification` | 发送验证码 |
| POST | `/api/auth/verify-email` | 验证邮箱 |
| POST | `/api/auth/change-password` | 修改密码 |

### 对话（核心功能）
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/chat/completions` | AI 对话（OpenAI 兼容，支持联网搜索和深度思考） |
| POST | `/v1/completions` | AI 补全（兼容格式） |
| GET | `/v1/models` | 模型列表 |
| POST | `/v1/calculate_tokens` | 计算 token 数量 |

### AI 请求参数说明

#### `/v1/chat/completions`

```json
{
  "messages": [{"role": "user", "content": "你好"}],
  "room_id": "1",
  "web_search": false,
  "deep_think": false,
  "max_tokens": 500,
  "temperature": 0.7,
  "stream": false
}
```

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `messages` | array | 必填 | 对话消息列表 |
| `room_id` | string | `"1"` | 房间标识，用于隔离对话上下文 |
| `web_search` | boolean | `false` | 启用联网搜索（消耗 20 token） |
| `deep_think` | boolean | `false` | 启用深度思考（额外消耗 1 token） |
| `max_tokens` | integer | `500` | 最大输出长度 |
| `temperature` | float | `0.7` | 温度参数（0-2） |
| `stream` | boolean | `false` | 是否启用流式输出 |

#### 返回示例

```json
{
  "id": "cmpl-...",
  "request_id": "req_...",
  "object": "chat.completion",
  "created": 1234567890,
  "choices": [
    {
      "index": 0,
      "message": {"role": "assistant", "content": "你好！有什么可以帮助你的吗？"},
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30,
    "base_tokens": 10,
    "web_search_tokens": 0,
    "deep_think_tokens": 0,
    "use-token": 30,
    "token": 9970,
    "space_tokens": 0
  },
  "features": {
    "web_search": false,
    "deep_think": false
  },
  "room_id": "1"
}
```

### Token 消耗计算规则

- **基础 token**：根据文本长度和中英文比例计算
- **联网搜索**：每次额外消耗 20 token（`web_search: true`）
- **深度思考**：每次额外消耗 1 token（`deep_think: true`）
- **总消耗** = AI 实际消耗 token + 联网搜索 token（20）+ 深度思考 token（1）

### AI 请求管理（需管理员）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/ai-requests` | AI 请求列表 |
| GET | `/api/admin/ai-requests/{request_id}` | 查询单个请求详情 |
| POST | `/api/admin/ai-requests/cleanup` | 清理过期请求 |

### 管理（需管理员）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户管理 |
| GET | `/api/admin/ip-monitor` | IP 监控 |
| GET | `/api/admin/audit-log` | 审计日志 |
| GET | `/api/admin/notifications` | 通知管理 |
| GET | `/api/admin/token-config` | Token 配置 |
| GET | `/api/admin/usage-stats` | 使用统计 |

## 项目结构

```
├── server.py              # 后端主程序（Flask）
├── frontend/              # 前端（React + TypeScript + Vite）
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 调用封装
│   │   ├── components/    # 通用组件
│   │   └── context/       # React 上下文
│   └── vite.config.ts     # Vite 配置
├── config.yml             # 配置文件
├── templates/             # Flask 模板
└── adapters/              # 适配器模块
```

## 变更日志

### v4.0（重构版）
- 彻底移除原有的任务管理功能模块
- 重构核心 AI 请求流程（token计算 → JSON存储 → 唯一ID → 状态管理）
- 新增联网搜索功能（每次消耗 20 token）
- 新增深度思考功能（额外增加 1 token）
- room_id 参数必须传入，默认值为 "1"
- 移除旧的批处理管理相关 API 路由
- 数据库使用新的 ai_requests 表替代旧的 batch_requests 和 admin_tasks 表

## 许可证

MIT