#!/bin/bash

echo "🔧 初始化管理员账号..."
uv run python init_admin.py

echo "🚀 启动服务..."
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload