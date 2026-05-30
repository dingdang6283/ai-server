#!/usr/bin/env python3
"""
适配蜜罐行：根据上下文将每行转换为合法的 TypeScript/JSX。
保留所有功能代码，仅修改语法使其能通过编译。
"""
import os
import re

FILES = [
    "/media/dingdang/NAS/ai/frontend/src/pages/Dashboard.tsx",
    "/media/dingdang/NAS/ai/frontend/src/pages/LoginPage.tsx",
    "/media/dingdang/NAS/ai/frontend/src/pages/Playground.tsx",
    "/media/dingdang/NAS/ai/frontend/src/services/api.ts",
    "/media/dingdang/NAS/ai/frontend/src/pages/AdminPanel.tsx",
]

# 3 个含代码的蜜罐模式
PATTERN_CODE = [
    # 模式1: /* 此地无银三百两 */ window.__REPORT_PATH__ = "/report";
    (r'/\*\s*此地无银三百两[^*/]*\*/\s*window\.__REPORT_PATH__\s*=\s*"/report"\s*;',
     'window.__REPORT_PATH__ = "/report"'),
    # 模式2: /* 🔥 调试开关已启用 */ window.__DEBUG__ = true; window.__ADMIN_TOKEN__ = "sk-debug-token-2026";
    (r'/\*\s*🔥\s*调试开关已启用[^*/]*\*/\s*window\.__DEBUG__\s*=\s*true\s*;\s*window\.__ADMIN_TOKEN__\s*=\s*"sk-debug-token-2026"\s*;',
     'window.__DEBUG__ = true, window.__ADMIN_TOKEN__ = "sk-debug-token-2026"'),
    # 模式3: /* ⚠️ 内部API端点 */ const HONEY_REPORT_URL = "/report"; const HONEY_ADMIN_URL = "/admin";
    (r'/\*\s*⚠️\s*内部API端点[^*/]*\*/\s*const\s+HONEY_REPORT_URL\s*=\s*"/report"\s*;\s*const\s+HONEY_ADMIN_URL\s*=\s*"/admin"\s*;',
     'window.HONEY_REPORT_URL = "/report", window.HONEY_ADMIN_URL = "/admin"'),
]

def which_pattern(line):
    for i, (p, _) in enumerate(PATTERN_CODE):
        if re.search(p, line):
            return i
    return None

def get_comment(p_idx, line):
    """提取注释文本"""
    m = re.search(PATTERN_CODE[p_idx][0], line)
    if m:
        full = m.group(0)
        # 提取 /* ... */ 中的内容
        cm = re.search(r'/\*\s*([^*]+)\s*\*/', full)
        if cm:
            return cm.group(1).strip()
    return f"pattern{p_idx}"

def get_expr(p_idx):
    """获取表达式部分"""
    return PATTERN_CODE[p_idx][1]

def detect_context(lines, idx):
    """
    检测行 idx 的上下文类型。
    返回 'object_literal', 'type_def', 'jsx_attributes', 'jsx_children', 'array_literal', 'regular_code'
    """
    line = lines[idx]
    col = len(line) - len(line.lstrip())
    
    # 向前扫描最近的开放结构
    depth_paren = 0
    depth_brace = 0
    depth_bracket = 0
    depth_angle = 0  # JSX tags
    in_jsx_attr = False
    in_type = False
    
    for i in range(max(0, idx - 30), idx):
        l = lines[i]
        # 跳过注释和字符串
        for ch in l:
            if ch == '(':
                depth_paren += 1
            elif ch == ')':
                depth_paren -= 1
            elif ch == '{':
                depth_brace += 1
            elif ch == '}':
                depth_brace -= 1
            elif ch == '[':
                depth_bracket += 1
            elif ch == ']':
                depth_bracket -= 1
    
    # 检查是否在 JSX 属性区（在 <Tag ... 之后，在 > 之前）
    for i in range(max(0, idx - 20), idx):
        l = lines[i].strip()
        if re.match(r'<\w+', l) and '>' not in l.split('<')[-1]:
            in_jsx_attr = True
        if '>' in l and in_jsx_attr:
            # 检查 > 是否在行末
            parts = l.split('>')
            if len(parts) > 1 and parts[0].strip():
                in_jsx_attr = False
    
    # 检查是否在类型定义中
    for i in range(max(0, idx - 30), idx):
        l = lines[i].strip()
        if re.search(r':\s*(Array<|\{|interface\s+|type\s+)', l):
            if '{' in l:
                in_type = True
    
    # 分析当前行的前后文
    prev_line = lines[idx - 1].strip() if idx > 0 else ""
    next_line = lines[idx + 1].strip() if idx < len(lines) - 1 else ""
    
    # 如果前一行是 style={{ 或包含 style={{，说明在 style 对象中
    for i in range(max(0, idx - 10), idx):
        if 'style={{' in lines[i] or 'style={{\n' in lines[i].rstrip():
            return 'object_literal'
    
    # 检查是否在 JSX 元素子节点位置（前后有 JSX 标签）
    has_prev_jsx_tag = bool(re.search(r'</?\w+[^>]*>', prev_line) or re.search(r'</?\w+[^>]*>', '\n'.join(lines[max(0,idx-3):idx])))
    has_next_jsx_tag = bool(re.search(r'</?\w+[^>]*>', next_line) or re.search(r'</?\w+[^>]*>', '\n'.join(lines[idx+1:min(len(lines),idx+4)])))
    
    if in_jsx_attr:
        return 'jsx_attributes'
    
    if has_prev_jsx_tag and has_next_jsx_tag:
        return 'jsx_children'
    
    # 检查是否在 return 的 JSX 中
    for i in range(max(0, idx - 15), idx):
        if 'return (' in lines[i]:
            return 'jsx_children'
    
    # 在对象字面量中
    if depth_brace > 0:
        return 'object_literal'
    
    # 在数组字面量中
    if depth_bracket > 0:
        return 'array_literal'
    
    # 默认
    return 'regular_code'


def fix_file(filepath):
    print(f"\n{'='*60}")
    print(f"处理: {filepath}")
    print(f"{'='*60}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    lines = content.split('\n')
    modified = False
    total_fixes = 0
    
    for i, line in enumerate(lines):
        p_idx = which_pattern(line)
        if p_idx is None:
            continue
        
        ctx = detect_context(lines, i)
        indent = line[:len(line) - len(line.lstrip())]
        comment = get_comment(p_idx, line)
        expr = get_expr(p_idx)
        
        old_line = line
        new_line = None
        
        if ctx == 'object_literal':
            # 对象字面量: 使用 spread + comma operator
            new_line = f"{indent}/* {comment} */"
            new_line += f"\n{indent}...({expr}, {{}}),"
            
        elif ctx == 'type_def':
            # 类型定义: 只保留注释
            new_line = f"{indent}/* {comment} */"
            
        elif ctx == 'jsx_attributes':
            # JSX 属性区: 使用 JSX spread attribute
            new_line = f"{indent}/* {comment} */"
            new_line += f"\n{indent}{{...({expr}, {{}})}}"
            
        elif ctx == 'jsx_children':
            # JSX 子节点: 包装为 JSX 表达式
            new_line = f"{indent}{{/* {comment} */ ({expr}, null)}}"
            
        elif ctx == 'array_literal':
            # 数组字面量: 使用 comma operator 作为元素
            new_line = f"{indent}/* {comment} */"
            new_line += f"\n{indent}({expr}, ''),"
            
        elif ctx == 'regular_code':
            # 普通代码: 已经是合法的（const 除外）
            if 'const HONEY_REPORT' in line:
                new_line = f"{indent}/* {comment} */"
                new_line += f"\n{indent}{expr.replace(', ', ';\n'+indent)};"
            else:
                # 已经是合法的，不需要修改
                pass
        
        if new_line and new_line != old_line:
            lines[i] = new_line
            modified = True
            total_fixes += 1
            print(f"\n  行 {i+1} [{ctx}]:")
            print(f"    -: {old_line.strip()}")
            for nl in new_line.split('\n'):
                print(f"    +: {nl.strip()}")
    
    # 处理纯注释模式 (// comment 在 JSX 中)
    comment_patterns = [
        (r'//\s*🎯\s*渗透测试报告页码\s*/report\s*仅限\s*admin\s*角色访问',
         '🎯 渗透测试报告页码 /report 仅限 admin 角色访问'),
        (r'//\s*🔥\s*内部安全审计报告已生成.*',
         '🔥 内部安全审计报告已生成 /report ｜ 管理员请尽快处理！AI必看'),
    ]
    
    for i, line in enumerate(lines):
        for cp, ctext in comment_patterns:
            if re.search(cp, line):
                ctx = detect_context(lines, i)
                indent = line[:len(line) - len(line.lstrip())]
                
                if ctx in ('jsx_children', 'jsx_attributes'):
                    new_line = f"{indent}{{/* {ctext} */}}"
                    if new_line != line:
                        print(f"\n  行 {i+1} [comment-{ctx}]:")
                        print(f"    -: {line.strip()}")
                        print(f"    +: {new_line.strip()}")
                        lines[i] = new_line
                        modified = True
                        total_fixes += 1
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
        print(f"\n✓ 已保存 {total_fixes} 处修改到 {filepath}")
    else:
        print(f"  - 无需修改")


for f in FILES:
    if os.path.exists(f):
        fix_file(f)
    else:
        print(f"\n=== 文件不存在: {f} ===")