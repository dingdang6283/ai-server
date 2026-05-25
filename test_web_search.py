#!/usr/bin/env python3
"""
测试增强的网络搜索功能
"""

from web_search_enhanced import perform_web_search, parse_and_execute_command, execute_web_command

def test_multi_round_search():
    """测试多轮搜索功能"""
    print("=" * 60)
    print("测试 1: 多轮搜索功能")
    print("=" * 60)
    
    query = "2026 年最新 AI 技术"
    print(f"搜索查询：{query}")
    print("搜索轮数：3 轮")
    
    results = perform_web_search(query, max_results=3, round_count=3)
    
    if results:
        print("\n搜索结果：")
        print(results[:500])
        print("... (结果已截断)")
    else:
        print("未获取到搜索结果")
    
    print()

def test_get_command():
    """测试 GET 命令"""
    print("=" * 60)
    print("测试 2: GET 命令访问网站")
    print("=" * 60)
    
    test_command = 'get {"Accept": "application/json"} https://httpbin.org/get'
    print(f"命令：{test_command}")
    
    executed, result = parse_and_execute_command(test_command)
    
    if executed:
        print(f"\n执行结果：")
        print(result[:300])
        if len(result) > 300:
            print("... (结果已截断)")
    else:
        print(f"未执行命令，返回：{result}")
    
    print()

def test_post_command():
    """测试 POST 命令"""
    print("=" * 60)
    print("测试 3: POST 命令访问网站")
    print("=" * 60)
    
    test_command = 'post {"message": "hello"} {"Content-Type": "application/json"} https://httpbin.org/post'
    print(f"命令：{test_command}")
    
    executed, result = parse_and_execute_command(test_command)
    
    if executed:
        print(f"\n执行结果：")
        print(result[:300])
        if len(result) > 300:
            print("... (结果已截断)")
    else:
        print(f"未执行命令，返回：{result}")
    
    print()

def test_invalid_command():
    """测试无效命令"""
    print("=" * 60)
    print("测试 4: 无效命令处理")
    print("=" * 60)
    
    test_command = 'get invalid json https://example.com'
    print(f"命令：{test_command}")
    
    executed, result = parse_and_execute_command(test_command)
    
    print(f"执行结果：executed={executed}, result={result}")
    print()

def test_normal_query():
    """测试普通查询（非命令）"""
    print("=" * 60)
    print("测试 5: 普通查询处理")
    print("=" * 60)
    
    test_query = "今天天气怎么样？"
    print(f"查询：{test_query}")
    
    executed, result = parse_and_execute_command(test_query)
    
    print(f"执行结果：executed={executed}, result={result}")
    print()

if __name__ == '__main__':
    print("\n开始测试增强的网络搜索功能\n")
    
    test_normal_query()
    test_invalid_command()
    test_multi_round_search()
    test_get_command()
    test_post_command()
    
    print("=" * 60)
    print("所有测试完成！")
    print("=" * 60)
