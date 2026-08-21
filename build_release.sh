#!/bin/bash
set -e

VERSION="2.1.4"
echo "🚀 FlashFlow v${VERSION} — Build Release (All Platforms)"
echo "========================================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Step 0: Auto-download latest official tools for all platforms
echo ""
echo "⬇️ [0/4] Downloading official platform-tools..."
bash tools/download_tools.sh

# Clean old builds
rm -rf build/bin/FlashFlow.app build/bin/FlashFlow.exe build/bin/*.zip build/bin/*.tar.gz build/bin/*.exe

# ========= MAC (Universal: Intel + Apple Silicon) =========
echo ""
echo "🍎 [1/4] Building macOS Universal Direct..."
wails build -platform darwin/universal -clean

APP_PATH="build/bin/FlashFlow.app"
if [ -d "$APP_PATH" ]; then
    echo "   → Bundling tools into .app/Contents/Resources/..."
    RESOURCES="$APP_PATH/Contents/Resources"

    cp tools/mac_silicon/adb "$RESOURCES/"
    cp tools/mac_silicon/fastboot "$RESOURCES/"
    cp tools/mac_silicon/payload-dumper-go "$RESOURCES/"
    mkdir -p "$RESOURCES/mac_intel"
    cp tools/mac_intel/payload-dumper-go "$RESOURCES/mac_intel/"
    chmod +x "$RESOURCES/adb" "$RESOURCES/fastboot" "$RESOURCES/payload-dumper-go"
    chmod +x "$RESOURCES/mac_intel/payload-dumper-go"

    cd build/bin
    zip -r "FlashFlow-v${VERSION}-macOS-Universal.zip" FlashFlow.app
    cd ../..
    echo "   ✅ macOS: build/bin/FlashFlow-v${VERSION}-macOS-Universal.zip"
else
    echo "   ❌ macOS build failed!"
    exit 1
fi

# ========= WINDOWS (amd64) =========
echo ""
echo "🪟 [2/4] Building Windows x64..."
wails build -platform windows/amd64

EXE_FILE="build/bin/FlashFlow.exe"
if [ -f "$EXE_FILE" ]; then
    echo "   → Bundling tools..."
    mkdir -p "build/bin/tools/win"
    cp tools/win/adb.exe "build/bin/tools/win/"
    cp tools/win/AdbWinApi.dll "build/bin/tools/win/"
    cp tools/win/AdbWinUsbApi.dll "build/bin/tools/win/"
    cp tools/win/fastboot.exe "build/bin/tools/win/"
    cp tools/win/payload-dumper-go.exe "build/bin/tools/win/"
    if [ -d "tools/win/driver" ]; then
        cp -r tools/win/driver "build/bin/tools/win/"
    fi
    echo "   ✅ Windows: FlashFlow.exe + tools ready"
else
    echo "   ❌ Windows build failed!"
    exit 1
fi

# ========= LINUX (amd64) via Docker =========
echo ""
echo "🐧 [3/4] Building Linux x64 via Docker..."
# Ensure Docker is running
docker info &>/dev/null || { echo "   ❌ Docker not running. Skip Linux build."; exit 1; }

# Build Docker image if not cached
DOCKER_TAG="flashflow-linux-builder:v2"
if ! docker image inspect "$DOCKER_TAG" &>/dev/null; then
    echo "   → Building Docker builder image (one-time)..."
    docker build -t "$DOCKER_TAG" -f build/linux/Dockerfile build/linux
    echo "   ✅ Docker image ready"
fi

echo "   → Building FlashFlow for Linux..."
docker run --rm -v "$(pwd):/build" -w /build "$DOCKER_TAG" -clean -skipbindings

LINUX_BIN="build/bin/FlashFlow"
if [ -f "$LINUX_BIN" ]; then
    echo "   → Bundling Linux tools..."
    mkdir -p "build/bin/tools/linux"
    cp tools/linux/adb "build/bin/tools/linux/"
    cp tools/linux/fastboot "build/bin/tools/linux/"
    cp tools/linux/payload-dumper-go "build/bin/tools/linux/"
    chmod +x "build/bin/tools/linux/adb" "build/bin/tools/linux/fastboot" "build/bin/tools/linux/payload-dumper-go"

    cd build/bin
    tar czf "FlashFlow-v${VERSION}-Linux-x64.tar.gz" FlashFlow tools/
    cd ../..
    echo "   ✅ Linux: build/bin/FlashFlow-v${VERSION}-Linux-x64.tar.gz"
else
    echo "   ❌ Linux build failed!"
    exit 1
fi

# ========= WINDOWS NSIS INSTALLER =========
echo ""
echo "📦 [4/4] Building Windows NSIS Installer..."
wails build -platform windows/amd64 -nsis

INSTALLER="build/bin/FlashFlow-amd64-installer.exe"
if [ -f "$INSTALLER" ]; then
    echo "   ✅ Installer: $INSTALLER"
else
    echo "   ❌ NSIS installer build failed!"
    exit 1
fi

# ========= SUMMARY =========
echo ""
echo "========================================================"
echo "🎉 BUILD COMPLETE!"
echo ""
echo "📦 Output files:"
ls -lh build/bin/FlashFlow-v${VERSION}*.zip build/bin/FlashFlow-v${VERSION}*.tar.gz build/bin/FlashFlow-amd64-installer.exe 2>/dev/null
echo ""
echo "📋 Next steps:"
echo "   1. Test all 3 platform builds"
echo "   2. Push release lên GitHub với tag: flashflow-v${VERSION}"
echo "   3. Upload cả ZIP (Mac), tar.gz (Linux), installer (Windows)"
echo "========================================================"
