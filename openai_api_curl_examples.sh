#!/bin/bash
# ================================================================
# DingDang Cloud - OpenAI API 兼容接口 curl 示例
# ================================================================
# 使用前请替换 YOUR_API_KEY 为您的实际 API Key
# ================================================================

API_KEY="YOUR_API_KEY"
BASE_URL="http://localhost:8081"

echo "DingDang Cloud - OpenAI API 兼容接口 curl 示例"
echo "================================================"
echo ""

# ================================================================
# 1. 列出可用模型
# ================================================================
echo "[1] 列出可用模型"
echo "----------------------------------------"
curl -s -X GET "$BASE_URL/v1/models" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" | python3 -m json.tool
echo ""

# ================================================================
# 2. 聊天完成 (/v1/chat/completions)
# ================================================================
echo "[2] 聊天完成 (/v1/chat/completions)"
echo "----------------------------------------"
curl -s -X POST "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      {"role": "system", "content": "你是一个乐于助人的助手。"},
      {"role": "user", "content": "你好，介绍一下你自己"}
    ],
    "max_tokens": 500,
    "temperature": 0.7
  }' | python3 -m json.tool
echo ""

# ================================================================
# 3. 流式聊天完成 (/v1/chat/completions with stream)
# ================================================================
echo "[3] 流式聊天完成 (/v1/chat/completions with stream)"
echo "----------------------------------------"
curl -s -N -X POST "$BASE_URL/v1/chat/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "messages": [
      {"role": "user", "content": "请用一句话描述人工智能"}
    ],
    "max_tokens": 100,
    "temperature": 0.7,
    "stream": true
  }' | grep -o '"content":"[^"]*"' | sed 's/"content":"\([^"]*\)"/\1/g' | tr -d '\n'
echo ""
echo ""
echo ""

# ================================================================
# 4. 文本补全 (/v1/completions)
# ================================================================
echo "[4] 文本补全 (/v1/completions)"
echo "----------------------------------------"
curl -s -X POST "$BASE_URL/v1/completions" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen",
    "prompt": "人工智能是",
    "max_tokens": 100,
    "temperature": 0.7
  }' | python3 -m json.tool
echo ""

# ================================================================
# 5. 生成嵌入向量 (/v1/embeddings)
# ================================================================
echo "[5] 生成嵌入向量 (/v1/embeddings)"
echo "----------------------------------------"
curl -s -X POST "$BASE_URL/v1/embeddings" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-ada-002",
    "input": "Hello, world!"
  }' | python3 -m json.tool
echo ""

# ================================================================
# 6. 内容审核 (/v1/moderations)
# ================================================================
echo "[6] 内容审核 (/v1/moderations)"
echo "----------------------------------------"
curl -s -X POST "$BASE_URL/v1/moderations" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": ["这是正常内容", "暴力攻击"]
  }' | python3 -m json.tool
echo ""

echo "================================================"
echo "所有示例执行完成!"
echo "================================================"