#!/usr/bin/env python3
"""
DingDang Cloud - OpenAI API 兼容性测试脚本

测试所有OpenAI兼容端点，确保请求/响应格式完全符合官方规范
"""

import os
import sys
import json
import urllib.request
import urllib.error

# 配置
BASE_URL = "http://localhost:8081/v1"
API_KEY = "sk-prod-test-key-for-dingdang-cloud-2024"

def print_status(passed, message):
    status = "[PASS]" if passed else "[FAIL]"
    print(f"{status} {message}")

def test_api_key_format():
    """测试API密钥格式是否符合sk-开头标准"""
    print("\n=== 测试1: API密钥格式 ===")
    if API_KEY.startswith("sk-"):
        print_status(True, f"API密钥格式正确: {API_KEY[:10]}...")
        return True
    else:
        print_status(False, f"API密钥格式错误，必须以sk-开头")
        return False

def test_endpoint(endpoint, method="GET", headers=None, data=None, expected_status=200):
    """测试单个API端点"""
    url = f"{BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method=method)
    
    default_headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    if headers:
        default_headers.update(headers)
    
    for key, value in default_headers.items():
        req.add_header(key, value)
    
    if data:
        req.data = json.dumps(data).encode('utf-8')
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            status_code = response.getcode()
            content = response.read().decode('utf-8')
            
            if status_code == expected_status:
                print_status(True, f"{method} {endpoint} - 状态码: {status_code}")
                try:
                    return json.loads(content)
                except:
                    return content
            else:
                print_status(False, f"{method} {endpoint} - 状态码: {status_code}")
                try:
                    error_data = json.loads(content)
                    print(f"      错误信息: {error_data.get('error', content)}")
                except:
                    print(f"      响应内容: {content[:200]}")
                return None
    except urllib.error.HTTPError as e:
        status_code = e.code
        print_status(False, f"{method} {endpoint} - HTTP错误: {status_code}")
        try:
            content = e.read().decode('utf-8')
            error_data = json.loads(content)
            print(f"      错误信息: {error_data.get('error', error_data)}")
        except:
            print(f"      响应内容: {content[:200]}")
        return None
    except Exception as e:
        print_status(False, f"{method} {endpoint} - 异常: {str(e)}")
        return None

def test_models_endpoint():
    """测试 /v1/models 端点"""
    print("\n=== 测试2: /v1/models ===")
    response = test_endpoint("/models", method="GET")
    
    if response:
        # 验证响应格式
        required_fields = ["object", "data"]
        missing_fields = [f for f in required_fields if f not in response]
        
        if missing_fields:
            print_status(False, f"缺少必需字段: {missing_fields}")
        else:
            print_status(True, f"响应格式正确，包含 {len(response['data'])} 个模型")
            for model in response['data']:
                print(f"      - {model.get('id', 'unknown')}")

def test_chat_completions():
    """测试 /v1/chat/completions 端点"""
    print("\n=== 测试3: /v1/chat/completions ===")
    
    payload = {
        "model": "qwen",
        "messages": [
            {"role": "system", "content": "你是一个乐于助人的助手"},
            {"role": "user", "content": "你好"}
        ],
        "max_tokens": 100,
        "temperature": 0.7,
        "top_p": 1.0,
        "n": 1,
        "stop": None,
        "frequency_penalty": 0,
        "presence_penalty": 0
    }
    
    response = test_endpoint("/chat/completions", method="POST", data=payload)
    
    if response:
        # 验证响应格式符合OpenAI规范
        required_fields = ["id", "object", "created", "model", "choices", "usage"]
        missing_fields = [f for f in required_fields if f not in response]
        
        if missing_fields:
            print_status(False, f"缺少必需字段: {missing_fields}")
        else:
            print_status(True, f"响应格式符合OpenAI规范")
            print(f"      ID: {response['id']}")
            print(f"      对象类型: {response['object']}")
            print(f"      模型: {response['model']}")
            print(f"      回答: {