package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Entry point for flashing Pixel ROMs
func (a *App) FlashPixelROM(romPath string, shouldWipe bool) error {
	a.UpdateProgress(5, "Khởi động Flash Engine (Pixel)...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Using Pixel flash engine")

	// Pixel always flashes in fastboot (no fastbootD)
	if err := a.normalizeToFastboot(); err != nil {
		return err
	}

	if isPixelFactoryImage(romPath) {
		return a.flashPixelFactory(romPath, shouldWipe)
	}

	return a.flashPixelOTA(romPath, shouldWipe)
}

// ---------- Pixel Factory ROM ----------

func (a *App) flashPixelFactory(romZip string, shouldWipe bool) error {
	a.UpdateProgress(10, "Phát hiện ROM Factory. Đang giải nén...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Pixel Factory ROM detected")

	workDir, err := a.extractZipToTempDir(romZip)
	if err != nil {
		return err
	}
	defer os.RemoveAll(workDir) // Cleanup sau khi xong

	// 1. Flash bootloader
	bootloader := a.findFirstMatch(workDir, "bootloader-*.img")
	if bootloader != "" {
		a.UpdateProgress(20, "Flashing Bootloader...")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Flashing bootloader")
		if err := a.fastbootFlash("bootloader", bootloader); err != nil {
			return err
		}
		a.fastbootRebootBootloader()
	}

	// 2. Flash radio
	radio := a.findFirstMatch(workDir, "radio-*.img")
	if radio != "" {
		a.UpdateProgress(30, "Flashing Radio...")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Flashing radio")
		if err := a.fastbootFlash("radio", radio); err != nil {
			return err
		}
		a.fastbootRebootBootloader()
	}

	// 3. fastboot update image-*.zip (with -w only if shouldWipe)
	imageZip := a.findFirstMatch(workDir, "image-*.zip")
	if imageZip == "" {
		return fmt.Errorf("cannot find image-*.zip in factory ROM")
	}

	a.UpdateProgress(40, "Đang chạy cập nhật hệ thống (Sẽ mất vài phút)...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Running fastboot update (This may take a while)...")

	args := []string{"update", imageZip}
	if shouldWipe {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Wipe data option enabled (-w)")
		args = append([]string{"-w"}, args...)
	}

	// Lệnh này chạy rất lâu, ta chỉ có thể đợi
	if err := a.runFastboot(args...); err != nil {
		return err
	}

	a.UpdateProgress(100, "Flash hoàn tất!")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Pixel factory flash completed. Device awaiting user action.")

	return nil
}

// ---------- Pixel OTA ROM ----------

func (a *App) flashPixelOTA(romZip string, shouldWipe bool) error {
	a.UpdateProgress(10, "Phát hiện ROM OTA. Đang xử lý...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Pixel OTA ROM detected")

	workDir, err := a.extractZipToTempDir(romZip)
	if err != nil {
		return err
	}
	defer os.RemoveAll(workDir)

	payload := filepath.Join(workDir, "payload.bin")
	if _, err := os.Stat(payload); err != nil {
		return fmt.Errorf("payload.bin not found in OTA ROM")
	}

	a.UpdateProgress(20, "Đang giải nén Payload.bin...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Extracting payload.bin")

	imgDir := filepath.Join(workDir, "payload_images")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		return err
	}
	if err := a.dumpPayload(payload, imgDir); err != nil {
		return err
	}

	// Flash all images in fastboot
	imgs, _ := filepath.Glob(filepath.Join(imgDir, "*.img"))
	sort.Strings(imgs)

	totalFiles := len(imgs)
	processed := 0

	for _, img := range imgs {
		part := strings.TrimSuffix(filepath.Base(img), ".img")

		// Cập nhật progress bar
		processed++
		// Tính % từ 30 -> 90
		percent := 30 + int((float32(processed)/float32(totalFiles))*60)
		msg := fmt.Sprintf("Flashing %s...", part)
		a.UpdateProgress(percent, msg)

		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> %s", msg))
		if err := a.fastbootFlash(part, img); err != nil {
			return err
		}
	}

	if shouldWipe {
		a.UpdateProgress(95, "Đang xóa dữ liệu...")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Erasing userdata and metadata")
		if err := a.runFastboot("erase", "userdata"); err != nil {
			return err
		}
		if err := a.runFastboot("erase", "metadata"); err != nil {
			return err
		}
	}

	a.UpdateProgress(100, "Hoàn tất!")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Pixel OTA flash completed. Device awaiting user action.")

	return nil
}
