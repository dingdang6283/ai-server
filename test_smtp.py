#!/usr/bin/env python3
"""测试 SMTP 邮件发送"""
import smtplib
import email.mime.text
import yaml
import os

# 读取配置
cfg_path = os.path.join(os.path.dirname(__file__), 'config.yml')
with open(cfg_path, 'r') as f:
    cfg = yaml.safe_load(f)

smtp = cfg['smtp']
print(f"SMTP 配置:")
print(f"  服务器: {smtp['server']}:{smtp['port']}")
print(f"  加密: {smtp['encryption']}")
print(f"  用户名: {smtp['username']}")
print(f"  发件人: {smtp['sender_email']}")
print(f"  密码长度: {len(smtp['password'])} 字符")
print()

# 测试 DNS 解析
import socket
print(f"测试 DNS 解析 {smtp['server']}...")
try:
    ip = socket.getaddrinfo(smtp['server'], smtp['port'])[0][4][0]
    print(f"  ✅ 解析成功 -> {ip}")
except Exception as e:
    print(f"  ❌ DNS 解析失败: {e}")

print()

# 测试 SMTP 连接
to_email = smtp['sender_email']  # 先发给自己测试
subject = "SMTP 测试邮件"
body = "<h1>测试</h1><p>如果收到这封邮件，说明 SMTP 配置正确。</p>"

msg = email.mime.text.MIMEText(body, 'html', 'utf-8')
msg['Subject'] = subject
msg['From'] = f"{smtp['display_name']} <{smtp['sender_email']}>"
msg['To'] = to_email

try:
    if smtp['encryption'] == 'SSL':
        print(f"尝试 SSL 连接 {smtp['server']}:{smtp['port']}...")
        with smtplib.SMTP_SSL(smtp['server'], smtp['port'], timeout=10) as server:
            print("  连接成功!")
            server.login(smtp['username'], smtp['password'])
            print("  登录成功!")
            server.send_message(msg)
    else:
        print(f"尝试 TLS 连接 {smtp['server']}:{smtp['port']}...")
        with smtplib.SMTP(smtp['server'], smtp['port'], timeout=10) as server:
            server.starttls()
            print("  连接+STARTTLS 成功!")
            server.login(smtp['username'], smtp['password'])
            print("  登录成功!")
            server.send_message(msg)
    
    print(f"\n✅ 邮件发送成功！请检查 {to_email} 的收件箱")
except smtplib.SMTPAuthenticationError:
    print(f"\n❌ 登录失败：用户名或密码错误")
    print("  提示：QQ邮箱需要使用授权码，而不是登录密码")
    print("  获取方式：QQ邮箱 → 设置 → 账户 → 生成授权码")
except smtplib.SMTPServerDisconnected:
    print(f"\n❌ 连接断开：服务器拒绝连接")
except socket.timeout:
    print(f"\n❌ 连接超时：无法连接到 {smtp['server']}:{smtp['port']}")
    print("  可能是网络防火墙/安全组阻止了出站连接")
except Exception as e:
    print(f"\n❌ 发送失败: {type(e).__name__}: {e}")
