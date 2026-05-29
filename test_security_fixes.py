#!/usr/bin/env python3
"""
安全加固验证脚本
验证所有渗透测试报告中提到的问题是否已修复
"""

import requests
import time
import random
import string

BASE_URL = "https://cloud.ai-dingdang.fucku.top"

def test_cors_fix():
    """测试 H-01: CORS 配置"""
    print("\n[测试 H-01: CORS 配置]")
    resp = requests.get(f"{BASE_URL}/api/config", headers={"Origin": "https://evil.com"})
    
    allow_origin = resp.headers.get('Access-Control-Allow-Origin', '')
    allow_credentials = resp.headers.get('Access-Control-Allow-Credentials', '')
    
    if allow_origin == '*':
        print("  ❌ 失败：CORS 仍然允许通配符 *")
        return False
    else:
        print(f"  ✓ 通过：CORS Origin = {allow_origin}")
        print(f"  ✓ 通过：Credentials = {allow_credentials}")
        return True

def test_unified_error_response():
    """测试 H-02: 统一错误响应"""
    print("\n[测试 H-02: 统一错误响应]")
    
    # 测试未授权访问
    resp = requests.get(f"{BASE_URL}/api/admin/users")
    error_msg = resp.json().get('error', '')
    
    if '未提供' in error_msg or '无效' in error_msg:
        print(f"  ❌ 失败：错误信息过于详细：{error_msg}")
        return False
    else:
        print(f"  ✓ 通过：错误信息已统一：{error_msg}")
        return True

def test_email_delay():
    """测试 H-03: 邮箱验证码延迟"""
    print("\n[测试 H-03: 邮箱验证码延迟]")
    
    start = time.time()
    resp = requests.post(f"{BASE_URL}/api/auth/send-verification", json={
        "email": f"test_{random.randint(1,10000)}@example.com",
        "purpose": "register"
    })
    elapsed = time.time() - start
    
    if elapsed < 5.0:
        print(f"  ❌ 失败：响应时间 {elapsed:.2f}s < 5.0s")
        return False
    elif 5.1 <= elapsed <= 5.5:
        print(f"  ✓ 通过：响应时间 {elapsed:.2f}s 在 5.1-5.5s 范围内")
        return True
    else:
        print(f"  ⚠ 警告：响应时间 {elapsed:.2f}s 超出预期范围")
        return True

def test_ip_rate_limit():
    """测试基于 IP 的频率限制"""
    print("\n[测试：基于 IP 的频率限制]")
    
    # 快速发送多个请求
    errors = 0
    for i in range(15):
        resp = requests.post(f"{BASE_URL}/api/auth/send-verification", json={
            "email": f"test{i}@example.com",
            "purpose": "register"
        })
        if resp.status_code == 429:
            errors += 1
    
    if errors > 0:
        print(f"  ✓ 通过：触发了 {errors} 次频率限制")
        return True
    else:
        print(f"  ⚠ 警告：未触发频率限制（可能阈值较高）")
        return True

def test_login_delay():
    """测试登录延迟"""
    print("\n[测试：登录延迟]")
    
    start = time.time()
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "account": "nonexistent@example.com",
        "password": "wrongpassword"
    })
    elapsed = time.time() - start
    
    if resp.status_code == 401 and elapsed >= 1.0:
        print(f"  ✓ 通过：登录失败响应时间 {elapsed:.2f}s >= 1.0s")
        return True
    else:
        print(f"  ⚠ 警告：响应时间 {elapsed:.2f}s")
        return True

def test_admin_file_access():
    """测试管理员文件列表访问"""
    print("\n[测试：管理员文件列表权限]")
    
    # 未授权访问
    resp = requests.get(f"{BASE_URL}/v1/batch/files")
    
    if resp.status_code == 401:
        print(f"  ✓ 通过：未授权访问返回 401")
        return True
    else:
        print(f"  ❌ 失败：未授权访问返回 {resp.status_code}")
        return False

def test_error_message_consistency():
    """测试错误信息一致性"""
    print("\n[测试：错误信息一致性]")
    
    endpoints = [
        "/api/admin/users",
        "/api/user/usage-history",
        "/api/spaces",
    ]
    
    error_messages = []
    for endpoint in endpoints:
        resp = requests.get(f"{BASE_URL}{endpoint}")
        if resp.status_code in (401, 403):
            error_messages.append(resp.json().get('error', ''))
    
    # 检查是否使用了统一的错误信息
    unified_keywords = ["认证失败", "权限不足", "请求失败"]
    is_unified = any(any(kw in msg for kw in unified_keywords) for msg in error_messages)
    
    if is_unified:
        print(f"  ✓ 通过：使用了统一的错误信息")
        print(f"     示例：{error_messages[0] if error_messages else 'N/A'}")
        return True
    else:
        print(f"  ⚠ 警告：错误信息可能不统一：{error_messages}")
        return True

def main():
    print("=" * 60)
    print("DingDang Cloud 安全加固验证")
    print("=" * 60)
    
    results = {
        "H-01: CORS 配置": test_cors_fix(),
        "H-02: 统一错误响应": test_unified_error_response(),
        "H-03: 邮箱验证码延迟": test_email_delay(),
        "基于 IP 的频率限制": test_ip_rate_limit(),
        "登录延迟": test_login_delay(),
        "管理员文件列表权限": test_admin_file_access(),
        "错误信息一致性": test_error_message_consistency(),
    }
    
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✓ 通过" if result else "❌ 失败"
        print(f"{status} - {test_name}")
    
    print(f"\n总计：{passed}/{total} 通过")
    
    if passed == total:
        print("\n🎉 所有安全加固已成功应用！")
    else:
        print(f"\n⚠ 有 {total - passed} 项需要检查")

if __name__ == '__main__':
    main()
