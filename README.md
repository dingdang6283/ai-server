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
- **管理员面板** — 用户/IP/审计日志/AI 请求管理
- **动态 Token** — 支持临时授权链接，可设过期时间
- **邮件通知** — 验证码、空间邀请等邮件通知

---

## 🚀 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- SQLite3

### 方法一：自动安装（推荐）

```bash
# 1. 运行安装脚本
bash install.sh

# 2. 编辑配置文件
cp config.example.yml config.yml
nano config.yml  # 或使用其他编辑器修改配置

# 3. 启动服务
./start.sh
```

### 方法二：手动安装

```bash
# 1. 创建虚拟环境
python3 -m venv .venv

# 2. 激活虚拟环境
source .venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt
cd frontend && npm install

# 4. 配置应用
cp config.example.yml config.yml
# 编辑 config.yml 填入实际配置

# 5. 启动服务
python3 server.py
```

---

## 📦 使用启动脚本

### 启动服务

```bash
# 默认启动（后台运行）
./start.sh

# 调试模式（前台运行，显示日志）
./start.sh debug

# 查看服务状态
./start.sh status

# 停止服务
./start.sh stop

# 重启服务
./start.sh restart

# 查看帮助
./start.sh help
```

### 输出示例

```bash
$ ./start.sh
[INFO] 正在启动 DingDang AI Cloud...
[SUCCESS] 服务启动成功！(PID: 12345)
[INFO] 日志文件：logs/server.log
[INFO] 查看日志：tail -f logs/server.log

$ ./start.sh status
[SUCCESS] 服务运行中 (PID: 12345)
    PID    PPID USER     %CPU %MEM ELAPSED           COMMAND
  12345    1234 dingdang  2.5  1.2 01:23:45   python3 server.py

[INFO] 最近日志:
2026-05-25 21:57:00 INFO: Server started on http://127.0.0.1:8081
```

---

## ⚙️ 配置说明

### 环境变量（推荐用于生产环境）

```bash
# 使用环境变量覆盖配置文件
export YML_SECRET_KEY="your-secret-key"
export YML_SMTP_PASSWORD="your-smtp-password"
export YML_API_XFYUN_PASSWORD="your-api-key"

# 启动服务
./start.sh
```

### 配置文件结构

```yaml
# config.yml
app:
  secret_key: "修改为随机字符串"
  host: "127.0.0.1"
  port: 8081

smtp:
  sender_email: "your-email@example.com"
  password: "your-smtp-password"
  server: "smtp.example.com"

api:
  xfyun_password: "your-api-key"
```

### 完整配置参考

完整配置参考 [config.example.yml](config.example.yml)，主要配置段如下：

```yaml
# ---- 应用基础 ----
app:
  secret_key: "your-secret-key"          # Flask 密钥
  host: "127.0.0.1"                      # 监听地址
  port: 8081                             # 监听端口
  proxy_protocol_version: 1              # 代理协议 (0=关闭，1=HTTP 头，2=PPv2)
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
  api_host: "127.0.0.1"                  # API 地址（示例用）
  api_protocol: "http"                   # API 协议
  page_title: "DingDang Cloud"           # 浏览器标签页标题
  site_title: "ai 平台"                    # 页面站点名称

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

---

## 📝 常见问题

### 1. 虚拟环境不存在

```bash
# 运行安装脚本
bash install.sh
```

### 2. 端口已被占用

```bash
# 查看占用端口的进程
lsof -i :8081

# 修改 config.yml 中的端口
app:
  port: 8082
```

### 3. 权限问题

```bash
# 设置执行权限
chmod +x install.sh start.sh
```

### 4. 依赖安装失败

```bash
# 升级 pip
source .venv/bin/activate
pip install --upgrade pip

# 重新安装依赖
pip install -r requirements.txt
```

---

## 🔧 开发模式

```bash
# 激活虚拟环境
source .venv/bin/activate

# 运行在调试模式
export FLASK_ENV=development
python3 server.py

# 或使用启动脚本
./start.sh debug
```

---

## 📊 日志管理

```bash
# 查看实时日志
tail -f logs/server.log

# 查看最近 100 行
tail -n 100 logs/server.log

# 搜索错误日志
grep ERROR logs/server.log

# 清空日志
> logs/server.log
```

---

## 🔐 安全建议

1. **首次部署时修改 `secret_key`**
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(32))"
   ```

2. **不要将 `config.yml` 上传到版本控制**
   - 已添加到 `.gitignore`
   - 使用 `config.example.yml` 作为模板

3. **使用环境变量存储敏感信息**
   ```bash
   YML_SMTP_PASSWORD=xxx ./start.sh
   ```

4. **配置防火墙**
   ```bash
   # 仅允许本地访问
   app:
     host: "127.0.0.1"
   
   # 或允许所有 IP（需要防火墙保护）
   app:
     host: "0.0.0.0"
   ```

---

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

---

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
├── install.sh             # 自动安装脚本
├── start.sh               # 启动脚本
├── config.example.yml     # 配置示例文件
├── config.yml             # 实际配置文件（不上传到 Git）
├── templates/             # Flask 模板
└── adapters/              # 适配器模块
```

---

## 变更日志

### v4.0（重构版）
- 彻底移除原有的任务管理功能模块
- 重构核心 AI 请求流程（token 计算 → JSON 存储 → 唯一 ID → 状态管理）
- 新增联网搜索功能（每次消耗 20 token）
- 新增深度思考功能（额外增加 1 token）
- room_id 参数必须传入，默认值为 "1"
- 移除旧的批处理管理相关 API 路由
- 数据库使用新的 ai_requests 表替代旧的 batch_requests 和 admin_tasks 表
- 新增自动安装脚本 `install.sh`
- 新增启动脚本 `start.sh`

---

## 许可证

MIT

---

**最后更新**: 2026-05-25
