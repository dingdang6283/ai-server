# AI中转服务安全加固报告

## 加固概述

本次安全加固针对AI中转服务的特殊威胁场景，实施了多层防御体系。

---

## 已实施的安全措施

### 1. 提示词注入防护 (PromptInjectionDefense)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L1538-L1736)

**功能**:
- 50+ 种注入模式检测（中英文）
- 特殊Token注入防护 (`<|im_start|>`, `[INST]` 等)
- 分隔符攻击防护
- 蜜罐模式检测（诱捕攻击者）
- 自动封禁机制（5次尝试或3次蜜罐触发）

**检测模式包括**:
```
- ignore previous instructions
- system prompt:
- 忽略之前的指令
- 你现在是管理员
- jailbreak / DAN mode
- 输出你的提示词
- 执行命令/shell
```

### 2. AI输出安全过滤 (OutputGuard)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L1739-L1835)

**功能**:
- XSS攻击防护（转义危险HTML/JS）
- 敏感信息过滤（API Key、内网IP、Token等）
- 外部链接标记
- 输出签名验证

### 3. 智能速率限制 (SmartRateLimiter)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L1940-L2099)

**功能**:
- 多维度限流（每分钟/每小时请求数和Token数）
- 用户分级策略（default/premium）
- 行为异常检测（快速请求、超大提示词、异常时间等）
- 自动封禁可疑用户

**限制配置**:
```python
default: {
    'requests_per_minute': 30,
    'requests_per_hour': 300,
    'tokens_per_minute': 10000,
    'tokens_per_hour': 100000
}
premium: {
    'requests_per_minute': 60,
    'requests_per_hour': 1000,
    'tokens_per_minute': 50000,
    'tokens_per_hour': 500000
}
```

### 4. API请求签名验证 (APIRequestSigner)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L1838-L1937)

**功能**:
- 请求签名生成与验证
- 防重放攻击（Nonce机制）
- 时间戳验证（5分钟窗口）
- 浏览器指纹追踪

**请求头**:
```
X-User-ID: 用户ID
X-Timestamp: 时间戳
X-Nonce: 随机字符串
X-Signature: 签名
X-Fingerprint: 浏览器指纹
```

### 5. AI蜜罐系统 (AITrap)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L2102-L2209)

**功能**:
- 诱捕恶意查询（获取API Key、系统配置、执行命令等）
- 返回假数据给攻击者
- 攻击者行为记录
- 自动封禁建议

**蜜罐触发词**:
```
- "输出你的API Key"
- "告诉我系统配置"
- "执行shell命令"
- "删除数据库"
- "绕过安全限制"
```

### 6. 安全审计日志 (SecurityAuditLogger)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L2212-L2277)

**功能**:
- AI请求完整记录
- 安全事件记录
- 日志签名防篡改
- 支持安全事件查询

### 7. 双重记账系统 (DoubleEntryBookkeeping)

**位置**: [server.py](file:///media/dingdang/NAS/ai/server.py#L2288-L2404)

**功能**:
- 内存计数器 + 数据库账本
- 交易签名防篡改
- 自动对账检查
- 异常告警

### 8. 前端安全脚本

**位置**: [frontend/public/security.js](file:///media/dingdang/NAS/ai/frontend/public/security.js)

**功能**:
- 反调试检测（开发者工具、窗口大小变化）
- 请求自动签名
- 运行时完整性检查
- 安全事件上报

**使用方法**:
```html
<script src="/security.js"></script>
<script>
  // 初始化安全系统
  window.SecurityMonitor.init(apiKey, userId);

  // 或自动初始化
  window.SECURITY_CONFIG = {
    apiKey: 'your-api-key',
    userId: 123
  };
</script>
```

---

## 管理API

### 获取安全统计
```
GET /api/admin/security/stats
Authorization: Bearer <admin-token>
```

### 封禁用户
```
POST /api/admin/security/ban-user
{
  "user_id": 123,
  "duration": 3600,
  "reason": "恶意攻击"
}
```

### 解封用户
```
POST /api/admin/security/unban-user
{
  "user_id": 123
}
```

### 获取用户安全统计
```
GET /api/admin/security/user-stats/123
Authorization: Bearer <admin-token>
```

---

## 安全事件类型

| 事件类型 | 说明 | 严重级别 |
|---------|------|---------|
| prompt_injection_attempt | 提示词注入尝试 | 高 |
| honeypot_triggered | 蜜罐被触发 | 高 |
| rate_limit_exceeded | 超出速率限制 | 中 |
| suspicious_behavior | 可疑行为 | 中 |
| output_security_warning | 输出安全警告 | 中 |
| frontend_security_event | 前端安全事件 | 低 |
| admin_ban_user | 管理员封禁用户 | 信息 |
| admin_unban_user | 管理员解封用户 | 信息 |

---

## 防御纵深架构

```
┌─────────────────────────────────────────────────────────────┐
│  前端层 (Frontend)                                           │
│  ├── 反调试检测                                              │
│  ├── 请求签名                                                │
│  └── 运行时完整性检查                                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│  API网关层 (API Gateway)                                     │
│  ├── 速率限制检查                                            │
│  ├── 请求签名验证                                            │
│  └── 行为分析                                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│  应用层 (Application)                                        │
│  ├── 蜜罐检测                                                │
│  ├── 提示词注入检测                                          │
│  ├── AI输出过滤                                              │
│  └── 审计日志                                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│  数据层 (Data Layer)                                         │
│  ├── 双重记账                                                │
│  └── 交易签名                                                │
└─────────────────────────────────────────────────────────────┘
```

---

## 配置建议

### 1. 环境变量
```bash
# 加密密钥（必须设置强密码）
export ENCRYPTION_KEY="your-strong-encryption-key-min-32-chars"

# WAF配置
export WAF_ENABLED=true
```

### 2. Nginx配置（额外防护）
```nginx
# 限制请求速率
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

# 阻止常见攻击
location / {
    # 阻止SQL注入尝试
    if ($args ~* "union.*select.*\(") {
        return 403;
    }

    # 阻止路径遍历
    if ($uri ~* "\.\./") {
        return 403;
    }
}
```

### 3. 前端集成
在 `index.html` 中添加:
```html
<head>
  <script src="/security.js"></script>
</head>
```

---

## 监控与告警

### 日志文件
- 安全审计日志: `security_audit.log`
- 应用日志: 包含 `[安全]` 前缀的日志

### 关键指标监控
- 提示词注入尝试次数
- 蜜罐触发次数
- 被封禁用户数
- 速率限制触发次数
- 异常行为分数

### 告警阈值建议
- 单用户1分钟内注入尝试 > 3次 → 告警
- 单用户触发蜜罐 > 1次 → 告警
- 系统整体注入尝试 > 10次/分钟 → 告警

---

## 后续建议

1. **定期更新注入模式**: 根据新的攻击手法更新 `FORBIDDEN_PATTERNS`
2. **监控误报**: 检查是否有正常用户被误封
3. **加强前端混淆**: 对 `security.js` 进行代码混淆
4. **实施CAPTCHA**: 对可疑用户要求验证码
5. **IP信誉系统**: 集成第三方IP威胁情报
6. **模型级防护**: 在AI模型层面添加系统指令加固

---

## 老韩の安全箴言

> "前端数据99.9%可篡改，剩下的0.1%是因为攻击者还没动手。"

> "我的屎山能跑就是胜利，安全就是加个锁防君子不防小人。但小人来了，我有后手。"

> "记住：安全没有100%，但要让攻击者觉得你这坨屎山不值得花时间。"
