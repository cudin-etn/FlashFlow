#!/bin/bash
set -e

echo "========================================"
echo "  FlashFlow - Download Official Tools"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DOWNLOAD_DIR="$SCRIPT_DIR/_download"
mkdir -p "$DOWNLOAD_DIR"

download_and_extract() {
    local os_name="$1"       # linux / darwin / windows
    local target_dir="$2"    # where to put adb + fastboot
    local zip_url="$3"
    local zip_file="$DOWNLOAD_DIR/platform-tools-latest-$os_name.zip"

    echo ""
    echo ">>> [$os_name] Downloading platform-tools..."
    if [ ! -f "$zip_file" ]; then
        curl -fL --progress-bar "$zip_url" -o "$zip_file"
    else
        echo "    Already downloaded, reusing cached: $zip_file"
    fi

    echo ">>> [$os_name] Extracting adb + fastboot..."
    mkdir -p "$target_dir"
    # temp dir for extraction
    local tmp_dir="$DOWNLOAD_DIR/extract_$os_name"
    rm -rf "$tmp_dir"
    mkdir -p "$tmp_dir"

    unzip -q -o "$zip_file" -d "$tmp_dir"

    # Find and copy adb + fastboot (they're somewhere under platform-tools/)
    find "$tmp_dir" -type f \( -name "adb" -o -name "adb.exe" -o -name "fastboot" -o -name "fastboot.exe" \) | while read f; do
        cp -v "$f" "$target_dir/"
        chmod +x "$target_dir/$(basename "$f")"
    done

    rm -rf "$tmp_dir"
    echo ">>> [$os_name] Done => $target_dir"
}

# --- LINUX ---
download_and_extract \
    "linux" \
    "$SCRIPT_DIR/linux" \
    "https://dl.google.com/android/repository/platform-tools-latest-linux.zip"

# --- MAC (refresh if needed) ---
download_and_extract \
    "darwin" \
    "$SCRIPT_DIR/mac_silicon" \
    "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"

# Google's Darwin platform-tools are universal binaries. Keep a mirrored Intel
# folder so local/dev tool discovery works on both macOS architectures.
mkdir -p "$SCRIPT_DIR/mac_intel"
cp -v "$SCRIPT_DIR/mac_silicon/adb" "$SCRIPT_DIR/mac_intel/"
cp -v "$SCRIPT_DIR/mac_silicon/fastboot" "$SCRIPT_DIR/mac_intel/"
chmod +x "$SCRIPT_DIR/mac_intel/adb" "$SCRIPT_DIR/mac_intel/fastboot"

# --- WINDOWS (refresh if needed) ---
download_and_extract \
    "windows" \
    "$SCRIPT_DIR/win" \
    "https://dl.google.com/android/repository/platform-tools-latest-windows.zip"

# Cleanup downloads (optional - keep cached)
# rm -rf "$DOWNLOAD_DIR"

echo ""
echo "========================================"
echo "  All tools up to date!"
echo "========================================"
echo ""
echo "Contents:"
for d in linux mac_silicon mac_intel win; do
    echo "  tools/$d/:"
    ls -lh "$SCRIPT_DIR/$d/" 2>/dev/null | grep -v "^total"
done
