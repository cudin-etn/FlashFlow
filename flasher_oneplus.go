package main

import (
	"archive/zip"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"

	"github.com/cudin-etn/FlashFlow/flasher"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var ErrOnePlusARBDecisionRequired = errors.New("oneplus arb decision required")

/* ---------------- DEFINITIONS ---------------- */

// Chỉ giữ lại các file Kernel/Boot cốt lõi.
// FW (abl, xbl...) đã bị xóa khỏi đây để đẩy sang FastbootD.
var BootloaderFiles = map[string]bool{
	"boot": true, "dtbo": true, "init_boot": true, "modem": true,
	"recovery": true, "vbmeta": true, "vbmeta_system": true,
	"vbmeta_vendor": true, "vendor_boot": true,
	// Đã xóa: uefi, abl, xbl, xbl_config -> Để chúng nạp ở FastbootD
}

var LogicalPartitions = map[string]bool{
	"system": true, "system_ext": true, "product": true, "vendor": true, "odm": true,
	"system_dlkm": true, "system_dlkm_oki": true, "system_dlkm_gki": true,
	"vendor_dlkm": true, "odm_dlkm": true,
	"my_bigball": true, "my_carrier": true, "my_company": true,
	"my_engineering": true, "my_heytap": true, "my_manifest": true,
	"my_preload": true, "my_product": true, "my_region": true, "my_stock": true,
}

var OnePlusARBPartitions = map[string]bool{
	"xbl": true, "abl": true, "xbl_config": true, "xbl_ramdump": true,
}

func isOnePlusARBPartition(part string) bool {
	return OnePlusARBPartitions[normalizeOnePlusPartition(part)]
}

func isOnePlusLogicalPartition(part string) bool {
	part = strings.ToLower(strings.TrimSpace(part))
	part = strings.TrimSuffix(strings.TrimSuffix(part, "_a"), "_b")
	if strings.HasPrefix(part, "my_") {
		return true
	}
	return LogicalPartitions[part]
}

func containsOnePlusARBImage(root string) bool {
	if strings.TrimSpace(root) == "" {
		return false
	}
	info, err := os.Stat(root)
	if err != nil {
		return false
	}
	if info.IsDir() {
		found := false
		_ = filepath.WalkDir(root, func(p string, d os.DirEntry, e error) error {
			if e != nil || d.IsDir() || !strings.HasSuffix(strings.ToLower(d.Name()), ".img") {
				return nil
			}
			part := strings.TrimSuffix(strings.ToLower(d.Name()), ".img")
			part = strings.TrimSuffix(strings.TrimSuffix(part, "_a"), "_b")
			if isOnePlusARBPartition(part) {
				found = true
				return io.EOF
			}
			return nil
		})
		return found
	}

	if strings.HasSuffix(strings.ToLower(root), ".zip") {
		r, err := zip.OpenReader(root)
		if err != nil {
			return false
		}
		defer r.Close()
		for _, f := range r.File {
			base := strings.ToLower(filepath.Base(f.Name))
			if !strings.HasSuffix(base, ".img") {
				continue
			}
			part := strings.TrimSuffix(base, ".img")
			part = strings.TrimSuffix(strings.TrimSuffix(part, "_a"), "_b")
			if isOnePlusARBPartition(part) {
				return true
			}
		}
	}
	return false
}

/* ---------------- ZIP & IMG HELPERS ---------------- */

func hasZipSuffix(zipPath, suffix string) bool {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return false
	}
	defer r.Close()
	for _, f := range r.File {
		if strings.HasSuffix(f.Name, suffix) {
			return true
		}
	}
	return false
}

func findFileByBaseNameRecursive(root, fileName string) (string, bool) {
	var found string
	_ = filepath.WalkDir(root, func(p string, d os.DirEntry, e error) error {
		if e != nil || d.IsDir() {
			return nil
		}
		if strings.EqualFold(filepath.Base(p), fileName) {
			found = p
			return io.EOF
		}
		return nil
	})
	return found, found != ""
}

func extractZipAll(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	cleanDest, err := filepath.Abs(destDir)
	if err != nil {
		return err
	}

	for _, f := range r.File {
		outPath := filepath.Join(cleanDest, f.Name)
		cleanTarget, err := filepath.Abs(outPath)
		if err != nil {
			return err
		}
		if cleanTarget != cleanDest && !strings.HasPrefix(cleanTarget, cleanDest+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path in zip: %s", f.Name)
		}
		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(cleanTarget, 0755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(cleanTarget), 0755); err != nil {
			return err
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.Create(cleanTarget)
		if err != nil {
			rc.Close()
			return err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return copyErr
		}
	}
	return nil
}

func extractZipFileByBaseName(zipPath, destDir, fileName string) (string, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer r.Close()

	cleanDest, err := filepath.Abs(destDir)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(cleanDest, 0755); err != nil {
		return "", err
	}

	for _, f := range r.File {
		if f.FileInfo().IsDir() || !strings.EqualFold(filepath.Base(f.Name), fileName) {
			continue
		}

		cleanTarget := filepath.Join(cleanDest, fileName)
		if cleanTarget != cleanDest && !strings.HasPrefix(cleanTarget, cleanDest+string(os.PathSeparator)) {
			return "", fmt.Errorf("illegal file path in zip: %s", f.Name)
		}

		rc, err := f.Open()
		if err != nil {
			return "", err
		}
		out, err := os.Create(cleanTarget)
		if err != nil {
			rc.Close()
			return "", err
		}
		_, copyErr := io.Copy(out, rc)
		out.Close()
		rc.Close()
		if copyErr != nil {
			return "", copyErr
		}
		return cleanTarget, nil
	}

	return "", fmt.Errorf("%s not found in zip", fileName)
}

func (a *App) dumpPayloadToImages(dumperPath, payloadPath, outDir string) error {
	if err := os.MkdirAll(outDir, 0755); err != nil {
		return err
	}
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	cmd := exec.Command(dumperPath, "-o", outDir, payloadPath)
	cmd.Dir = filepath.Dir(dumperPath)
	out, err := cmd.CombinedOutput()

	if len(out) > 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", strings.TrimSpace(string(out)))
	}

	// Check for non-zero exit code
	if err != nil {
		errMsg := fmt.Sprintf("payload-dumper-go không thể extract ROM này (exit error: %v).", err)
		suggestion := "Gợi ý: Hãy thử extract thủ công bằng công cụ khác (ví dụ: payload_dumper trên GitHub) hoặc tải ROM dạng đã giải nén sẵn (chứa file .img trực tiếp)."
		fullMsg := errMsg + " " + suggestion
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! "+fullMsg)
		a.addFlashReportLog("[ERROR] " + errMsg)
		a.markFlashFailure(fullMsg)
		return fmt.Errorf("%s", fullMsg)
	}

	// Check if output directory contains any .img files
	images, _ := collectAllImagesRecursive(outDir)
	if len(images) == 0 {
		errMsg := "payload-dumper-go đã chạy xong nhưng không tạo ra file .img nào. ROM này có thể không tương thích với payload-dumper-go."
		suggestion := "Gợi ý: Hãy thử extract thủ công bằng công cụ khác (ví dụ: payload_dumper trên GitHub) hoặc tải ROM dạng đã giải nén sẵn (chứa file .img trực tiếp)."
		fullMsg := errMsg + " " + suggestion
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! "+fullMsg)
		a.addFlashReportLog("[ERROR] " + errMsg)
		a.markFlashFailure(fullMsg)
		return fmt.Errorf("%s", fullMsg)
	}

	return nil
}

func collectAllImagesRecursive(root string) ([]imgFile, error) {
	var result []imgFile
	filepath.WalkDir(root, func(p string, d os.DirEntry, e error) error {
		if e == nil && !d.IsDir() && strings.HasSuffix(strings.ToLower(d.Name()), ".img") {
			part := strings.TrimSuffix(d.Name(), ".img")
			result = append(result, imgFile{Part: part, Path: p})
		}
		return nil
	})
	sort.Slice(result, func(i, j int) bool { return result[i].Part < result[j].Part })
	return result, nil
}

type imgFile struct {
	Part string
	Path string
}

/* ---------------- MAIN ENTRY ---------------- */

func (a *App) FlashOnePlusROM(pathInput string, shouldWipe bool, skipFirmware bool, force bool) error {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "========================================")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> ONEPLUS AUTO FLASH STARTED")
	a.UpdateProgress(5, "[1/5] Kiểm tra môi trường...")

	fastbootBin := a.GetToolPath("fastboot")
	dumperPath := a.GetToolPath("payload-dumper-go")
	if _, err := os.Stat(fastbootBin); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không tìm thấy fastboot: "+fastbootBin)
		wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
		return fmt.Errorf("không tìm thấy fastboot: %s", fastbootBin)
	}

	fbs, _ := a.run.ListFastbootDevices()
	if len(fbs) == 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [1/5] Chưa thấy Fastboot. Reboot thiết bị vào Bootloader...")
		adbs, _ := a.run.ListADBDevices()
		if len(adbs) == 1 {
			if err := a.RunCommandStreaming("", a.GetToolPath("adb"), "-s", adbs[0].Serial, "reboot", "bootloader"); err != nil {
				return fmt.Errorf("reboot bootloader qua ADB thất bại: %w", err)
			}
		}
		if err := a.waitForFastboot(); err != nil {
			return err
		}
		fbs, _ = a.run.ListFastbootDevices()
	}
	if len(fbs) != 1 {
		return fmt.Errorf("cần đúng 1 thiết bị Fastboot, hiện tìm thấy %d", len(fbs))
	}
	serial := fbs[0].Serial

	var scanRoot string
	fileInfo, err := os.Stat(pathInput)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không đọc được đường dẫn ROM: "+err.Error())
		wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
		return fmt.Errorf("không đọc được đường dẫn ROM: %w", err)
	}

	if skipFirmware {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [FW SAFE] Skip firmware-risk images: xbl, abl, xbl_config, xbl_ramdump")
	}
	if force {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! [FW FULL] Người dùng đã xác nhận tự chịu trách nhiệm và nạp FULL firmware-risk images nếu có trong ROM.")
	}

	if fileInfo.IsDir() {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Nguồn ROM: Folder. Đang quét file .img...")
		images, _ := collectAllImagesRecursive(pathInput)
		payloadPath, hasPayload := findFileByBaseNameRecursive(pathInput, "payload.bin")

		if len(images) > 0 {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [2/5] Folder đã có %d file .img. Dùng trực tiếp, không dump lại payload.bin.", len(images)))
			scanRoot = pathInput
		} else if hasPayload {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Folder Full OTA có payload.bin nhưng chưa có .img. Đang dump vào Library/Cache...")
			cachedDir, isCached := a.checkCachedRom(pathInput)
			if !isCached {
				if err := os.MkdirAll(cachedDir, 0755); err != nil {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không tạo được thư mục Library/Cache: "+err.Error())
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("không tạo được thư mục Library/Cache: %w", err)
				}
				_ = os.Remove(filepath.Join(cachedDir, ".completed"))
				if err := a.dumpPayloadToImages(dumperPath, payloadPath, cachedDir); err != nil {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Dump payload.bin từ folder thất bại: "+err.Error())
					a.markFlashFailure("Dump payload.bin từ folder thất bại: " + err.Error())
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("dump payload.bin từ folder thất bại: %w", err)
				}
				images, _ = collectAllImagesRecursive(cachedDir)
				if len(images) == 0 {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Dump payload.bin xong nhưng không tìm thấy file .img nào trong Library/Cache.")
					wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Gợi ý: Hãy thử extract thủ công bằng công cụ khác (ví dụ: payload_dumper trên GitHub) hoặc tải ROM dạng đã giải nén sẵn.")
					a.markFlashFailure("Dump payload.bin xong nhưng không có file .img nào — payload-dumper-go không tương thích ROM này.")
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("dump payload.bin xong nhưng không có file .img nào")
				}
				a.markRomAsCached(cachedDir)
			} else {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Dùng lại ROM images đã cache từ folder payload.bin.")
			}
			scanRoot = cachedDir
		} else {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Folder ROM không có .img và cũng không có payload.bin.")
			wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			return fmt.Errorf("folder ROM không có .img và cũng không có payload.bin")
		}
	} else {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Nguồn ROM: ZIP. Đang chuẩn bị cache/image...")
		cachedDir, isCached := a.checkCachedRom(pathInput)
		if !isCached {
			if err := os.MkdirAll(cachedDir, 0755); err != nil {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không tạo được thư mục Library/Cache: "+err.Error())
				wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
				return fmt.Errorf("không tạo được thư mục Library/Cache: %w", err)
			}
			_ = os.Remove(filepath.Join(cachedDir, ".completed"))

			if hasZipSuffix(pathInput, "payload.bin") {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Full OTA detected. Đang lấy payload.bin...")
				payloadPath, err := extractZipFileByBaseName(pathInput, cachedDir, "payload.bin")
				if err != nil {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không lấy được payload.bin từ OTA ZIP: "+err.Error())
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("không lấy được payload.bin từ OTA ZIP: %w", err)
				}
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] payload.bin ready: "+filepath.Base(payloadPath))

				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Dump payload.bin thành các file .img...")
				if err := a.dumpPayloadToImages(dumperPath, payloadPath, cachedDir); err != nil {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Dump payload.bin thất bại: "+err.Error())
					a.markFlashFailure("Dump payload.bin thất bại: " + err.Error())
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("dump payload.bin thất bại: %w", err)
				}
			} else {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] ZIP thường. Đang giải nén image files...")
				if err := extractZipAll(pathInput, cachedDir); err != nil {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không giải nén được ZIP: "+err.Error())
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("không giải nén được ZIP: %w", err)
				}
			}

			images, _ := collectAllImagesRecursive(cachedDir)
			if len(images) == 0 {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Chuẩn bị ROM xong nhưng không tìm thấy file .img nào trong Library/Cache.")
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Gợi ý: payload-dumper-go có thể không tương thích OTA này. Hãy thử extract thủ công bằng công cụ khác (ví dụ: payload_dumper trên GitHub) hoặc tải ROM dạng đã giải nén sẵn.")
				a.markFlashFailure("Không tìm thấy file .img sau khi chuẩn bị ROM — payload-dumper-go không tương thích hoặc ZIP không phải full OTA chuẩn.")
				wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
				return fmt.Errorf("không tìm thấy file .img sau khi chuẩn bị ROM")
			}

			a.markRomAsCached(cachedDir)
		} else {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] Dùng lại ROM images đã cache.")
		}
		scanRoot = cachedDir
	}

	if !skipFirmware && !force && containsOnePlusARBImage(scanRoot) {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [FW WARNING] ROM chứa firmware-risk images: xbl/abl/xbl_config/xbl_ramdump.")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> FlashFlow không xác định ARB theo từng model. Người dùng cần tự kiểm tra downgrade/ARB trước khi flash full firmware.")
		wailsRuntime.EventsEmit(a.ctx, "ask_arb_user", map[string]interface{}{
			"path":   pathInput,
			"reason": "arb_partitions_present",
		})
		return ErrOnePlusARBDecisionRequired
	}

	// Destructive wipe is deliberately delayed until ROM preparation and the
	// ARB decision have succeeded. A popup/retry must never wipe data early.
	if shouldWipe {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [2/5] ROM validated. Running requested data wipe...")
		if err := a.runOnePlusWipeFallback("Pre-flash", serial); err != nil {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: wipe data thất bại: "+err.Error())
			wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			return fmt.Errorf("wipe data thất bại: %w", err)
		}
	}

	if err := a.executeOnePlusSmartFlash(scanRoot, fastbootBin, serial, skipFirmware); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! FLASH FAILED: "+err.Error())
		wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
		return err
	}
	wailsRuntime.EventsEmit(a.ctx, "flash_complete", true)
	return nil
}

/* ---------------- ONEPLUS FLASH EXECUTION ---------------- */

func (a *App) executeOnePlusSmartFlash(rootPath, fastbootBin, serial string, skipFirmware bool) error {
	images, _ := collectAllImagesRecursive(rootPath)

	if len(images) == 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Không tìm thấy file .img nào!")
		return fmt.Errorf("no images found")
	}

	platform := mergeOnePlusPlatformInfo(a.currentOnePlusPlatform(), inferOnePlusPlatformFromImages(images))
	platform.Product = strings.TrimSpace(a.getFastbootVar(serial, "product"))
	if platform.Product == "--" {
		platform.Product = ""
	}
	if platform.Family == onePlusPlatformMediaTek {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [MTK SAFE] OnePlus Dimensity/MediaTek detected (%s). Preserving preloader and early MTK firmware.", platform.Evidence))
	}

	totalFiles := len(images)
	processedFiles := 0
	updateStatus := func(msg string) {
		processedFiles++
		currentPercent := 10 + int((float32(processedFiles)/float32(totalFiles))*85)
		a.UpdateProgress(currentPercent, msg)
	}

	hasSuper := false
	var superPath string
	for _, img := range images {
		if normalizeOnePlusPartition(img.Part) == "super" {
			hasSuper = true
			superPath = img.Path
			break
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [2/5] Đã sẵn sàng %d file .img để flash.", totalFiles))

	// =========================================================
	// [3/5] BOOTLOADER FLASHING
	// =========================================================
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "----------------------------------------")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [3/5] Flash nhóm Bootloader / Super...")

	// 1. Nạp các file Boot cơ bản (boot, recovery, dtbo...)
	for _, img := range images {
		part := normalizeOnePlusPartition(img.Part)
		if !BootloaderFiles[part] {
			continue
		}
		if a.isFlashCancelled() {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
			a.finishFlashReport("cancelled")
			return fmt.Errorf("flash đã bị hủy bởi người dùng")
		}
		if shouldPreserveOnePlusMTKPartition(platform, part) {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [MTK SAFE] Preserving: "+part)
			continue
		}

		hasSlot, known := a.queryOnePlusHasSlot(serial, part)
		if !known {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Bootloader] %s: has-slot unavailable, using direct flash.", part))
		} else if hasSlot {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Bootloader] %s -> slot A/B", part))
		} else {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Bootloader] %s -> slotless/direct", part))
		}
		for _, args := range buildOnePlusFlashArgs(serial, part, img.Path, onePlusBootAB, hasSlot) {
			if err := a.RunCommandStreaming("", fastbootBin, args...); err != nil {
				a.logFlashError(part, "Bootloader", err)
				a.markFlashFailure(fmt.Sprintf("flash %s thất bại ở Bootloader: %v", part, err))
				return fmt.Errorf("flash %s thất bại: %v", part, err)
			}
		}
		a.markFlashPartition(part)
	}

	// 2. [FIX] Nạp SUPER.IMG ngay tại Bootloader (Theo yêu cầu)
	if hasSuper {
		// Check for cancel before super flash
		if a.isFlashCancelled() {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
			a.finishFlashReport("cancelled")
			return fmt.Errorf("flash đã bị hủy bởi người dùng")
		}

		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Bootloader] super.img")
		if err := a.RunCommandStreaming("", fastbootBin, onePlusFastbootArgs(serial, "flash", "super", superPath)...); err != nil {
			a.logFlashError("super", "Bootloader", err)
			a.markFlashFailure(fmt.Sprintf("flash super thất bại ở Bootloader: %v", err))
			return fmt.Errorf("flash super thất bại: %v", err)
		}
		a.markFlashPartition("super")
	}

	// =========================================================
	// [4/5] REBOOT TO FASTBOOTD
	// =========================================================
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "----------------------------------------")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [4/5] Reboot sang FastbootD...")
	if err := a.RunCommandStreaming("", fastbootBin, onePlusFastbootArgs(serial, "reboot", "fastboot")...); err != nil {
		// On Windows fastboot may not exit while the USB device is changing
		// modes. Do not falsely fail the session merely because that client
		// process timed out: waitForSpecificMode below is the authoritative
		// confirmation. Any other error is still fatal.
		if !isFastbootRebootToFastbootTimeout(err) {
			return fmt.Errorf("reboot fastbootd thất bại: %v", err)
		}
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Lệnh reboot FastbootD chưa tự thoát trên Windows; đang xác minh thiết bị đã vào FastbootD...")
	}
	if err := a.waitForSpecificMode("fastbootd", serial); err != nil {
		return err
	}
	// Stability delay is now handled inside waitForSpecificMode (ModeStabilityDelay = 4s)

	// =========================================================
	// [4/5] FASTBOOTD FLASHING
	// =========================================================
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [4/5] Flash nhóm FastbootD / Logical / Firmware...")

	if hasSuper {
		// TRƯỜNG HỢP SUPER ROM
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Logical] super.img đã chứa layout/data dynamic partitions; không flash lặp các image logical rời.")
		for _, img := range images {
			part := normalizeOnePlusPartition(img.Part)
			// super.img owns the dynamic-partition layout and contents. Flashing
			// loose logical images again can target names that do not exist in
			// that layout and can also consume super space twice.
			if !shouldFlashOnePlusImageAfterSuper(part) {
				continue
			}

			// Check for cancel before each partition flash
			if a.isFlashCancelled() {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
				a.finishFlashReport("cancelled")
				return fmt.Errorf("flash đã bị hủy bởi người dùng")
			}

			// SKIP NẾU CẦN
			if skipFirmware && isOnePlusARBPartition(part) {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [FW SAFE] Skipping: "+part)
				a.markSkippedARBPartition(part)
				continue
			}
			if shouldPreserveOnePlusMTKPartition(platform, part) {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [MTK SAFE] Preserving: "+part)
				continue
			}

			updateStatus("[4/5] FastbootD: " + part)
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [FastbootD] %s", part))
			if err := a.flashOnePlusFastbootDImage(fastbootBin, serial, part, img.Path, false); err != nil {
				a.logFlashError(part, "FastbootD", err)
				a.markFlashFailure(fmt.Sprintf("flash %s thất bại ở FastbootD: %v", part, err))
				return fmt.Errorf("flash %s ở FastbootD thất bại: %v", part, err)
			}
			a.markFlashPartition(part)
		}

	} else {
		// TRƯỜNG HỢP PAYLOAD (Cũ)
		// Vẫn nạp FW và các file lẻ ở đây
		for _, img := range images {
			part := normalizeOnePlusPartition(img.Part)
			if BootloaderFiles[part] || isOnePlusLogicalPartition(part) {
				continue
			}

			// Check for cancel before each partition flash
			if a.isFlashCancelled() {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
				a.finishFlashReport("cancelled")
				return fmt.Errorf("flash đã bị hủy bởi người dùng")
			}

			if skipFirmware && isOnePlusARBPartition(part) {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [FW SAFE] Skipping: "+part)
				a.markSkippedARBPartition(part)
				continue
			}
			if shouldPreserveOnePlusMTKPartition(platform, part) {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [MTK SAFE] Preserving: "+part)
				continue
			}
			updateStatus("[4/5] FW/Other: " + part)
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [FastbootD] %s", part))
			if err := a.flashOnePlusFastbootDImage(fastbootBin, serial, part, img.Path, false); err != nil {
				a.logFlashError(part, "FastbootD", err)
				a.markFlashFailure(fmt.Sprintf("flash %s thất bại ở FastbootD: %v", part, err))
				return fmt.Errorf("flash %s ở FastbootD thất bại: %v", part, err)
			}
			a.markFlashPartition(part)
		}

		// A loose-image/payload package has no super.img to establish the
		// dynamic-partition metadata. Recreate the A/B logical entries first,
		// then write the large image only to slot A, matching the reference
		// Regional/Universal OnePlus flasher workflow.
		for _, img := range images {
			part := normalizeOnePlusPartition(img.Part)
			if isOnePlusLogicalPartition(part) {
				// Check for cancel before each partition flash
				if a.isFlashCancelled() {
					wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
					a.finishFlashReport("cancelled")
					return fmt.Errorf("flash đã bị hủy bởi người dùng")
				}

				updateStatus("[4/5] Logical: " + part)
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Logical] Tạo lại %s_a/%s_b và flash slot A", part, part))
				if err := a.provisionAndFlashOnePlusLogicalImage(fastbootBin, serial, part, img.Path); err != nil {
					a.logFlashError(part, "FastbootD/Logical", err)
					a.markFlashFailure(fmt.Sprintf("flash logical %s thất bại: %v", part, err))
					return fmt.Errorf("flash logical %s thất bại: %v", part, err)
				}
				a.markFlashPartition(part)
			}
		}
	}

	// =========================================================
	// [5/5] FINISH
	// =========================================================
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "----------------------------------------")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [5/5] Set active slot A...")
	if err := a.RunCommandStreaming("", fastbootBin, onePlusFastbootArgs(serial, "--set-active=a")...); err != nil {
		return fmt.Errorf("set active slot A thất bại: %v", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [5/5] ONEPLUS FLASH COMPLETE")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "========================================")
	return nil
}

func (a *App) provisionAndFlashOnePlusLogicalImage(fastbootBin, serial, part, imgPath string) error {
	part = normalizeOnePlusPartition(part)
	for _, step := range buildOnePlusLogicalProvisionPlan(serial, part, imgPath) {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Logical/%s] fastboot %s", step.Label, strings.Join(step.Args, " ")))
		if err := a.RunCommandStreaming("", fastbootBin, step.Args...); err != nil {
			if step.IgnoreFailure {
				// Missing old partitions and snapshot COW devices are expected on
				// clean/differently-partitioned phones. The following create step is
				// authoritative and will stop safely if provisioning is impossible.
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Logical/%s] Không có entry cũ hoặc không cần xóa; tiếp tục tạo layout mới.", step.Label))
				continue
			}
			return fmt.Errorf("%s %s thất bại: %w", step.Label, part, err)
		}
	}
	return nil
}

func (a *App) flashOnePlusFastbootDImage(fastbootBin, serial, part, imgPath string, logical bool) error {
	part = normalizeOnePlusPartition(part)
	policy := onePlusFastbootDSlotPolicy(part, logical)
	hasSlot := false
	if policy == onePlusDirect {
		// Dynamic/logical partitions may be exposed without _a/_b even on an
		// A/B phone (for example OnePlus my_* partitions).  FastbootD resolves
		// the active logical target when we use its real base name.  Forcing
		// --slot=a turns my_bigball into my_bigball_a, which does not exist on
		// devices such as canoe.
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [FastbootD] %s: logical partition, flashing its real name (no forced slot).", part))
	} else {
		var known bool
		hasSlot, known = a.queryOnePlusHasSlot(serial, part)
		if !known {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [FastbootD] %s: has-slot unavailable, using direct flash.", part))
		}
	}
	commands := buildOnePlusFlashArgs(serial, part, imgPath, policy, hasSlot)
	for _, args := range commands {
		group := "FastbootD"
		if logical {
			group = "Logical"
		}
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [%s] fastboot %s (%s)", group, strings.Join(args, " "), filepath.Base(imgPath)))
		if err := a.RunCommandStreaming("", fastbootBin, args...); err != nil {
			return err
		}
	}
	return nil
}
