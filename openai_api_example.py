#!/usr/bin/env python3
"""
DingDang Cloud - OpenAI API 兼容接口示例程序

本示例演示如何使用 OpenAI Python SDK 调用 DingDang Cloud 的 AI 服务。

需要先安装 openai 库:
pip install openai
"""

import os
import openai

# ================================================
# 配置参数
# ================================================
BASE_URL = "http://localhost:8081/v1"
API_KEY = "your-api-key-here"  # 替换为你的 API Key

# 初始化 OpenAI 客户端
client = openai.OpenAI(
    base_url=BASE_URL,
    api_key=API_KEY
)


def test_chat_completions():
    """测试 /v1/chat/completions 端点"""
    print("=" * 60)
    print("测试: /v1/chat/completions")
    print("=" * 60)
    
    try:
        response = client.chat.completions.create(
            model="qwen",
            messages=[
                {"role": "system", "content": "你是一个乐于助人的助手。"},
                {"role": "user", "content": "你好，介绍一下你自己"}
            ],
            max_tokens=500,
            temperature=0.7
        )
        
        print(f"响应 ID: {response.id}")
        print(f"创建时间: {response.created}")
        print(f"模型: {response.model}")
        print(f"回答内容:\n{response.choices[0].message.content}")
        print(f"\nUsage:")
        print(f"  Prompt tokens: {response.usage.prompt_tokens}")
        print(f"  Completion tokens: {response.usage.completion_tokens}")
        print(f"  Total tokens: {response.usage.total_tokens}")
        
    except Exception as e:
        print(f"错误: {e}")


def test_chat_completions_stream():
    """测试流式响应 /v1/chat/completions (stream=True)"""
    print("\n" + "=" * 60)
    print("测试: /v1/chat/completions (流式)")
    print("=" * 60)
    
    try:
        stream = client.chat.completions.create(
            model="qwen",
            messages=[
                {"role": "user", "content": "请用一句话描述人工智能"}
            ],
            max_tokens=100,
            temperature=0.7,
            stream=True
        )
        
        print("流式响应:")
        for chunk in stream:
            if chunk.choices[0].delta.content is not None:
                print(chunk.choices[0].delta.content, end="", flush=True)
        print()
        
    except Exception as e:
        print(f"错误: {e}")


def test_completions():
    """测试 /v1/completions 端点"""
    print("\n" + "=" * 60)
    print("测试: /v1/completions")
    print("=" * 60)
    
    try:
        response = client.completions.create(
            model="qwen",
            prompt="人工智能是",
            max_tokens=100,
            temperature=0.7
        )
        
        print(f"响应 ID: {response.id}")
        print(f"创建时间: {response.created}")
        print(f"模型: {response.model}")
        print(f"回答内容:\n{response.choices[0].text}")
        print(f"\nUsage:")
        print(f"  Prompt tokens: {response.usage.prompt_tokens}")
        print(f"  Completion tokens: {response.usage.completion_tokens}")
        print(f"  Total tokens: {response.usage.total_tokens}")
        
    except Exception as e:
        print(f"错误: {e}")


def test_embeddings():
    """测试 /v1/embeddings 端点"""
    print("\n" + "=" * 60)
    print("测试: /v1/embeddings")
    print("=" * 60)
    
    try:
        response = client.embeddings.create(
            model="text-embedding-ada-002",
            input="Hello, world!"
        )
        
        print(f"模型: {response.model}")
        print(f"嵌入向量长度: {len(response.data[0].embedding)}")
        print(f"嵌入向量前10个值: {response.data[0].embedding[:10]}")
        print(f"\nUsage:")
        print(f"  Prompt tokens: {response.usage.prompt_tokens}")
        print(f"  Total tokens: {response.usage.total_tokens}")
        
    except Exception as e:
        print(f"错误: {e}")


def test_moderations():
    """测试 /v1/moderations 端点"""
    print("\n" + "=" * 60)
    print("测试: /v1/moderations")
    print("=" * 60)
    
    try:
        response = client.moderations.create(
            input=["这是正常内容", "暴力攻击"]
        )
        
        print(f"响应 ID: {response.id}")
        print(f"模型: {response.model}")
        
        for i, result in enumerate(response.results):
            print(f"\n结果 {i+1}:")
            print(f"  Flagged: {result.flagged}")
            print(f"  Categories: {result.categories}")
            print(f"  Category Scores: {result.category_scores}")
        
    except Exception as e:
        print(f"错误: {e}")


def test_list_models():
    """测试 /v1/models 端点"""
    print("\n" + "=" * 60)
    print("测试: /v1/models")
    print("=" * 60)
    
    try:
        models = client.models.list()
        
        print("可用模型列表:")
        for model in models.data:
            print(f"  - {model.id} (owned by: {model.owned_by})")
            
    except Exception as e:
        print(f"错误: {e}")


if __name__ == "__main__":
    print("DingDang Cloud - OpenAI API 兼容接口示例")
    print("=" * 60)
    
    # 测试各个端点
    test_list_models()
    test_chat_completions()
    test_chat_completions_stream()
    test_completions()
    test_embeddings()
    test_moderations()
    
    print("\n" + "=" * 60)
    print("所有测试完成!")
    print("=" * 60)