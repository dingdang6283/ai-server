#!/usr/bin/env python3
"""修复文件列表接口权限问题"""

with open('/media/dingdang/NAS/ai/server.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 修复文件列表接口
old_files_get = "@app.route('/v1/batch/files', methods=['GET'])\ndef proxy_list_files():"
new_files_get = "@app.route('/v1/batch/files', methods=['GET'])\n@require_auth\ndef proxy_list_files():"

content = content.replace(old_files_get, new_files_get)

old_files_delete = "@app.route('/v1/batch/files/<file_id>', methods=['DELETE'])\ndef proxy_delete_file(file_id):"
new_files_delete = "@app.route('/v1/batch/files/<file_id>', methods=['DELETE'])\n@require_auth\ndef proxy_delete_file(file_id):"

content = content.replace(old_files_delete, new_files_delete)

with open('/media/dingdang/NAS/ai/server.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("文件列表接口权限已修复")
