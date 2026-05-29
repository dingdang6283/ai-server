#!/usr/bin/env python3
"""
双因素认证（2FA）实现
基于 TOTP（Time-based One-Time Password）算法
"""

import pyotp
import base64
import qrcode
import io
from flask import session, request, jsonify

two_fa_patch = '''
# ==================== 双因素认证（2FA） ====================

# 2FA 配置
TWO_FA_ISSUER = "DingDang Cloud"  # 发行者名称
TWO_FA_DIGITS = 6  # OTP 位数
TWO_FA_INTERVAL = 30  # OTP 有效期（秒）
TWO_FA_WINDOW = 1  # 允许的时间窗口（前后各 1 个）

def generate_2fa_secret(user_email):
    """为用户生成 2FA 密钥"""
    secret = pyotp.random_base32()
    
    # 将密钥存储到数据库
    conn = get_db()
    conn.execute(
        "UPDATE users SET two_fa_secret = ? WHERE email = ?",
        (secret, user_email)
    )
    conn.commit()
    conn.close()
    
    return secret


def get_2fa_provisioning_uri(user_email, secret):
    """生成 2FA 配置 URI（用于生成二维码）"""
    totp = pyotp.TOTP(secret, digits=TWO_FA_DIGITS, interval=TWO_FA_INTERVAL)
    return totp.provisioning_uri(
        name=user_email,
        issuer_name=TWO_FA_ISSUER
    )


def generate_2fa_qr_code(provisioning_uri):
    """生成 2FA 配置二维码"""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_L,
        box_size=10,
        border=2,
    )
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="black", back_color="white")
    
    # 转换为 base64 用于前端显示
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_str = base64.b64encode(buffered.getvalue()).decode()
    
    return f"data:image/png;base64,{img_str}"


def verify_2fa_token(secret, token):
    """验证 2FA 令牌"""
    if not secret or not token:
        return False
    
    totp = pyotp.TOTP(secret, digits=TWO_FA_DIGITS, interval=TWO_FA_INTERVAL)
    
    # 允许前后 1 个时间窗口的误差
    return totp.verify(token, valid_window=TWO_FA_WINDOW)


def require_2fa(f):
    """2FA 验证装饰器"""
    @wraps(f)
    def decorated(*args, **kwargs):
        # 检查用户是否启用了 2FA
        user_id = getattr(request, 'current_user', {}).get('id')
        if not user_id:
            return json_response({"error": "认证失败，请检查您的 Token"}, 401)
        
        conn = get_db()
        user = conn.execute(
            "SELECT two_fa_enabled, two_fa_secret FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()
        conn.close()
        
        if not user:
            return json_response({"error": "用户不存在"}, 404)
        
        # 如果用户启用了 2FA，需要验证
        if user['two_fa_enabled']:
            two_fa_verified = session.get('two_fa_verified', False)
            two_fa_user_id = session.get('two_fa_user_id')
            
            if not two_fa_verified or two_fa_user_id != user_id:
                return json_response({
                    "error": "需要双因素认证",
                    "requires_2fa": True
                }, 403)
        
        return f(*args, **kwargs)
    return decorated


@app.route('/api/user/2fa/setup', methods=['POST'])
@require_auth
def setup_2fa():
    """设置 2FA"""
    user = request.current_user
    user_email = user.get('email')
    
    # 生成密钥
    secret = generate_2fa_secret(user_email)
    
    # 生成配置 URI 和二维码
    provisioning_uri = get_2fa_provisioning_uri(user_email, secret)
    qr_code = generate_2fa_qr_code(provisioning_uri)
    
    # 临时存储密钥（等待用户确认）
    session['two_fa_pending_secret'] = secret
    session['two_fa_pending_user'] = user_email
    
    return json_response({
        "secret": secret,
        "provisioning_uri": provisioning_uri,
        "qr_code": qr_code,
        "instructions": "请使用 Google Authenticator 或其他 TOTP 应用扫描二维码"
    })


@app.route('/api/user/2fa/verify-setup', methods=['POST'])
@require_auth
def verify_2fa_setup():
    """验证 2FA 设置"""
    data = request.get_json()
    token = data.get('token', '').strip()
    
    user = request.current_user
    user_email = user.get('email')
    
    # 获取临时存储的密钥
    secret = session.get('two_fa_pending_secret')
    if not secret:
        return json_response({"error": "请先发起 2FA 设置"}, 400)
    
    # 验证令牌
    if verify_2fa_token(secret, token):
        # 启用 2FA
        conn = get_db()
        conn.execute(
            "UPDATE users SET two_fa_enabled = 1, two_fa_secret = ? WHERE email = ?",
            (secret, user_email)
        )
        conn.commit()
        conn.close()
        
        # 清除临时存储
        session.pop('two_fa_pending_secret', None)
        session.pop('two_fa_pending_user', None)
        
        # 标记当前会话已验证 2FA
        session['two_fa_verified'] = True
        session['two_fa_user_id'] = request.current_user.get('id')
        
        log_user_action(request.current_user, 'enable_2fa', 'user', request.current_user.get('id'))
        
        return json_response({
            "message": "2FA 已成功启用",
            "backup_codes": generate_backup_codes()  # 生成备用码
        })
    else:
        return json_response({"error": "验证码无效，请重试"}, 400)


@app.route('/api/user/2fa/disable', methods=['POST'])
@require_auth
def disable_2fa():
    """禁用 2FA"""
    data = request.get_json()
    token = data.get('token', '').strip()
    password = data.get('password', '').strip()
    
    user = request.current_user
    user_id = user.get('id')
    user_email = user.get('email')
    
    # 验证密码
    conn = get_db()
    user_data = conn.execute(
        "SELECT password_hash, two_fa_secret FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    
    if not user_data or not check_password(password, user_data['password_hash']):
        conn.close()
        return json_response({"error": "密码错误"}, 401)
    
    # 验证当前 2FA 令牌
    if not verify_2fa_token(user_data['two_fa_secret'], token):
        conn.close()
        return json_response({"error": "验证码错误"}, 401)
    
    # 禁用 2FA
    conn.execute(
        "UPDATE users SET two_fa_enabled = 0, two_fa_secret = NULL WHERE id = ?",
        (user_id,)
    )
    conn.commit()
    conn.close()
    
    # 清除会话
    session.pop('two_fa_verified', None)
    session.pop('two_fa_user_id', None)
    
    log_user_action(user, 'disable_2fa', 'user', user_id)
    
    return json_response({"message": "2FA 已成功禁用"})


@app.route('/api/user/2fa/status', methods=['GET'])
@require_auth
def get_2fa_status():
    """获取 2FA 状态"""
    user = request.current_user
    user_id = user.get('id')
    
    conn = get_db()
    user_data = conn.execute(
        "SELECT two_fa_enabled FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()
    
    return json_response({
        "enabled": bool(user_data['two_fa_enabled']),
        "setup_required": not bool(user_data['two_fa_enabled'])
    })


@app.route('/api/auth/login', methods=['POST'])
def login_with_2fa():
    """支持 2FA 的登录接口"""
    data = request.get_json()
    account = (data.get('account') or '').strip()
    password = (data.get('password') or '').strip()
    two_fa_token = data.get('two_fa_token', '').strip()
    
    if not account or not password:
        return json_response({"error": "请提供账号和密码"}, 400)
    
    client_ip = get_client_ip()
    
    # 基于 IP 的频率限制
    ip_login_error_key = f'ip_login_error:{client_ip}'
    if not check_rate_limit(ip_login_error_key, max_requests=10, window_seconds=60):
        time.sleep(random.uniform(1.0, 2.0))
        return json_response({"error": "请求频率过快，请稍后再试"}, 429)
    
    # 验证账号密码
    conn = get_db()
    user = None
    if '@' in account:
        user = conn.execute(
            "SELECT * FROM users WHERE email = ? AND is_active = 1",
            (account,)
        ).fetchone()
    else:
        user = conn.execute(
            "SELECT * FROM users WHERE username = ? AND is_active = 1",
            (account,)
        ).fetchone()
    
    if not user or not check_password(password, user['password_hash']):
        # 记录错误尝试
        record_login_error(client_ip, account)
        conn.close()
        time.sleep(random.uniform(1.0, 2.0))
        return json_response({"error": "邮箱/用户名或密码错误"}, 401)
    
    # 检查是否启用了 2FA
    if user['two_fa_enabled']:
        if not two_fa_token:
            conn.close()
            # 需要 2FA 验证
            return json_response({
                "error": "需要双因素认证",
                "requires_2fa": True,
                "user_id": user['id']
            }, 403)
        
        # 验证 2FA 令牌
        if not verify_2fa_token(user['two_fa_secret'], two_fa_token):
            record_login_error(client_ip, account)
            conn.close()
            return json_response({"error": "双因素认证失败"}, 401)
    
    # 登录成功
    update_last_login(user['id'], client_ip)
    conn.close()
    
    # 生成 Token
    token = generate_api_token(user['id'])
    
    log_user_action(dict(user), 'login', 'user', user['id'])
    
    return json_response({
        "token": token,
        "user": {
            "id": user['id'],
            "email": user['email'],
            "username": user['username'],
            "two_fa_enabled": bool(user['two_fa_enabled'])
        }
    })


def generate_backup_codes(count=10):
    """生成备用验证码"""
    import random
    import string
    
    codes = []
    for _ in range(count):
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
        codes.append(code)
    
    # 存储备用码到数据库（加密）
    # 这里简化处理，实际应该加密存储
    
    return codes


# 数据库迁移：添加 2FA 相关字段
def migrate_2fa_schema():
    """迁移数据库架构以支持 2FA"""
    conn = get_db()
    
    # 检查字段是否存在
    columns = conn.execute("PRAGMA table_info(users)").fetchall()
    column_names = [col[1] for col in columns]
    
    if 'two_fa_enabled' not in column_names:
        conn.execute("ALTER TABLE users ADD COLUMN two_fa_enabled INTEGER DEFAULT 0")
        logger.info("添加 two_fa_enabled 字段")
    
    if 'two_fa_secret' not in column_names:
        conn.execute("ALTER TABLE users ADD COLUMN two_fa_secret TEXT")
        logger.info("添加 two_fa_secret 字段")
    
    if 'two_fa_backup_codes' not in column_names:
        conn.execute("ALTER TABLE users ADD COLUMN two_fa_backup_codes TEXT")
        logger.info("添加 two_fa_backup_codes 字段")
    
    conn.commit()
    conn.close()
    logger.info("2FA 数据库迁移完成")

# 启动时执行迁移
try:
    migrate_2fa_schema()
except Exception as e:
    logger.error(f"2FA 迁移失败：{e}")

'''

# 将 2FA 代码写入 server.py
with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 在文件末尾添加 2FA 代码
if '双因素认证' not in content:
    # 找到文件末尾（在 if __name__ == '__main__' 之前）
    if "if __name__ == '__main__':" in content:
        parts = content.split("if __name__ == '__main__':")
        content = parts[0] + two_fa_patch + "\nif __name__ == '__main__':" + parts[1]
    else:
        content += "\n" + two_fa_patch
    
    with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("双因素认证（2FA）已添加")
else:
    print("双因素认证（2FA）已存在")
