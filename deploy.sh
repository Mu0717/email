#!/bin/bash

# Outlook邮件客户端 - 智能部署/更新脚本
# 作者: AI Assistant
# 描述: 自动检测并执行初次部署或更新操作

set -e

echo "🚀 Outlook邮件客户端 - 智能部署脚本"
echo "======================================="

# 全局变量
COMPOSE_CMD=""
IS_UPDATE=false

# 检测是初次部署还是更新
detect_deployment_type() {
    if $COMPOSE_CMD ps 2>/dev/null | grep -q "Up"; then
        IS_UPDATE=true
        echo "🔄 检测到运行中的服务，执行更新流程"
    else
        IS_UPDATE=false
        echo "🆕 未检测到运行中的服务，执行初次部署流程"
    fi
}

# 检查Docker和docker-compose是否安装
check_dependencies() {
    echo "📋 检查依赖..."
    
    if ! command -v docker &> /dev/null; then
        echo "❌ Docker未安装，请先安装Docker"
        echo "   安装指南: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # 检测 docker compose 命令
    if docker compose version &> /dev/null; then
        COMPOSE_CMD="docker compose"
        echo "✅ 检测到 Docker Compose V2 (Plugin)"
    elif command -v docker-compose &> /dev/null; then
        COMPOSE_CMD="docker-compose"
        echo "✅ 检测到 Docker Compose V1 (Standalone)"
    else
        echo "❌ docker-compose未安装，请先安装docker-compose"
        echo "   安装指南: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    echo "✅ 依赖检查通过"
}

# 备份数据库
backup_database() {
    echo "📦 备份数据库..."
    if [ -f "emails.db" ]; then
        cp emails.db emails.db.backup.$(date +%Y%m%d_%H%M%S)
        echo "✅ 数据库已备份"
    else
        echo "⚠️  数据库文件不存在，跳过备份"
    fi
}

# Git操作：暂存本地更改并拉取最新代码
update_code() {
    echo "💾 暂存本地更改..."
    git stash push -m "Auto stash before deployment $(date +%Y%m%d_%H%M%S)"
    
    echo "⬇️  拉取最新代码..."
    git pull origin main
    
    echo "🔄 恢复数据库文件..."
    if [ -f "emails.db" ]; then
        echo "✅ 数据库文件已存在"
    else
        # 从stash中恢复数据库文件
        git checkout stash@{0} -- emails.db 2>/dev/null || echo "⚠️  没有需要恢复的数据库文件"
    fi
}

# 创建必要的目录（初次部署）
create_directories() {
    echo "📁 创建数据目录..."
    mkdir -p data
    
    # 创建空的emails.db如果不存在
    if [ ! -f "emails.db" ]; then
        touch emails.db
        echo "✅ 创建空的数据库文件"
    fi
}

# 构建和启动服务
deploy_service() {
    echo "🔨 重新构建Docker镜像..."
    $COMPOSE_CMD build
    
    if [ "$IS_UPDATE" = true ]; then
        echo "🔄 重启服务..."
        $COMPOSE_CMD down
        $COMPOSE_CMD up -d
    else
        echo "🚀 启动服务..."
        $COMPOSE_CMD up -d
    fi
    
    echo "⏳ 等待服务启动..."
    if [ "$IS_UPDATE" = true ]; then
        sleep 5
    else
        sleep 10
    fi
    
    # 检查服务状态
    if $COMPOSE_CMD ps | grep -q "Up"; then
        if [ "$IS_UPDATE" = true ]; then
            echo "✅ 服务更新成功！"
        else
            echo "✅ 服务启动成功！"
        fi
        echo ""
        echo "📋 服务状态:"
        $COMPOSE_CMD ps
        echo ""
        if [ "$IS_UPDATE" = false ]; then
            echo "📋 服务信息:"
            echo "   - Web界面: http://localhost:8002"
            echo "   - API文档: http://localhost:8002/docs"
        fi
        echo ""
        echo "🎉 部署完成！"
    else
        echo "❌ 服务启动失败，请检查日志:"
        $COMPOSE_CMD logs --tail=50
        exit 1
    fi
}

# 显示管理命令
show_management_commands() {
    echo ""
    echo "🛠️  常用管理命令:"
    echo "   启动服务: $COMPOSE_CMD up -d"
    echo "   停止服务: $COMPOSE_CMD down"
    echo "   重启服务: $COMPOSE_CMD restart"
    echo "   查看日志: $COMPOSE_CMD logs -f"
    echo "   查看状态: $COMPOSE_CMD ps"
    if [ "$IS_UPDATE" = true ]; then
        echo "   数据库备份: emails.db.backup.*"
    fi
    echo ""
}

# 主流程
main() {
    check_dependencies
    detect_deployment_type
    
    if [ "$IS_UPDATE" = true ]; then
        # 更新流程
        backup_database
        update_code
        deploy_service
    else
        # 初次部署流程
        create_directories
        deploy_service
    fi
    
    show_management_commands
}

# 捕获中断信号
trap 'echo "❌ 部署中断"; exit 1' INT

# 执行主流程
main

echo "✨ 感谢使用Outlook邮件客户端!"