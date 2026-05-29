#!/usr/bin/env python3
"""修复 send_verification 函数"""

with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    
    # 找到 send_verification 函数开始
    if "@app.route('/api/auth/send-verification', methods=['POST'])" in line:
        # 添加完整的函数
        new_lines.append("@app.route('/api/auth/send-verification', methods=['POST'])\n")
        new_lines.append("def send_verification():\n")
        new_lines.append("    data = request.get_json()\n")
        new_lines.append("    email = (data.get('email') or '').strip().lower()\n")
        new_lines.append("    purpose = (data.get('purpose') or 'register').strip()\n")
        new_lines.append("\n")
        new_lines.append("    client_ip = get_client_ip()\n")
        new_lines.append("    \n")
        new_lines.append("    # 5.1-5.5 秒随机延迟（防止时序攻击）\n")
        new_lines.append("    delay_seconds = random.uniform(5.1, 5.5)\n")
        new_lines.append("    \n")
        new_lines.append("    # 基于 IP 的频率限制（而非邮箱）\n")
        new_lines.append("    ip_login_error_key = f'ip_login_error:{client_ip}'\n")
        new_lines.append("    if not check_rate_limit(ip_login_error_key, max_requests=10, window_seconds=60):\n")
        new_lines.append("        time.sleep(delay_seconds)\n")
        new_lines.append("        return json_response({\"error\": \"请求频率过快，请稍后再试\"}, 429)\n")
        new_lines.append("    \n")
        new_lines.append("    rate_key = f'send_verification:{email}:{purpose}'\n")
        new_lines.append("    if not check_rate_limit(rate_key, max_requests=1, window_seconds=60):\n")
        new_lines.append("        time.sleep(delay_seconds)\n")
        new_lines.append("        return json_response(\n")
        new_lines.append("            {\"error\": \"操作过于频繁，请 1 分钟后再试\"}, 429)\n")
        new_lines.append("    if not check_rate_limit(f'send_verification_ip:{client_ip}',\n")
        new_lines.append("                            max_requests=5, window_seconds=300):\n")
        new_lines.append("        time.sleep(delay_seconds)\n")
        new_lines.append("        return json_response(\n")
        new_lines.append("            {\"error\": \"操作过于频繁，请稍后再试\"}, 429)\n")
        new_lines.append("    if not check_rate_limit(f'send_verification_global:{purpose}',\n")
        new_lines.append("                            max_requests=30, window_seconds=60):\n")
        new_lines.append("        time.sleep(delay_seconds)\n")
        new_lines.append("        return json_response(\n")
        new_lines.append("            {\"error\": \"系统繁忙，请稍后再试\"}, 429)\n")
        new_lines.append("\n")
        new_lines.append("    conn = get_db()\n")
        new_lines.append("    user = conn.execute(\"SELECT id FROM users WHERE email = ?\",\n")
        new_lines.append("        (email,)).fetchone()\n")
        new_lines.append("    if purpose in ('login', 'change_password') and not user:\n")
        new_lines.append("        conn.close()\n")
        new_lines.append("        time.sleep(delay_seconds)\n")
        new_lines.append("        return json_response({\"error\": \"验证码已发送\"}, 200)\n")
        new_lines.append("    conn.close()\n")
        new_lines.append("\n")
        new_lines.append("    conn = get_db()\n")
        new_lines.append("    conn.execute(\n")
        new_lines.append("        \"DELETE FROM email_verifications WHERE email = ? AND purpose = ? \"\n")
        new_lines.append("        \"AND used = 0\", (email, purpose))\n")
        new_lines.append("    conn.commit()\n")
        new_lines.append("    conn.close()\n")
        new_lines.append("\n")
        new_lines.append("    code = generate_email_code()\n")
        new_lines.append("    expires_at = (datetime.now() + timedelta(minutes=5)).strftime(\n")
        new_lines.append("        '%Y-%m-%d %H:%M:%S')\n")
        new_lines.append("    conn = get_db()\n")
        new_lines.append("    conn.execute(\n")
        new_lines.append("        \"INSERT INTO email_verifications (email, code, purpose, expires_at) \"\n")
        new_lines.append("        \"VALUES (?, ?, ?, ?)\",\n")
        new_lines.append("        (email, code, purpose, expires_at))\n")
        new_lines.append("    conn.commit()\n")
        new_lines.append("    conn.close()\n")
        new_lines.append("\n")
        new_lines.append("    send_verification_email(email, code, purpose)\n")
        new_lines.append("    \n")
        new_lines.append("    time.sleep(delay_seconds)\n")
        new_lines.append("    return json_response({\"message\": \"验证码已发送\"})\n")
        
        # 跳过旧函数的行
        i += 1
        while i < len(lines) and not (lines[i].strip().startswith('@app.route') or 
                                      (lines[i].strip().startswith('def ') and not lines[i].strip().startswith('def send'))):
            i += 1
        continue
    
    new_lines.append(line)
    i += 1

with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print("send_verification 函数已更新")
