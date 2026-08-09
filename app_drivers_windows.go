//go:build windows

package main

import (
	"fmt"
	"io/fs"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// InstallDrivers: Hàm cài đặt driver thông minh (Hybrid: Silent + Interactive) - CHỈ CHẠY TRÊN WINDOWS
func (a *App) InstallDrivers() string {
	driverDir := filepath.Join(a.toolsDir, "driver")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [DRIVER] Bắt đầu quy trình cài đặt Driver...")

	// --- GIAI ĐOẠN 1: CÀI DRIVER .INF (Pixel / Generic) ---
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [1/2] Đang cài driver hệ thống (.inf)...")

	pnputilCmd := exec.Command("pnputil", "/add-driver", filepath.Join(driverDir, "*.inf"), "/subdirs", "/install")

	// Ẩn cửa sổ CMD (Chỉ hoạt động trên Windows, file này đã có tag build windows nên OK)
	pnputilCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}

	out, _ := pnputilCmd.CombinedOutput()
	wailsRuntime.EventsEmit(a.ctx, "flash_log", string(out))

	// --- GIAI ĐOẠN 2: CHẠY FILE CÀI ĐẶT .EXE (OnePlus) ---
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/2] Đang tìm trình cài đặt hãng (.exe)...")

	var exePath string
	err := filepath.Walk(driverDir, func(path string, info fs.FileInfo, err error) error {
		if err != nil {
			return err
		}
		name := strings.ToLower(info.Name())
		// Loại bỏ các file exe không phải driver cài đặt
		if !info.IsDir() && strings.HasSuffix(name, ".exe") &&
			name != "adb.exe" && name != "fastboot.exe" && name != "payload-dumper-go.exe" {
			exePath = path
			return fmt.Errorf("FOUND")
		}
		return nil
	})

	// [FIX LỖI] Xử lý biến err đã khai báo
	if err != nil && err.Error() != "FOUND" {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Lỗi quét file: "+err.Error())
	}

	if exePath != "" {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Phát hiện: "+filepath.Base(exePath))
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đang khởi chạy... Vui lòng cài đặt trên cửa sổ mới!")

		cmd := exec.Command(exePath)
		if err := cmd.Run(); err != nil {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Lỗi chạy file exe: "+err.Error())
		} else {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Cài đặt hãng hoàn tất.")
		}
	} else {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Không tìm thấy file cài đặt .exe nào (Chỉ cài .inf).")
	}

	return "Success"
}
