#!/bin/bash
set -e

echo ">>> [Docker] Rebuilding platform-specific binary for esbuild..."
cd /build/frontend
npm rebuild esbuild 2>&1 || npm ci --platform=linux 2>&1

echo ">>> [Docker] Running wails build..."
cd /build
exec /root/go/bin/wails build -platform linux/amd64 "$@"
