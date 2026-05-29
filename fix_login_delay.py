#!/usr/bin/env python3
"""修复 login 函数添加延迟"""

with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到 login 函数并添加延迟
old_login_error = '''    if not user:
        conn.close()
        return json_response({"error": "邮箱/用户名或密码错误"}, 401)'''

new_login_error = '''    if not user:
        conn.close()
        time.sleep(random.uniform(1.0, 2.0))
        return json_response({"error": "邮箱/用户名或密码错误"}, 401)'''

content = content.replace(old_login_error, new_login_error)

old_pwd_error = '''        if user['password_hash'] != hash_password(password):
            conn.close()
            return json_response({"error": "邮箱/用户名或密码错误"}, 401)'''

new_pwd_error = '''        if user['password_hash'] != hash_password(password):
            conn.close()
            time.sleep(random.uniform(1.0, 2.0))
            return json_response({"error": "邮箱/用户名或密码错误"}, 401)'''

content = content.replace(old_pwd_error, new_pwd_error)

with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("login 函数已更新添加延迟")
