"""
增强的网络搜索模块
支持多轮搜索和特定命令访问网站
"""

import re
import time
import json
import requests
import logging
from typing import Tuple, Dict, List, Optional

logger = logging.getLogger(__name__)

SEARCH_CACHE = {}
SEARCH_CACHE_TTL = 300


def perform_web_search(query: str, max_results: int = 5, round_count: int = 1) -> str:
    """
    执行网络搜索，支持多轮搜索
    :param query: 搜索查询
    :param max_results: 最大结果数
    :param round_count: 搜索轮数（默认 1 轮）
    :return: 搜索结果文本
    """
    all_results = []
    search_queries = [query]
    
    for round_num in range(round_count):
        if round_num > 0:
            logger.info(f"[多轮搜索] 第{round_num + 1}轮搜索")
        
        for current_query in search_queries:
            cache_key = f"{current_query.strip().lower()}_round{round_num}"
            cached = SEARCH_CACHE.get(cache_key)
            if cached and time.time() - cached['time'] < SEARCH_CACHE_TTL:
                logger.info(f"[联网搜索] 使用缓存结果：{current_query}")
                if cached['result'] not in all_results:
                    all_results.append(cached['result'])
                continue
            
            search_engines = [
                {
                    "name": "Bing",
                    "url": "https://cn.bing.com/search",
                    "params": {"q": current_query, "setmkt": "zh-CN"},
                },
                {
                    "name": "Baidu",
                    "url": "https://www.baidu.com/s",
                    "params": {"wd": current_query, "ie": "utf-8"},
                },
            ]
            
            for engine in search_engines:
                try:
                    logger.info(f"[联网搜索] 尝试{engine['name']}: {current_query}")
                    resp = requests.get(
                        engine["url"],
                        params=engine["params"],
                        headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                                          "Chrome/120.0.0.0 Safari/537.36"
                        },
                        timeout=10
                    )
                    if resp.status_code != 200:
                        logger.warning(f"[联网搜索] {engine['name']}请求失败：status={resp.status_code}")
                        continue
                    
                    import html as html_module
                    results = []
                    
                    if engine["name"] == "Bing":
                        sections = re.findall(r'<li[^>]*b_algo[^>]*>(.*?)</li>', resp.text, re.DOTALL)
                        for sec in sections[:max_results]:
                            h2_matches = re.findall(r'<h2[^>]*>(.*?)</h2>', sec, re.DOTALL)
                            title_text = ""
                            if h2_matches:
                                title_text = html_module.unescape(re.sub(r'<[^>]+>', '', h2_matches[0]).strip())
                            if not title_text or len(title_text) < 3:
                                continue
                            snippet = ""
                            p_matches = re.findall(r'<p[^>]*class=\"b_lineclamp[^\"]*\"[^>]*>(.*?)</p>', sec, re.DOTALL)
                            if p_matches:
                                snippet = html_module.unescape(re.sub(r'<[^>]+>', '', p_matches[0]).strip())
                            if snippet:
                                results.append(f"{title_text} — {snippet[:200]}")
                            else:
                                results.append(title_text)
                    elif engine["name"] == "Baidu":
                        for m in re.findall(r'<div[^>]*class=\"c-abstract\"[^>]*>(.*?)</div>', resp.text, re.DOTALL):
                            text = html_module.unescape(re.sub(r'<[^>]+>', '', m).strip())
                            if text and len(text) > 10:
                                results.append(text)
                                if len(results) >= max_results:
                                    break
                        if not results:
                            for m in re.findall(r'<span[^>]*class=\"content[^\"]*\"[^>]*>(.*?)</span>', resp.text, re.DOTALL):
                                text = html_module.unescape(re.sub(r'<[^>]+>', '', m).strip())
                                if text and len(text) > 10:
                                    results.append(text)
                                    if len(results) >= max_results:
                                        break
                    
                    if results:
                        formatted = "\n".join(f"{i+1}. {r}" for i, r in enumerate(results[:max_results]))
                        SEARCH_CACHE[cache_key] = {'result': formatted, 'time': time.time()}
                        logger.info(f"[联网搜索] {engine['name']}成功获取{len(results[:max_results])}条结果")
                        if formatted not in all_results:
                            all_results.append(formatted)
                        break
                    logger.warning(f"[联网搜索] {engine['name']}未获取到结果")
                except Exception as e:
                    logger.error(f"[联网搜索] {engine['name']}出错：{str(e)}")
                    continue
    
    if all_results:
        if len(all_results) == 1:
            return all_results[0]
        else:
            return "\n\n=== 多轮搜索结果 ===\n\n" + "\n\n".join(all_results)
    
    logger.error(f"[联网搜索] 所有搜索引擎均失败")
    return ""


def execute_web_command(command_type: str, url: str, headers: Optional[Dict] = None, 
                       body: Optional[str] = None, timeout: int = 10) -> str:
    """
    执行特定的 Web 命令（GET/POST）访问指定网站
    :param command_type: 命令类型（GET 或 POST）
    :param url: 目标 URL
    :param headers: 请求头字典
    :param body: POST 请求的请求体
    :param timeout: 超时时间（秒）
    :return: 响应内容
    """
    try:
        logger.info(f"[Web 命令] 执行{command_type}请求：{url}")
        
        default_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
        
        if headers:
            default_headers.update(headers)
        
        if command_type.upper() == 'GET':
            resp = requests.get(url, headers=default_headers, timeout=timeout)
        elif command_type.upper() == 'POST':
            resp = requests.post(url, headers=default_headers, data=body, timeout=timeout)
        else:
            return f"错误：不支持的命令类型：{command_type}"
        
        if resp.status_code != 200:
            return f"错误：请求失败，状态码 {resp.status_code}"
        
        content_type = resp.headers.get('content-type', '')
        if 'text/html' in content_type:
            import html as html_module
            text = html_module.unescape(re.sub(r'<[^>]+>', '', resp.text)).strip()
            return text[:3000]
        elif 'json' in content_type:
            try:
                json_data = resp.json()
                return json.dumps(json_data, ensure_ascii=False, indent=2)[:3000]
            except:
                return resp.text[:3000]
        else:
            return resp.text[:3000]
    
    except Exception as e:
        logger.error(f"[Web 命令] 执行失败：{str(e)}")
        return f"错误：{str(e)}"


def parse_and_execute_command(message_content: str) -> Tuple[bool, str]:
    """
    解析并执行特定格式的命令
    支持格式：
    - get {请求头 JSON} 网址
    - post {请求体} {请求头 JSON} 网址
    :param message_content: 消息内容
    :return: (是否执行了命令，执行结果或原始消息)
    """
    content = message_content.strip()
    
    get_pattern = r'^get\s+(\{.*?\})\s+(https?://\S+)$'
    post_pattern = r'^post\s+(\{.*?\})\s+(\{.*?\})\s+(https?://\S+)$'
    
    get_match = re.match(get_pattern, content, re.IGNORECASE | re.DOTALL)
    if get_match:
        try:
            headers_str = get_match.group(1)
            url = get_match.group(2)
            headers = json.loads(headers_str)
            result = execute_web_command('GET', url, headers)
            return (True, result)
        except json.JSONDecodeError:
            return (False, "错误：请求头格式不正确，请使用 JSON 格式")
        except Exception as e:
            return (True, f"执行 GET 命令时出错：{str(e)}")
    
    post_match = re.match(post_pattern, content, re.IGNORECASE | re.DOTALL)
    if post_match:
        try:
            body_str = post_match.group(1)
            headers_str = post_match.group(2)
            url = post_match.group(3)
            body = json.loads(body_str)
            headers = json.loads(headers_str)
            body_text = json.dumps(body, ensure_ascii=False)
            result = execute_web_command('POST', url, headers, body_text)
            return (True, result)
        except json.JSONDecodeError:
            return (False, "错误：请求体或请求头格式不正确，请使用 JSON 格式")
        except Exception as e:
            return (True, f"执行 POST 命令时出错：{str(e)}")
    
    return (False, content)


def enhance_messages_with_search(messages: List[Dict], web_search: bool = False, 
                                deep_think: bool = False, search_rounds: int = 1) -> List[Dict]:
    """
    增强消息处理，支持多轮搜索和命令执行
    :param messages: 原始消息列表
    :param web_search: 是否启用网络搜索
    :param deep_think: 是否启用深度思考
    :param search_rounds: 搜索轮数
    :return: 增强后的消息列表
    """
    if not isinstance(messages, list):
        messages = [{"role": "user", "content": str(messages)}]
    
    modified = list(messages)
    
    now = time.time()
    from datetime import datetime
    now_dt = datetime.now()
    time_prompt = (
        f"当前日期时间：{now_dt.strftime('%Y年%m月%d日 %H:%M:%S')} "
        f"(星期{['一','二','三','四','五','六','日'][now_dt.weekday()]})"
    )
    
    has_system = any(m.get('role') == 'system' for m in modified)
    
    if has_system:
        for m in modified:
            if m.get('role') == 'system':
                if time_prompt not in m['content']:
                    m['content'] = time_prompt + "\n\n" + m['content']
                break
    else:
        modified.insert(0, {
            "role": "system",
            "content": time_prompt
        })
    
    if deep_think:
        for m in modified:
            if m.get('role') == 'system':
                m['content'] = (
                    "请一步一步推理（chain-of-thought），详细展示你的思考过程，"
                    "然后给出最终答案。\n\n" + m['content']
                )
                break
    
    if web_search:
        user_question = modified[-1].get('content', '') if modified else ''
        
        cmd_executed, cmd_result = parse_and_execute_command(user_question)
        if cmd_executed:
            search_context = (
                f"以下是执行用户命令获得的网页内容：\n\n"
                f"{cmd_result}\n\n"
                f"请基于以上内容回答用户的问题。"
            )
            for m in modified:
                if m.get('role') == 'system':
                    m['content'] = m['content'] + "\n\n" + search_context
                    break
            logger.info(f"[Web 命令] 已执行命令并注入结果")
        else:
            search_results = perform_web_search(user_question, round_count=search_rounds)
            if search_results:
                search_context = (
                    f"以下是来自互联网的最新搜索结果，请基于这些信息回答用户的问题：\n\n"
                    f"{search_results}\n\n"
                    f"请结合搜索结果和你的知识给出完整、准确的回答。"
                )
                for m in modified:
                    if m.get('role') == 'system':
                        m['content'] = m['content'] + "\n\n" + search_context
                        break
                logger.info(f"[联网搜索] 已将搜索结果注入系统消息")
            else:
                logger.warning(f"[联网搜索] 搜索结果为空，未注入上下文")
    
    return modified
