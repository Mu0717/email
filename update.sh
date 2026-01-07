#!/bin/bash

# 服务器部署更新脚本
# 用于在服务器上安全地拉取代码并更新服务

set -e

echo "🚀 开始部署更新..."
echo "=================================="

# 1. 备份数据库
echo "📦 备份数据库..."
if [ -f "emails.db" ]; then
    cp emails.db emails.db.backup.$(date +%Y%m%d_%H%M%S)
    echo "✅ 数据库已备份"
fi

# 2. 暂存本地更改（主要是数据库文件）
echo "💾 暂存本地更改..."
git stash push -m "Auto stash before deployment $(date +%Y%m%d_%H%M%S)"

# 3. 拉取最新代码
echo "⬇️  拉取最新代码..."
git pull origin main

# 4. 恢复数据库文件（如果被暂存了）
echo "🔄 恢复数据库文件..."
if [ -f "emails.db" ]; then
    echo "✅ 数据库文件已存在"
else
    # 从stash中恢复数据库文件
    git checkout stash@{0} -- emails.db 2>/dev/null || echo "⚠️  没有需要恢复的数据库文件"
fi

# 5. 检测 docker compose 命令
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "❌ docker-compose未安装"
    exit 1
fi

# 6. 重新构建并启动服务
echo "🔨 重新构建Docker镜像..."
$COMPOSE_CMD build

echo "🔄 重启服务..."
$COMPOSE_CMD down
$COMPOSE_CMD up -d

# 7. 等待服务启动
echo "⏳ 等待服务启动..."
sleep 5

# 8. 检查服务状态
if $COMPOSE_CMD ps | grep -q "Up"; then
    echo "✅ 服务更新成功！"
    echo ""
    echo "📋 服务状态:"
    $COMPOSE_CMD ps
    echo ""
    echo "🎉 部署完成！"
else
    echo "❌ 服务启动失败，请检查日志:"
    $COMPOSE_CMD logs --tail=50
    exit 1
fi

echo ""
echo "💡 提示:"
echo "   - 查看日志: $COMPOSE_CMD logs -f"
echo "   - 查看状态: $COMPOSE_CMD ps"
echo "   - 数据库备份位置: emails.db.backup.*"
