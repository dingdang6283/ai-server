# DingDang AI Cloud v3.2

AI 接口适配器管理平台，作为讯飞星火 API 的适配代理层，提供用户管理、空间隔离、批处理和实时流式对话等功能。

## 功能特性

- **流式对话** — 支持 `/v1/chat/completions` 接口，兼容 OpenAI API 格式
- **异步批处理** — 提交批量对话请求，后台轮询完成状态，自动下载结果
- **用户系统** — 注册/登录、邮箱验证、密码修改、API Key 管理
- **空间管理** — 创建独立空间，每个空间可隔离上下文和配额
- **房间隔离** — 通过 `room_id` 隔离对话上下文，支持 UTF-8 标识
- **管理员面板** — 用户/IP/审计日志/批处理管理，SSE 实时推送状态
- **API Playground** — 在线测试所有 API 接口
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

### 对话
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/chat/completions` | 流式对话（OpenAI 兼容） |

### 批处理
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/batch/jobs` | 提交异步批处理任务 |
| GET | `/v1/batch/jobs` | 查询任务列表 |
| GET | `/v1/batch/jobs/{job_id}` | 查询任务状态 |
| POST | `/v1/batch/upload` | 上传批处理文件 |
| GET | `/v1/batch/batches` | 批处理列表 |
| GET | `/v1/batch/batches/{batch_id}` | 批处理状态 |
| GET | `/v1/batch/batches/{batch_id}/results` | 批处理问答结果 |
| GET | `/v1/batch/files` | 文件列表 |

### 管理（需管理员）
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/users` | 用户管理 |
| GET | `/api/admin/ip-monitor` | IP 监控 |
| GET | `/api/admin/audit-log` | 审计日志 |
| GET | `/v1/batch/events` | SSE 实时推送 |

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

## 许可证

MIT
