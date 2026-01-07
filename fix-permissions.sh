#!/bin/bash

# 修复数据库权限问题的脚本

set -e

echo "🔧 修复数据库权限问题..."
echo "=================================="

# 1. 创建data目录
echo "📁 创建data目录..."
mkdir -p data
chmod 777 data

# 2. 创建或修复emails.db文件
if [ ! -f "emails.db" ]; then
    echo "📝 创建空的数据库文件..."
    touch emails.db
fi

# 3. 设置文件权限
echo "🔐 设置文件权限..."
chmod 666 emails.db

# 4. 显示当前权限
echo ""
echo "📋 当前权限:"
ls -la emails.db
ls -la data/

# 5. 停止并删除旧容器
echo ""
echo "🛑 停止旧容器..."
docker compose down || true

# 6. 重新构建并启动
echo ""
echo "🔨 重新构建镜像..."
docker compose build --no-cache

echo ""
echo "🚀 启动服务..."
docker compose up -d

# 7. 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 10

# 8. 检查服务状态
echo ""
echo "📊 服务状态:"
docker compose ps

# 9. 显示日志
echo ""
echo "📋 最近日志:"
docker compose logs --tail=30

echo ""
echo "✅ 修复完成！"
echo ""
echo "💡 如果还有问题，请查看完整日志:"
echo "   docker compose logs -f"
