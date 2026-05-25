#!/bin/bash

# ============================================================
# DingDang AI Cloud - 启动脚本
# ============================================================
# 使用方法：
#   ./start.sh           - 默认启动
#   ./start.sh debug     - 调试模式（前台运行，显示日志）
#   ./start.sh stop      - 停止服务
#   ./start.sh restart   - 重启服务
#   ./start.sh status    - 查看状态
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PID_FILE="server.pid"
LOG_FILE="logs/server.log"
SERVER_SCRIPT="server.py"

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印信息
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查虚拟环境
check_venv() {
    if [ ! -d ".venv" ]; then
        log_error "虚拟环境不存在，请先运行 ./install.sh"
        exit 1
    fi
}

# 检查配置文件
check_config() {
    if [ ! -f "config.yml" ]; then
        log_error "配置文件 config.yml 不存在"
        log_info "请复制 config.example.yml 并修改配置"
        exit 1
    fi
}

# 创建日志目录
ensure_log_dir() {
    mkdir -p logs
}

# 获取进程 ID
get_pid() {
    if [ -f "$PID_FILE" ]; then
        cat "$PID_FILE"
    else
        echo ""
    fi
}

# 检查服务是否运行
is_running() {
    local pid=$(get_pid)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# 启动服务
start_server() {
    local mode=$1
    
    if is_running; then
        log_warn "服务已在运行 (PID: $(get_pid))"
        log_info "如需重启，请先运行：./start.sh stop"
        exit 0
    fi
    
    check_venv
    check_config
    ensure_log_dir
    
    log_info "正在启动 DingDang AI Cloud..."
    
    if [ "$mode" == "debug" ]; then
        # 调试模式：前台运行，显示日志
        log_info "调试模式启动..."
        source .venv/bin/activate
        python3 $SERVER_SCRIPT
        deactivate
    else
        # 正常模式：后台运行
        source .venv/bin/activate
        nohup python3 $SERVER_SCRIPT > "$LOG_FILE" 2>&1 &
        echo $! > "$PID_FILE"
        deactivate
        
        sleep 2
        
        if is_running; then
            log_success "服务启动成功！(PID: $(get_pid))"
            log_info "日志文件：$LOG_FILE"
            log_info "查看日志：tail -f $LOG_FILE"
        else
            log_error "服务启动失败，请检查日志：$LOG_FILE"
            exit 1
        fi
    fi
}

# 停止服务
stop_server() {
    if ! is_running; then
        log_warn "服务未运行"
        return 0
    fi
    
    local pid=$(get_pid)
    log_info "正在停止服务 (PID: $pid)..."
    
    kill "$pid" 2>/dev/null
    sleep 2
    
    if kill -0 "$pid" 2>/dev/null; then
        log_warn "服务未正常停止，强制终止..."
        kill -9 "$pid" 2>/dev/null
    fi
    
    rm -f "$PID_FILE"
    log_success "服务已停止"
}

# 重启服务
restart_server() {
    stop_server
    sleep 1
    start_server
}

# 查看状态
show_status() {
    if is_running; then
        local pid=$(get_pid)
        log_success "服务运行中 (PID: $pid)"
        
        # 显示进程信息
        ps -p "$pid" -o pid,ppid,user,%cpu,%mem,etime,command 2>/dev/null
        
        # 显示最近的日志
        echo ""
        log_info "最近日志:"
        tail -n 10 "$LOG_FILE" 2>/dev/null || echo "无日志文件"
    else
        log_warn "服务未运行"
    fi
}

# 显示帮助
show_help() {
    echo "DingDang AI Cloud - 启动脚本"
    echo ""
    echo "用法：./start.sh [命令]"
    echo ""
    echo "命令:"
    echo "  (无参数)    启动服务（后台运行）"
    echo "  debug       调试模式（前台运行，显示日志）"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo "  status      查看服务状态"
    echo "  help        显示此帮助信息"
    echo ""
    echo "示例:"
    echo "  ./start.sh          # 启动服务"
    echo "  ./start.sh debug    # 调试模式"
    echo "  ./start.sh stop     # 停止服务"
    echo "  ./start.sh status   # 查看状态"
    echo ""
}

# 主逻辑
main() {
    local command=${1:-""}
    
    case "$command" in
        debug)
            start_server "debug"
            ;;
        stop)
            stop_server
            ;;
        restart)
            restart_server
            ;;
        status)
            show_status
            ;;
        help|--help|-h)
            show_help
            ;;
        "")
            start_server
            ;;
        *)
            log_error "未知命令：$command"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

# 执行主逻辑
main "$@"
