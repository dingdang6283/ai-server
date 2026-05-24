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

```yaml
app:
  secret_key: "your-secret-key"        # Flask 密钥
  host: "127.0.0.1"                    # 监听地址
  port: 8081                           # 监听端口
  proxy_protocol_version: 1            # 代理协议 (0=关闭, 1=HTTP头, 2=PPv2)
  email_whitelist: ""                  # 邮箱域名白名单，逗号分隔

smtp:
  display_name: "aicloud"              # 发件人显示名称
  sender_email: "your@email.com"       # 发件邮箱
  username: "your@email.com"           # SMTP 用户名
  password: "your-smtp-password"       # SMTP 密码/授权码
  server: "smtp.example.com"           # SMTP 服务器
  port: 465                            # SMTP 端口
  encryption: "SSL"                    # 加密方式 (SSL/TLS)

api:
  xfyun_password: "your-xfyun-key"     # 讯飞星火 API Key
```

所有字段也支持通过环境变量覆盖（如 `YML_SMTP_PASSWORD` 等）。

#### 2. 前端配置 `frontend/.env`

```env
VITE_API_HOST=localhost      # API 地址（开发环境）
VITE_API_PROTOCOL=http       # API 协议
```

生产环境配置 `frontend/.env.production`：

```env
API_HOST=your-domain.com     # API 地址（生产环境）
API_PROTOCOL=https           # API 协议
```

> 前端连接的后端地址优先级：`.env.production` > `.env` > `vite.config.ts` 中的默认值。

### 运行

```bash
# 后端
python3 server.py

# 前端开发模式（可选）
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
