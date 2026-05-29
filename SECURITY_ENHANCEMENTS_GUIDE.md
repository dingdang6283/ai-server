# 安全增强功能安装和使用指南

## 概述

本次安全增强包括以下功能：

1. **多种 IP 封禁方式** - 禁止访问/断开连接/重定向
2. **6 位字母数字混合验证码** - 提升验证码强度
3. **前端代码混淆** - 增加反编译难度
4. **API 版本控制** - 支持多版本 API 共存
5. **双因素认证（2FA）** - 基于 TOTP 的安全认证

---

## 1. 多种 IP 封禁方式

### 功能说明

系统现在支持三种 IP 封禁方式：

| 封禁类型 | 描述 | 使用场景 |
|---------|------|---------|
| `block` | 返回 403 禁止访问 | 默认方式，适用于大多数情况 |
| `drop` | 断开连接（无响应） | 针对频繁请求的爬虫 |
| `redirect` | 重定向到警告页面 | 需要显示警告信息的场景 |

### 自动封禁策略

系统会根据错误类型自动选择封禁方式：

- **429 (请求过于频繁)** → `drop` 模式（直接断开）
- **401/403 (认证/权限错误)** → `block` 模式（返回 403）
- **其他错误** → `block` 模式（默认）

### 手动封禁 API

管理员可以通过 API 手动封禁 IP 并指定封禁类型：

```bash
POST /api/admin/ip-bans
Content-Type: application/json
Authorization: Bearer <admin_token>

{
  "ip_address": "192.168.1.100",
  "reason": "恶意攻击",
  "ban_type": "drop",  // block | drop | redirect
  "expires_at": "2026-05-30 12:00:00"
}
```

### 封禁响应示例

**Block 模式：**
```json
{
  "error": "您的 IP 已被封禁",
  "reason": "频繁异常请求",
  "expires_at": "2026-05-29 12:05:00"
}
```

**Redirect 模式：**
```
HTTP/1.1 302 Found
Location: /warning?reason=频繁异常请求&expires=2026-05-29 12:05:00
```

---

## 2. 6 位字母数字混合验证码

### 升级说明

验证码已从 4 位纯数字升级为 6 位字母数字混合：

- **字符集**：`a-zA-Z0-9`（62 个字符）
- **长度**：6 位
- **复杂度**：62^6 ≈ 56 万亿种组合
- **有效期**：5 分钟
- **最大尝试次数**：3 次

### 安全性对比

| 类型 | 组合数 | 暴力破解成本 |
|------|--------|-------------|
| 4 位数字 | 10,000 | 极低 |
| 6 位字母数字 | 56,800,235,584 | 极高 |

### 前端集成示例

```javascript
// 请求验证码
async function requestCaptcha() {
  const response = await fetch('/api/captcha', {
    method: 'GET'
  });
  
  const data = await response.json();
  
  // 显示验证码图片
  document.getElementById('captcha-img').src = data.image;
  document.getElementById('captcha-id').value = data.id;
}

// 验证时提交 6 位验证码
async function verifyCaptcha(captchaId, code) {
  const response = await fetch('/api/captcha/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      captcha_id: captchaId,
      code: code  // 6 位字母数字
    })
  });
  
  return await response.json();
}
```

---

## 3. 前端代码混淆和反编译增强

### 安装依赖

```bash
cd /media/dingdang/NAS/ai/frontend
npm install --save-dev vite-obfuscator vite-plugin-compression
```

### 使用安全配置

**方式一：使用安全配置文件**

```bash
# 使用安全配置文件构建
npx vite build --config vite.security.config.js
```

**方式二：修改现有配置**

将 `vite.security.config.js` 中的配置合并到 `vite.config.ts`：

```typescript
import { viteObfuscate } from 'vite-obfuscator'
import compression from 'vite-plugin-compression'

export default defineConfig({
  plugins: [
    vue(),
    viteObfuscate({
      enable: true,
      options: {
        compact: true,
        controlFlowFlattening: true,
        deadCodeInjection: true,
        debugProtection: true,
        disableConsoleOutput: true,
        identifierNamesGenerator: 'mangled',
        rotateStringArray: true,
        selfDefending: true,
        shuffleStringArray: true,
        splitStrings: true,
        transformObjectKeys: true,
        unicodeEscapeSequence: true,
      }
    }),
    compression({ algorithm: 'brotliCompress' }),
  ],
  build: {
    sourcemap: false,  // 禁用源码映射
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      format: { comments: false }
    }
  }
})
```

### 混淆效果

混淆后的代码特点：

1. **变量名混淆**：`userData` → `_0x5a2b`
2. **字符串加密**：`"password"` → `"\x70\x61\x73\x73\x77\x6f\x72\x64"`
3. **控制流平坦化**：打乱代码执行顺序
4. **死代码注入**：添加无用代码增加分析难度
5. **调试保护**：检测到调试器时自动崩溃
6. **禁用控制台**：`console.log` 被禁用

### 构建命令

```bash
# 生产环境构建
npm run build

# 查看构建结果
ls -lh dist/assets/
```

---

## 4. API 版本控制

### 功能说明

支持多版本 API 共存，便于渐进式升级：

- **当前版本**：v1（默认）
- **支持版本**：v1, v2
- **废弃版本**：可标记旧版本为废弃

### 使用方式

**方式一：URL 路径**

```bash
# v1 API
GET /api/v1/user/profile

# v2 API
GET /api/v2/user/profile
```

**方式二：请求头**

```bash
GET /api/user/profile
X-API-Version: v2
```

### 版本信息端点

```bash
GET /api/version
```

响应：

```json
{
  "current_version": "v1",
  "supported_versions": ["v1", "v2"],
  "deprecated_versions": [],
  "default_version": "v1",
  "version_stats": {
    "v1": 1234,
    "v2": 56
  }
}
```

### 版本迁移示例

**v1 → v2 数据格式变化：**

```javascript
// v1 (蛇形命名)
{
  "user_id": 123,
  "api_key": "abc123"
}

// v2 (驼峰命名)
{
  "userId": 123,
  "apiKey": "abc123"
}
```

### 装饰器使用

```python
@app.route('/api/user/profile', methods=['GET'])
@api_version_required(['v1', 'v2'])
def get_user_profile():
    version = request.api_version
    # 根据版本返回不同格式的数据
```

---

## 5. 双因素认证（2FA）

### 功能说明

基于 TOTP（Time-based One-Time Password）的双因素认证：

- **算法**：TOTP (RFC 6238)
- **OTP 长度**：6 位数字
- **有效期**：30 秒
- **时间窗口**：±1 个窗口（容忍时间误差）
- **兼容应用**：Google Authenticator, Authy, Microsoft Authenticator

### 安装依赖

```bash
# Python 依赖已安装
pip3 install pyotp qrcode[pil]
```

### 数据库迁移

系统会自动添加以下字段到 `users` 表：

```sql
ALTER TABLE users ADD COLUMN two_fa_enabled INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN two_fa_secret TEXT;
ALTER TABLE users ADD COLUMN two_fa_backup_codes TEXT;
```

### 用户端 API

#### 1. 检查 2FA 状态

```bash
GET /api/user/2fa/status
Authorization: Bearer <token>
```

响应：

```json
{
  "enabled": false,
  "setup_required": true
}
```

#### 2. 设置 2FA

```bash
POST /api/user/2fa/setup
Authorization: Bearer <token>
```

响应：

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "provisioning_uri": "otpauth://totp/DingDang%20Cloud:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=DingDang%20Cloud",
  "qr_code": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
  "instructions": "请使用 Google Authenticator 或其他 TOTP 应用扫描二维码"
}
```

#### 3. 验证并启用 2FA

```bash
POST /api/user/2fa/verify-setup
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "123456"  // 从 Authenticator 应用获取的 6 位代码
}
```

响应：

```json
{
  "message": "2FA 已成功启用",
  "backup_codes": [
    "A1B2C3D4",
    "E5F6G7H8",
    "I9J0K1L2"
  ]
}
```

#### 4. 禁用 2FA

```bash
POST /api/user/2fa/disable
Authorization: Bearer <token>
Content-Type: application/json

{
  "token": "123456",  // 当前 2FA 令牌
  "password": "your_password"  // 确认密码
}
```

#### 5. 登录时支持 2FA

```bash
POST /api/auth/login
Content-Type: application/json

{
  "account": "user@example.com",
  "password": "password123",
  "two_fa_token": "123456"  // 如果启用了 2FA，需要提供此字段
}
```

**需要 2FA 的响应：**

```json
{
  "error": "需要双因素认证",
  "requires_2fa": true,
  "user_id": 123
}
```

### 前端集成示例

```javascript
// 设置 2FA
async function setup2FA() {
  const response = await fetch('/api/user/2fa/setup', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  // 显示二维码
  document.getElementById('qr-code').src = data.qr_code;
  document.getElementById('secret').textContent = data.secret;
}

// 验证并启用 2FA
async function enable2FA(code) {
  const response = await fetch('/api/user/2fa/verify-setup', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token: code })
  });
  
  const data = await response.json();
  
  if (response.ok) {
    alert('2FA 已启用！请保存备用验证码：' + data.backup_codes.join(', '));
  } else {
    alert('验证失败：' + data.error);
  }
}

// 登录时处理 2FA
async function login(account, password, twoFAToken = null) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password, two_fa_token: twoFAToken })
  });
  
  const data = await response.json();
  
  if (data.requires_2fa) {
    // 显示 2FA 输入框
    const code = prompt('请输入双因素认证代码：');
    return login(account, password, code);
  }
  
  return data;
}
```

### 备用验证码

启用 2FA 时会生成 10 个备用验证码，用于：

- 手机丢失时恢复账户
- Authenticator 应用故障时应急

**重要提示用户：**
- ✅ 将备用码打印或抄写保存
- ✅ 存放在安全的地方
- ❌ 不要截图保存在手机上
- ❌ 不要分享给他人

---

## 6. 安全建议

### 管理员配置建议

1. **IP 封禁策略**
   - 对爬虫使用 `drop` 模式
   - 对恶意攻击使用 `block` + 长封禁时间
   - 对内部错误使用 `redirect` 到警告页面

2. **2FA 推广**
   - 强制管理员账户启用 2FA
   - 鼓励普通用户启用 2FA
   - 提供备用码下载功能

3. **API 版本管理**
   - 新功能和改进在 v2 版本实现
   - 提前 3 个月通知 v1 版本废弃
   - 监控各版本使用情况

### 用户安全建议

1. **启用 2FA**
   - 所有管理员必须启用
   - 普通用户强烈建议启用

2. **保存备用码**
   - 打印并保存在安全地方
   - 不要存储在电子设备上

3. **验证码安全**
   - 6 位验证码更复杂，请注意区分大小写
   - 5 分钟内有效，请尽快使用

---

## 7. 故障排除

### 常见问题

**Q: 2FA 设置后无法验证？**
A: 检查设备时间是否同步，TOTP 依赖准确的时间。

**Q: 验证码一直提示错误？**
A: 6 位验证码区分大小写，请确保正确输入。

**Q: 前端混淆后调试困难？**
A: 开发环境不要启用混淆，只在生产环境使用。

**Q: API 版本不匹配？**
A: 检查请求头 `X-API-Version` 或 URL 路径。

### 日志查看

```bash
# 查看 2FA 相关日志
grep "2FA" /var/log/dingdang_cloud.log

# 查看 IP 封禁日志
grep "IP banned" /var/log/dingdang_cloud.log

# 查看 API 版本使用
grep "API version" /var/log/dingdang_cloud.log
```

---

## 8. 更新历史

### v2.1.0 (2026-05-29)

- ✅ 新增多种 IP 封禁方式
- ✅ 升级为 6 位字母数字混合验证码
- ✅ 实现前端代码混淆
- ✅ 实现 API 版本控制
- ✅ 实现双因素认证（2FA）

---

## 9. 技术支持

如有问题，请联系：

- 📧 技术支持邮箱：support@ai-dingdang.fucku.top
- 📱 Telegram: @dingdang_cloud_support
- 🌐 文档：https://docs.ai-dingdang.fucku.top

---

*最后更新日期：2026-05-29*
*文档版本：v2.1.0*
