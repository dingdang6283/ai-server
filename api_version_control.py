#!/usr/bin/env python3
"""
API 版本控制实现
支持多版本 API 共存和渐进式升级
"""

api_version_patch = '''
# ==================== API 版本控制 ====================

from functools import wraps

# API 版本配置
API_VERSIONS = ['v1', 'v2']  # 支持的 API 版本
DEFAULT_API_VERSION = 'v1'  # 默认版本
DEPRECATED_VERSIONS = []  # 已废弃的版本

def get_api_version():
    """从请求头或 URL 获取 API 版本"""
    # 优先从 URL 路径获取
    path = request.path
    for version in API_VERSIONS:
        if path.startswith(f'/api/{version}/') or path.startswith(f'/v1/{version}/'):
            return version
    
    # 从请求头获取
    version_header = request.headers.get('X-API-Version', DEFAULT_API_VERSION)
    if version_header in API_VERSIONS:
        return version_header
    
    return DEFAULT_API_VERSION


def api_version_required(versions=None):
    """API 版本验证装饰器"""
    if versions is None:
        versions = API_VERSIONS
    
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            version = get_api_version()
            
            if version not in versions:
                return json_response({
                    "error": f"不支持的 API 版本：{version}",
                    "supported_versions": versions
                }, 400)
            
            if version in DEPRECATED_VERSIONS:
                logger.warning(f"使用已废弃的 API 版本：{version}")
                # 添加废弃警告头
                response = f(*args, **kwargs)
                if hasattr(response, 'headers'):
                    response.headers['X-API-Deprecated'] = 'true'
                    response.headers['X-API-Sunset'] = '2026-12-31'
                return response
            
            request.api_version = version
            return f(*args, **kwargs)
        return decorated
    return decorator


# 版本化路由助手
def versioned_route(rule, versions=None, **options):
    """创建版本化路由"""
    if versions is None:
        versions = API_VERSIONS
    
    def decorator(f):
        for version in versions:
            versioned_rule = rule.replace('/api/', f'/api/{version}/')
            app.add_url_rule(versioned_rule, view_func=f, **options)
        return f
    return decorator


# API 版本中间件
@app.before_request
def check_api_version():
    """检查和记录 API 版本使用情况"""
    if request.path.startswith('/api/') or request.path.startswith('/v1/'):
        version = get_api_version()
        request.api_version = version
        
        # 记录版本使用统计
        if not hasattr(app, 'api_version_stats'):
            app.api_version_stats = {}
        
        if version not in app.api_version_stats:
            app.api_version_stats[version] = 0
        app.api_version_stats[version] += 1


# API 版本信息端点
@app.route('/api/version', methods=['GET'])
def api_version_info():
    """返回 API 版本信息"""
    return json_response({
        "current_version": get_api_version(),
        "supported_versions": API_VERSIONS,
        "deprecated_versions": DEPRECATED_VERSIONS,
        "default_version": DEFAULT_API_VERSION,
        "version_stats": getattr(app, 'api_version_stats', {})
    })


# 版本迁移助手
def migrate_request_data(version, data):
    """根据版本迁移请求数据"""
    if version == 'v2':
        # v2 版本的数据格式转换
        if 'user_id' in data:
            data['userId'] = data.pop('user_id')
        if 'api_key' in data:
            data['apiKey'] = data.pop('api_key')
    return data


def migrate_response_data(version, data):
    """根据版本迁移响应数据"""
    if version == 'v2':
        # v2 版本的数据格式转换（驼峰命名）
        if isinstance(data, dict):
            new_data = {}
            for key, value in data.items():
                # 蛇形转驼峰
                new_key = ''.join(word.title() if i > 0 else word 
                                 for i, word in enumerate(key.split('_')))
                new_data[new_key] = value
            return new_data
    return data

'''

# 将补丁写入 server.py
with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 在文件末尾添加 API 版本控制代码
if 'API 版本控制' not in content:
    # 找到文件末尾（在 if __name__ == '__main__' 之前）
    if "if __name__ == '__main__':" in content:
        parts = content.split("if __name__ == '__main__':")
        content = parts[0] + api_version_patch + "\nif __name__ == '__main__':" + parts[1]
    else:
        content += "\n" + api_version_patch
    
    with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("API 版本控制已添加")
else:
    print("API 版本控制已存在")
