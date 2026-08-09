package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) FlashXiaomiROM(zipPath string, shouldWipe bool) {
	a.UpdateProgress(5, "Khởi động Flash Engine (Xiaomi)...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Using device brand: xiaomi")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Rebooting to fastboot...")

	if err := a.normalizeToFastboot(); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR] "+err.Error())
		return
	}

	tempDir, err := os.MkdirTemp("", "flashflow_xiaomi_")
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR] Cannot create temp dir")
		return
	}
	defer os.RemoveAll(tempDir)

	a.UpdateProgress(10, "Đang giải nén ROM...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Extracting ROM...")
	if err := unzip(zipPath, tempDir); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR] Failed to extract ROM")
		return
	}

	// Payload handling
	payload := findFileRecursive(tempDir, "payload.bin")
	if payload != "" {
		a.UpdateProgress(20, "Đang xử lý Payload.bin...")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] payload.bin detected. Dumping...")
		imgOut := filepath.Join(tempDir, "payload_images")
		if err := os.MkdirAll(imgOut, 0755); err != nil {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR] Cannot create payload output dir")
			return
		}
		if err := a.dumpPayload(payload, imgOut); err != nil {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR] Payload dump failed")
			return
		}
	}

	imgDir := findImgRoot(tempDir)
	if imgDir == "" {
		imgDir = filepath.Join(tempDir, "payload_images")
	}

	if shouldWipe {
		a.UpdateProgress(25, "Xóa dữ liệu cũ (Wipe)...")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Wiping userdata...")
		_ = a.RunFastboot("erase", "userdata")
		_ = a.RunFastboot("erase", "metadata")
	}

	// Start Flashing Images
	a.UpdateProgress(30, "Chuẩn bị nạp phân vùng...")
	if err := flashXiaomiImages(a, imgDir); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR] "+err.Error())
		return
	}

	a.UpdateProgress(100, "Flash hoàn tất!")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Flash completed. Waiting for user action.")
}

func flashXiaomiImages(a *App, dir string) error {
	files, _ := os.ReadDir(dir)

	var early []string
	var super string
	var rest []string

	// Phân loại file
	for _, f := range files {
		if !strings.HasSuffix(f.Name(), ".img") {
			continue
		}
		name := f.Name()
		switch {
		case strings.HasPrefix(name, "boot"),
			strings.HasPrefix(name, "vendor_boot"),
			strings.HasPrefix(name, "init_boot"):
			early = append(early, name)
		case name == "super.img":
			super = name
		default:
			rest = append(rest, name)
		}
	}

	sort.Strings(early)
	sort.Strings(rest)

	// Tính tổng số bước để chia %
	// Tổng = len(early) + (1 nếu có super) + len(rest)
	totalSteps := len(early) + len(rest)
	if super != "" {
		totalSteps++
	}
	currentStep := 0

	// Helper update
	update := func(partName string) {
		currentStep++
		// Map % từ 30 -> 95
		p := 30 + int((float32(currentStep)/float32(totalSteps))*65)
		a.UpdateProgress(p, fmt.Sprintf("Flashing %s...", partName))
	}

	// 1. Flash Early (Boot/Kernel)
	for _, img := range early {
		part := strings.TrimSuffix(img, ".img")
		update(part)
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Flashing "+part)
		if err := a.RunFastboot("flash", part, filepath.Join(dir, img)); err != nil {
			return err
		}
	}

	// 2. Flash Super (System/Vendor/Product...)
	if super != "" {
		update("super")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Flashing super (This is large)...")
		if err := a.RunFastboot("flash", "super", filepath.Join(dir, super)); err != nil {
			return err
		}
	}

	// 3. Flash Rest (Firmware/Modem/etc)
	for _, img := range rest {
		part := strings.TrimSuffix(img, ".img")

		// Bỏ qua các phân vùng nhạy cảm hoặc bị khóa
		if isXiaomiSkipPartition(part) {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "! Skipped (Auto): "+part)
			// Vẫn tăng step để % chạy đúng
			currentStep++
			continue
		}

		update(part)
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Flashing "+part)
		if err := a.RunFastboot("flash", part, filepath.Join(dir, img)); err != nil {
			// Nếu gặp lỗi "not allowed" (phân vùng bị khóa), chỉ warn chứ không fail
			if strings.Contains(err.Error(), "not allowed") {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", "! Skipped (Locked): "+part)
				continue
			}
			return fmt.Errorf("xiaomi flash failed at %s: %w", part, err)
		}
	}

	return nil
}

func (a *App) RunFastboot(args ...string) error {
	cmd := exec.Command(a.GetToolPath("fastboot"), args...)
	// Không cần log output ở đây vì flasher loop đã log rồi, tránh spam log
	return cmd.Run()
}

func isXiaomiSkipPartition(p string) bool {
	switch p {
	case
		"tz",
		"xbl",
		"xbl_config",
		"abl",
		"aop",
		"aop_config",
		"devcfg",
		"hyp",
		"keymaster",
		"qupfw",
		"uefi",
		"uefisecapp",
		"imagefv",
		"engineering_cdt",
		"shrm",
		"splash":
		return true
	default:
		return false
	}
}
