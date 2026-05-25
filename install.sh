#!/bin/bash

# ============================================================
# DingDang AI Cloud - 自动安装脚本
# ============================================================
# 使用方法：bash install.sh
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "  DingDang AI Cloud - 自动安装脚本"
echo "=========================================="
echo ""

# 检测操作系统
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
    elif [ "$(uname)" == "Darwin" ]; then
        OS="macOS"
    else
        OS="Unknown"
    fi
    echo "检测到操作系统：$OS"
}

# 检查 Python 版本
check_python() {
    echo ""
    echo ">>> 检查 Python 版本..."
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version)
        echo "✓ 已安装：$PYTHON_VERSION"
    else
        echo "✗ 错误：未找到 Python 3"
        echo "请先安装 Python 3.9 或更高版本"
        exit 1
    fi
}

# 检查 pip
check_pip() {
    echo ""
    echo ">>> 检查 pip..."
    if command -v pip3 &> /dev/null; then
        PIP_VERSION=$(pip3 --version)
        echo "✓ 已安装：$PIP_VERSION"
    else
        echo "✗ 错误：未找到 pip3"
        exit 1
    fi
}

# 安装系统依赖
install_system_deps() {
    echo ""
    echo ">>> 安装系统依赖..."
    
    case $OS in
        *"Ubuntu"*|*"Debian"*)
            echo "检测到 Debian/Ubuntu 系统"
            sudo apt-get update
            sudo apt-get install -y python3-pip python3-venv
            ;;
        *"CentOS"*|*"Fedora"*|*"Red Hat"*)
            echo "检测到 RHEL/CentOS 系统"
            sudo yum install -y python3-pip python3-virtualenv
            ;;
        *"Arch"*|*"Manjaro"*)
            echo "检测到 Arch 系统"
            sudo pacman -S --noconfirm python python-pip python-virtualenv
            ;;
        *"Alpine"*)
            echo "检测到 Alpine 系统"
            sudo apk add --no-cache python3 py3-pip
            ;;
        "macOS")
            echo "检测到 macOS"
            if command -v brew &> /dev/null; then
                brew install python3
            else
                echo "请先安装 Homebrew: https://brew.sh"
            fi
            ;;
        *)
            echo "⚠ 未知系统，请手动安装 Python 3.9+ 和 pip"
            ;;
    esac
}

# 创建虚拟环境
create_venv() {
    echo ""
    echo ">>> 创建 Python 虚拟环境..."
    
    if [ ! -d ".venv" ]; then
        python3 -m venv .venv
        echo "✓ 虚拟环境创建成功"
    else
        echo "✓ 虚拟环境已存在"
    fi
}

# 安装 Python 依赖
install_python_deps() {
    echo ""
    echo ">>> 安装 Python 依赖..."
    
    source .venv/bin/activate
    
    if [ -f "requirements.txt" ]; then
        pip install --upgrade pip
        pip install -r requirements.txt
        echo "✓ Python 依赖安装完成"
    else
        echo "✗ 错误：未找到 requirements.txt"
        exit 1
    fi
    
    deactivate
}

# 创建配置文件
create_config() {
    echo ""
    echo ">>> 检查配置文件..."
    
    if [ ! -f "config.yml" ]; then
        echo "⚠ 未找到 config.yml，正在创建示例配置..."
        cp config.example.yml config.yml 2>/dev/null || {
            echo "✗ 错误：未找到 config.example.yml"
            echo "请手动创建 config.yml 配置文件"
            exit 1
        }
        echo "✓ 配置文件创建成功"
        echo "⚠ 请编辑 config.yml 填入实际配置值"
    else
        echo "✓ 配置文件已存在"
    fi
}

# 创建数据目录
create_directories() {
    echo ""
    echo ">>> 创建必要目录..."
    
    mkdir -p logs
    mkdir -p data
    echo "✓ 目录创建完成"
}

# 设置文件权限
set_permissions() {
    echo ""
    echo ">>> 设置文件权限..."
    
    chmod +x start.sh
    chmod +x install.sh
    echo "✓ 权限设置完成"
}

# 显示安装完成信息
show_completion() {
    echo ""
    echo "=========================================="
    echo "  安装完成！"
    echo "=========================================="
    echo ""
    echo "下一步操作："
    echo "  1. 编辑 config.yml 配置文件"
    echo "  2. 运行 ./start.sh 启动服务"
    echo ""
    echo "常用命令："
    echo "  ./start.sh          - 启动服务"
    echo "  ./start.sh debug    - 调试模式启动"
    echo "  source .venv/bin/activate  - 激活虚拟环境"
    echo ""
}

# 主流程
main() {
    detect_os
    check_python
    check_pip
    install_system_deps
    create_venv
    install_python_deps
    create_config
    create_directories
    set_permissions
    show_completion
}

# 执行主流程
main
