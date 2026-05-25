# 增强的网络搜索功能使用说明

## 功能概述

本次更新为 AI 系统增加了强大的网络搜索和网页访问能力，使 AI 能够更准确地筛选和获取有用信息。

## 新增功能

### 1. 多轮搜索功能

AI 现在可以执行多轮搜索，累积更多搜索结果以获取更全面的信息。

**工作原理：**
- 支持配置搜索轮数（默认 1 轮）
- 每轮搜索都会尝试不同的搜索引擎（Bing、百度）
- 自动去重，累积所有搜索结果

**使用示例：**
```python
# 在调用 AI 接口时，可以通过修改 search_rounds 参数来控制搜索轮数
# 注意：目前通过前端界面使用时默认为 1 轮
# 如需多轮搜索，需要修改后端调用代码
```

### 2. 特定命令访问网站

AI 可以通过发送特定格式的命令直接访问指定网站，获取精确的网页内容。

**支持的命令格式：**

#### GET 请求
```
get {请求头 JSON} 网址
```

**示例：**
```
get {"Accept": "application/json"} https://api.example.com/data
get {"User-Agent": "CustomBot/1.0"} https://example.com/page
```

#### POST 请求
```
post {请求体 JSON} {请求头 JSON} 网址
```

**示例：**
```
post {"query": "search term"} {"Content-Type": "application/json"} https://api.example.com/search
post {"name": "test", "value": 123} {"Authorization": "Bearer token"} https://api.example.com/submit
```

**功能特点：**
- 自动解析 JSON 格式的请求头和请求体
- 智能识别响应内容类型（HTML、JSON 等）
- HTML 内容会自动提取文本
- JSON 内容会格式化输出
- 响应内容限制在 3000 字符以内

### 3. 增强的信息筛选

AI 现在能够：
- 自动识别并执行特定命令
- 对搜索结果进行去重和整理
- 结合上下文提供准确的回答

## 技术实现

### 文件结构

- `web_search_enhanced.py` - 增强的搜索模块
  - `perform_web_search()` - 支持多轮搜索
  - `execute_web_command()` - 执行 GET/POST 请求
  - `parse_and_execute_command()` - 解析并执行特定命令
  - `enhance_messages_with_search()` - 增强消息处理

- `server.py` - 主服务器文件（已更新）
  - 导入新模块
  - 更新 `build_messages_with_features()` 函数
  - 支持 `search_rounds` 参数

- `test_web_search.py` - 测试脚本

### 使用示例

#### 在代码中使用

```python
from web_search_enhanced import perform_web_search, parse_and_execute_command

# 执行多轮搜索
results = perform_web_search("AI 技术发展趋势", max_results=5, round_count=3)
print(results)

# 执行 GET 命令
executed, result = parse_and_execute_command(
    'get {"Accept": "application/json"} https://api.example.com/data'
)
if executed:
    print(f"获取到的数据：{result}")
else:
    print(f"命令执行失败：{result}")

# 执行 POST 命令
executed, result = parse_and_execute_command(
    'post {"message": "hello"} {"Content-Type": "application/json"} https://api.example.com/echo'
)
if executed:
    print(f"POST 响应：{result}")
```

#### 在 AI 对话中使用

当 AI 检测到用户消息符合特定命令格式时，会自动执行命令并基于结果回答。

**用户输入示例：**
```
get {"Accept": "text/html"} https://example.com
```

**AI 处理流程：**
1. 检测到命令格式
2. 执行 GET 请求获取网页内容
3. 基于获取的内容回答用户问题

## 测试

运行测试脚本验证所有功能：

```bash
cd /media/dingdang/NAS/ai
python3 test_web_search.py
```

测试内容包括：
- 普通查询处理
- 无效命令处理
- 多轮搜索功能
- GET 命令执行
- POST 命令执行

## 注意事项

1. **搜索轮数配置**
   - 增加搜索轮数会提高信息全面性，但也会增加响应时间
   - 建议根据实际需求调整轮数（1-3 轮为宜）

2. **命令格式**
   - 请求头和请求体必须是有效的 JSON 格式
   - URL 必须以 http:// 或 https:// 开头

3. **超时设置**
   - 默认请求超时时间为 10 秒
   - 可根据需要修改 `execute_web_command()` 中的 timeout 参数

4. **响应长度**
   - 网页内容限制在 3000 字符以内
   - 超出部分会被截断

## Git 提交信息

```
commit c11e1ba
Author: dingdang6283
Date: 2026-05-25

feat: 增强网络搜索功能

- 新增多轮搜索支持，可配置搜索轮数累积更多结果
- 新增特定命令格式解析（get/post 命令访问指定网站）
  - 支持格式：get {请求头 JSON} 网址
  - 支持格式：post {请求体} {请求头 JSON} 网址
- 新增 web_search_enhanced.py 模块封装增强搜索功能
- 更新 build_messages_with_features 函数支持命令执行
- 添加测试脚本验证新功能

功能说明：
- AI 现在可以通过发送特定命令直接访问网页
- 多轮搜索功能可以获取更全面的搜索结果
- 增强了 AI 筛选有用信息的能力
```

## 后续优化建议

1. 支持更多 HTTP 方法（PUT、DELETE 等）
2. 添加请求认证和授权机制
3. 支持自定义 User-Agent
4. 添加请求重试机制
5. 支持代理配置
6. 添加请求日志和审计功能
