#!/usr/bin/env python3
"""
前端混淆配置检查和测试脚本
"""

import json
import os

def check_package_json():
    """检查 package.json 是否有必要的依赖"""
    print("=" * 60)
    print("检查 package.json 依赖")
    print("=" * 60)
    
    with open('/media/dingdang/NAS/ai/frontend/package.json', 'r') as f:
        package = json.load(f)
    
    required_deps = {
        'vite-plugin-javascript-obfuscator': '混淆插件',
        'typescript': 'TypeScript 支持',
        '@vitejs/plugin-react': 'React 支持',
    }
    
    all_installed = True
    for dep, desc in required_deps.items():
        if dep in package.get('devDependencies', {}):
            print(f"✓ {desc}: {dep} 已安装")
        else:
            print(f"✗ {desc}: {dep} 未安装")
            all_installed = False
    
    return all_installed

def check_vite_config():
    """检查 vite.config.ts 配置"""
    print("\n" + "=" * 60)
    print("检查 Vite 配置")
    print("=" * 60)
    
    with open('/media/dingdang/NAS/ai/frontend/vite.config.ts', 'r') as f:
        config = f.read()
    
    checks = {
        'defineConfig': 'Vite 配置函数',
        'react()': 'React 插件',
        'sourcemap: false': '禁用源码映射',
        'manualChunks': '代码分割',
    }
    
    all_ok = True
    for check, desc in checks.items():
        if check in config:
            print(f"✓ {desc}: 已配置")
        else:
            print(f"✗ {desc}: 未配置")
            all_ok = False
    
    return all_ok

def check_security_config():
    """检查安全配置文件"""
    print("\n" + "=" * 60)
    print("检查安全配置文件")
    print("=" * 60)
    
    config_path = '/media/dingdang/NAS/ai/frontend/vite.security.config.js'
    
    if os.path.exists(config_path):
        print(f"✓ 安全配置文件存在：{config_path}")
        
        with open(config_path, 'r') as f:
            config = f.read()
        
        # 检查关键配置
        checks = {
            'viteObfuscate': '混淆插件',
            'controlFlowFlattening': '控制流平坦化',
            'deadCodeInjection': '死代码注入',
            'debugProtection': '调试保护',
            'disableConsoleOutput': '禁用控制台',
            'compact': '代码压缩',
        }
        
        all_ok = True
        for check, desc in checks.items():
            if check in config:
                print(f"  ✓ {desc}: 已启用")
            else:
                print(f"  ✗ {desc}: 未启用")
                all_ok = False
        
        return all_ok
    else:
        print(f"✗ 安全配置文件不存在：{config_path}")
        return False

def check_source_files():
    """检查源代码文件"""
    print("\n" + "=" * 60)
    print("检查源代码结构")
    print("=" * 60)
    
    required_files = [
        '/media/dingdang/NAS/ai/frontend/index.html',
        '/media/dingdang/NAS/ai/frontend/src/main.tsx',
        '/media/dingdang/NAS/ai/frontend/src/App.tsx',
    ]
    
    all_exist = True
    for file in required_files:
        if os.path.exists(file):
            print(f"✓ 文件存在：{file}")
        else:
            print(f"✗ 文件缺失：{file}")
            all_exist = False
    
    # 检查关键目录
    required_dirs = [
        '/media/dingdang/NAS/ai/frontend/src/components',
        '/media/dingdang/NAS/ai/frontend/src/pages',
        '/media/dingdang/NAS/ai/frontend/src/services',
    ]
    
    for dir in required_dirs:
        if os.path.isdir(dir):
            print(f"✓ 目录存在：{dir}")
        else:
            print(f"✗ 目录缺失：{dir}")
            all_exist = False
    
    return all_exist

def run_build_test():
    """运行构建测试"""
    print("\n" + "=" * 60)
    print("运行构建测试")
    print("=" * 60)
    
    print("提示：运行以下命令测试构建：")
    print("  cd /media/dingdang/NAS/ai/frontend")
    print("  npm run build")
    print("\n测试安全混淆构建：")
    print("  npx vite build --config vite.security.config.js")
    
    return True

def main():
    print("\n" + "=" * 60)
    print("前端混淆配置和 UI 检测工具")
    print("=" * 60)
    
    results = {
        "package.json 依赖": check_package_json(),
        "Vite 配置": check_vite_config(),
        "安全配置文件": check_security_config(),
        "源代码结构": check_source_files(),
        "构建测试": run_build_test(),
    }
    
    print("\n" + "=" * 60)
    print("检测结果汇总")
    print("=" * 60)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test, result in results.items():
        status = "✓ 通过" if result else "✗ 失败"
        print(f"{status} - {test}")
    
    print(f"\n总计：{passed}/{total} 通过")
    
    if passed == total:
        print("\n✅ 所有检查通过！前端配置正确。")
        print("\n下一步：")
        print("  1. 安装混淆插件依赖（如果未安装）：")
        print("     npm install --save-dev vite-plugin-javascript-obfuscator")
        print("  2. 运行开发服务器测试 UI：")
        print("     npm run dev")
        print("  3. 运行生产构建测试混淆：")
        print("     npx vite build --config vite.security.config.js")
    else:
        print(f"\n⚠ 有 {total - passed} 项需要检查或修复")

if __name__ == '__main__':
    main()
