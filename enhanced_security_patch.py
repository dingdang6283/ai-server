#!/usr/bin/env python3
"""
安全增强补丁：
1. 增加 IP 封禁方式（禁止访问/断开连接/重定向）
2. 实现 6 位字母数字混合验证码
"""

import re

def apply_enhanced_security():
    with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
        content = f.read()
    
    enhancements = []
    
    # 1. 添加 IP 封禁类型常量
    ban_types_constant = """
# IP 封禁类型
BAN_TYPE_BLOCK = 'block'  # 返回 403
BAN_TYPE_DROP = 'drop'    # 断开连接（无响应）
BAN_TYPE_REDIRECT = 'redirect'  # 重定向到警告页面
"""
    
    if 'BAN_TYPE_BLOCK' not in content:
        content = content.replace(
            'ABNORMAL_THRESHOLD = 10',
            'ABNORMAL_THRESHOLD = 10\n' + ban_types_constant
        )
        enhancements.append("添加 IP 封禁类型常量")
    
    # 2. 增强 check_ip_banned 函数返回封禁类型
    old_check_ip_banned = '''def check_ip_banned(ip: str) -> bool:
    conn = get_db()
    ban = conn.execute(
        "SELECT id FROM ip_bans WHERE ip_address = ? AND is_active = 1 "
        "AND (expires_at IS NULL OR expires_at > datetime('now', 'localtime'))",
        (ip,)).fetchone()
    conn.close()
    return ban is not None'''
    
    new_check_ip_banned = '''def check_ip_banned(ip: str) -> tuple:
    """检查 IP 是否被封禁，返回 (是否封禁，封禁类型，封禁原因，过期时间)"""
    conn = get_db()
    ban = conn.execute(
        "SELECT ban_type, reason, expires_at FROM ip_bans WHERE ip_address = ? AND is_active = 1 "
        "AND (expires_at IS NULL OR expires_at > datetime('now', 'localtime'))",
        (ip,)).fetchone()
    conn.close()
    if ban:
        return (True, ban['ban_type'], ban['reason'], ban['expires_at'])
    return (False, None, None, None)'''
    
    if old_check_ip_banned in content:
        content = content.replace(old_check_ip_banned, new_check_ip_banned)
        enhancements.append("增强 check_ip_banned 返回封禁详情")
    
    # 3. 修改 IP 封禁检查中间件以支持多种封禁类型
    old_check_middleware = '''@app.before_request
def check_global_ip_rate_and_ban():
    client_ip = get_client_ip()
    if client_ip == '0.0.0.0':
        return None
    if check_ip_banned(client_ip):
        return json_response({"error": "您的 IP 已被封禁，请稍后再试"}, 403)
    if not check_ip_rate_limit(client_ip, max_requests=120, window_seconds=60):
        return json_response({"error": "请求过于频繁，系统已限制"}, 429)
    endpoint = request.path
    if endpoint.startswith('/api/') or endpoint.startswith('/v1/'):
        ua = request.headers.get('User-Agent', '')
        track_ip_request(client_ip, endpoint, ua)
    return None'''
    
    new_check_middleware = '''@app.before_request
def check_global_ip_rate_and_ban():
    client_ip = get_client_ip()
    if client_ip == '0.0.0.0':
        return None
    
    is_banned, ban_type, ban_reason, expires_at = check_ip_banned(client_ip)
    if is_banned:
        # 根据封禁类型采取不同措施
        if ban_type == BAN_TYPE_DROP:
            # 断开连接（无响应）
            from flask import abort
            abort(444)  # Nginx 特有的关闭连接状态码
        elif ban_type == BAN_TYPE_REDIRECT:
            # 重定向到警告页面
            from flask import redirect
            return redirect(f'/warning?reason={ban_reason}&expires={expires_at}')
        else:
            # 默认：返回 403 禁止访问
            return json_response({
                "error": "您的 IP 已被封禁",
                "reason": ban_reason,
                "expires_at": expires_at
            }, 403)
    
    if not check_ip_rate_limit(client_ip, max_requests=120, window_seconds=60):
        return json_response({"error": "请求过于频繁，系统已限制"}, 429)
    endpoint = request.path
    if endpoint.startswith('/api/') or endpoint.startswith('/v1/'):
        ua = request.headers.get('User-Agent', '')
        track_ip_request(client_ip, endpoint, ua)
    return None'''
    
    if old_check_middleware in content:
        content = content.replace(old_check_middleware, new_check_middleware)
        enhancements.append("实现多种 IP 封禁处理方式")
    
    # 4. 修改自动封禁函数以支持封禁类型参数
    old_track_function = '''def track_abnormal_request(ip: str, status_code: int, endpoint: str):
    """追踪异常请求（401, 403, 404 等）"""
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
        
        tracking['timestamps'] = [t for t in tracking['timestamps'] if now - t < window_seconds]
        tracking['errors'] = [e for e in tracking['errors'] if now - e['time'] < window_seconds]
        
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
                
                try:
                    socketio.emit('ip_banned', {
                        'reason': '频繁异常请求',
                        'duration_minutes': BAN_DURATION_MINUTES,
                        'expires_at': ban_expires_at
                    }, room=ip)
                except Exception:
                    pass
            conn.close()'''
    
    new_track_function = '''def track_abnormal_request(ip: str, status_code: int, endpoint: str):
    """追踪异常请求（401, 403, 404 等）"""
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
        
        tracking['timestamps'] = [t for t in tracking['timestamps'] if now - t < window_seconds]
        tracking['errors'] = [e for e in tracking['errors'] if now - e['time'] < window_seconds]
        
        if len(tracking['timestamps']) >= ABNORMAL_THRESHOLD:
            ban_expires_at = (datetime.now() + timedelta(minutes=BAN_DURATION_MINUTES)).strftime('%Y-%m-%d %H:%M:%S')
            conn = get_db()
            existing = conn.execute(
                "SELECT id FROM ip_bans WHERE ip_address = ? AND is_active = 1",
                (ip,)).fetchone()
            if not existing:
                # 根据错误类型选择封禁方式
                if status_code == 429:
                    ban_type = BAN_TYPE_DROP  # 频繁请求直接断开
                elif status_code in (401, 403):
                    ban_type = BAN_TYPE_BLOCK  # 认证错误返回 403
                else:
                    ban_type = BAN_TYPE_BLOCK  # 默认返回 403
                
                conn.execute(
                    "INSERT INTO ip_bans (ip_address, reason, ban_type, expires_at) "
                    "VALUES (?, ?, ?, ?)",
                    (ip, f"自动封禁：1 分钟内{ABNORMAL_THRESHOLD}次异常请求", ban_type, ban_expires_at))
                conn.commit()
                logger.warning(f"自动封禁 IP: {ip}, 类型：{ban_type}, 过期：{ban_expires_at}")
                
                try:
                    socketio.emit('ip_banned', {
                        'reason': '频繁异常请求',
                        'ban_type': ban_type,
                        'duration_minutes': BAN_DURATION_MINUTES,
                        'expires_at': ban_expires_at
                    }, room=ip)
                except Exception:
                    pass
            conn.close()'''
    
    if old_track_function in content:
        content = content.replace(old_track_function, new_track_function)
        enhancements.append("根据错误类型自动选择封禁方式")
    
    # 5. 增强验证码生成函数为 6 位字母数字混合
    old_generate_captcha = '''def generate_captcha() -> dict:
    cleanup_captcha_store()
    chars = string.digits
    text = ''.join(random.choices(chars, k=4))'''
    
    new_generate_captcha = '''def generate_captcha() -> dict:
    cleanup_captcha_store()
    # 6 位字母数字混合验证码（大写 + 小写 + 数字）
    chars = string.ascii_letters + string.digits
    text = ''.join(random.choices(chars, k=6))'''
    
    if old_generate_captcha in content:
        content = content.replace(old_generate_captcha, new_generate_captcha)
        enhancements.append("升级为 6 位字母数字混合验证码")
    
    # 6. 添加验证码强度配置
    captcha_config = """
# 验证码配置
CAPTCHA_LENGTH = 6  # 验证码长度
CAPTCHA_CHARS = string.ascii_letters + string.digits  # 字母数字混合
CAPTCHA_EXPIRES = 300  # 5 分钟有效期
CAPTCHA_MAX_ATTEMPTS = 3  # 最大验证次数
"""
    
    if 'CAPTCHA_LENGTH' not in content:
        # 在 captcha_store 定义后添加
        content = content.replace(
            'captcha_store = {}',
            captcha_config + 'captcha_store = {}'
        )
        enhancements.append("添加验证码配置常量")
    
    # 写入修改后的内容
    with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("安全增强已应用:")
    for enhancement in enhancements:
        print(f"  ✓ {enhancement}")
    
    print(f"\n共应用 {len(enhancements)} 个安全增强")
    return True

if __name__ == '__main__':
    apply_enhanced_security()
