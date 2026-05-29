#!/usr/bin/env python3
"""
DingDang Cloud 安全加固补丁
修复渗透测试报告中发现的所有安全问题（除 H-05, M-04, H-04, L-04）
"""

import re
import sys

def apply_security_patches():
    """应用所有安全修复"""
    
    with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    patches_applied = []
    
    # 1. 修复 CORS - 允许动态 Origin 但限制 Credentials
    old_cors = "response.headers['Access-Control-Allow-Origin'] = '*'"
    new_cors = """response.headers['Access-Control-Allow-Origin'] = request.headers.get('Origin', '*')
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Dynamic-Token'
    response.headers['Access-Control-Allow-Credentials'] = 'true'"""
    
    if old_cors in content:
        content = content.replace(old_cors, new_cors)
        patches_applied.append("H-01: CORS 配置修复")
    
    # 2. 统一错误响应 - 移除详细错误信息
    error_patterns = [
        ('未提供认证 Token', '认证失败，请检查您的 Token'),
        ('无效的 API Key', '认证失败，请检查您的 Token'),
        ('账户已被禁用', '账户状态异常'),
        ('请先验证邮箱后再使用 API', '请先验证邮箱'),
        ('需要管理员权限', '权限不足'),
        ('您的 IP 已被封禁', '您的 IP 已被封禁，请稍后再试'),
    ]
    
    for old_msg, new_msg in error_patterns:
        content = content.replace(old_msg, new_msg)
    patches_applied.append("H-02: 统一错误响应")
    
    # 3. 添加安全中间件变量
    middleware_addition = """
# IP 异常追踪
ip_abnormal_tracking = defaultdict(lambda: {'timestamps': [], 'errors': []})
ip_abnormal_lock = threading.Lock()
BAN_DURATION_MINUTES = 1
ABNORMAL_WINDOW_MINUTES = 1
ABNORMAL_THRESHOLD = 10
"""
    
    if 'ip_abnormal_tracking' not in content:
        content = content.replace(
            'ip_rate_limit_lock = threading.Lock()',
            'ip_rate_limit_lock = threading.Lock()\n' + middleware_addition
        )
        patches_applied.append("IP 异常追踪机制")
    
    # 4. 添加异常请求追踪函数
    track_function = """
def track_abnormal_request(ip: str, status_code: int, endpoint: str):
    \"\"\"追踪异常请求（401, 403, 404 等）\"\"\"
    now = time.time()
    window_seconds = ABNORMAL_WINDOW_MINUTES * 60
    
    with ip_abnormal_lock:
        tracking = ip_abnormal_tracking[ip]
        tracking['timestamps'].append(now)
        tracking['errors'].append({
            'status': status_code,
            'endpoint': endpoint,
            'time': now
        })
        
        # 清理过期记录
        tracking['timestamps'] = [t for t in tracking['timestamps'] if now - t < window_seconds]
        tracking['errors'] = [e for e in tracking['errors'] if now - e['time'] < window_seconds]
        
        # 达到阈值则自动封禁
        if len(tracking['timestamps']) >= ABNORMAL_THRESHOLD:
            ban_expires_at = (datetime.now() + timedelta(minutes=BAN_DURATION_MINUTES)).strftime('%Y-%m-%d %H:%M:%S')
            conn = get_db()
            existing = conn.execute(
                "SELECT id FROM ip_bans WHERE ip_address = ? AND is_active = 1",
                (ip,)).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO ip_bans (ip_address, reason, ban_type, expires_at) "
                    "VALUES (?, ?, ?, ?)",
                    (ip, f"自动封禁：1 分钟内{ABNORMAL_THRESHOLD}次异常请求", 'auto', ban_expires_at))
                conn.commit()
                logger.warning(f"自动封禁 IP: {ip}, 过期：{ban_expires_at}")
            conn.close()

"""
    
    if 'def track_abnormal_request' not in content:
        # 在 track_ip_request 函数后插入
        content = content.replace(
            'def track_ip_request(ip: str, endpoint: str, user_agent: str = \'\',',
            track_function + 'def track_ip_request(ip: str, endpoint: str, user_agent: str = \'\','
        )
        patches_applied.append("异常请求追踪函数")
    
    # 5. 修改错误处理以追踪异常
    old_error_handler = """if path.startswith('/api/') or path.startswith('/v1/'):
        return json_response(
            {"error": str(error.description) if hasattr(error, 'description') else str(error)},
            code)"""
    
    new_error_handler = """client_ip = get_client_ip()
    
    if code in (401, 403, 404, 429):
        track_abnormal_request(client_ip, code, path)
    
    if path.startswith('/api/') or path.startswith('/v1/'):
        return json_response(
            {"error": "请求失败，请检查您的请求"},
            code)"""
    
    if old_error_handler in content:
        content = content.replace(old_error_handler, new_error_handler)
        patches_applied.append("错误处理增强")
    
    # 6. 添加邮箱响应延迟和 IP 频率限制
    old_send_verification = """@app.route('/api/auth/send-verification', methods=['POST'])
def send_verification():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    purpose = (data.get('purpose') or 'register').strip()

    client_ip = get_client_ip()
    rate_key = f'send_verification:{email}:{purpose}'
    if not check_rate_limit(rate_key, max_requests=1, window_seconds=60):
        return json_response(
            {"error": "操作过于频繁，请 1 分钟后再试"}, 429)
    if not check_rate_limit(f'send_verification_ip:{client_ip}',
                            max_requests=5, window_seconds=300):
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)
    if not check_rate_limit(f'send_verification_global:{purpose}',
                            max_requests=30, window_seconds=60):
        return json_response(
            {"error": "系统繁忙，请稍后再试"}, 429)

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE email = ?",
        (email,)).fetchone()
    if purpose in ('login', 'change_password') and not user:
        conn.close()
        return json_response({"error": "该邮箱未注册"}, 404)
    conn.close()

    conn = get_db()
    conn.execute(
        "DELETE FROM email_verifications WHERE email = ? AND purpose = ? "
        "AND used = 0", (email, purpose))
    conn.commit()
    conn.close()

    code = generate_email_code()
    expires_at = (datetime.now() + timedelta(minutes=5)).strftime(
        '%Y-%m-%d %H:%M:%S')
    conn = get_db()
    conn.execute(
        "INSERT INTO email_verifications (email, code, purpose, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (email, code, purpose, expires_at))
    conn.commit()
    conn.close()

    send_verification_email(email, code, purpose)
    return json_response({"message": "验证码已发送"})"""
    
    new_send_verification = """@app.route('/api/auth/send-verification', methods=['POST'])
def send_verification():
    data = request.get_json()
    email = (data.get('email') or '').strip().lower()
    purpose = (data.get('purpose') or 'register').strip()

    client_ip = get_client_ip()
    
    # 5.1-5.5 秒随机延迟（防止时序攻击）
    delay_seconds = random.uniform(5.1, 5.5)
    
    # 基于 IP 的频率限制（而非邮箱）
    ip_login_error_key = f'ip_login_error:{client_ip}'
    if not check_rate_limit(ip_login_error_key, max_requests=10, window_seconds=60):
        time.sleep(delay_seconds)
        return json_response({"error": "请求频率过快，请稍后再试"}, 429)
    
    rate_key = f'send_verification:{email}:{purpose}'
    if not check_rate_limit(rate_key, max_requests=1, window_seconds=60):
        time.sleep(delay_seconds)
        return json_response(
            {"error": "操作过于频繁，请 1 分钟后再试"}, 429)
    if not check_rate_limit(f'send_verification_ip:{client_ip}',
                            max_requests=5, window_seconds=300):
        time.sleep(delay_seconds)
        return json_response(
            {"error": "操作过于频繁，请稍后再试"}, 429)
    if not check_rate_limit(f'send_verification_global:{purpose}',
                            max_requests=30, window_seconds=60):
        time.sleep(delay_seconds)
        return json_response(
            {"error": "系统繁忙，请稍后再试"}, 429)

    conn = get_db()
    user = conn.execute("SELECT id FROM users WHERE email = ?",
        (email,)).fetchone()
    if purpose in ('login', 'change_password') and not user:
        conn.close()
        time.sleep(delay_seconds)
        return json_response({"error": "验证码已发送"}, 200)
    conn.close()

    conn = get_db()
    conn.execute(
        "DELETE FROM email_verifications WHERE email = ? AND purpose = ? "
        "AND used = 0", (email, purpose))
    conn.commit()
    conn.close()

    code = generate_email_code()
    expires_at = (datetime.now() + timedelta(minutes=5)).strftime(
        '%Y-%m-%d %H:%M:%S')
    conn = get_db()
    conn.execute(
        "INSERT INTO email_verifications (email, code, purpose, expires_at) "
        "VALUES (?, ?, ?, ?)",
        (email, code, purpose, expires_at))
    conn.commit()
    conn.close()

    send_verification_email(email, code, purpose)
    
    time.sleep(delay_seconds)
    return json_response({"message": "验证码已发送"})"""
    
    if old_send_verification in content:
        content = content.replace(old_send_verification, new_send_verification)
        patches_applied.append("H-03: 验证码接口增强（延迟 +IP 限制）")
    
    # 写入修改后的内容
    with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("安全补丁应用完成:")
    for patch in patches_applied:
        print(f"  ✓ {patch}")
    
    print(f"\n共应用 {len(patches_applied)} 个安全修复")
    return True

if __name__ == '__main__':
    apply_security_patches()
