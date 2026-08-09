package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// flashErrorSuggestion returns a user-facing suggestion based on common fastboot error patterns.
func flashErrorSuggestion(errOutput string) string {
	lower := strings.ToLower(errOutput)
	switch {
	case strings.Contains(lower, "partition not found") || strings.Contains(lower, "no such partition"):
		return "Gợi ý: Kiểm tra lại tên partition — có thể partition này không tồn tại trên thiết bị của bạn."
	case strings.Contains(lower, "failed (remote") || strings.Contains(lower, "remote failure"):
		return "Gợi ý: Kiểm tra kết nối USB và thử cáp/cổng USB khác. Lỗi 'FAILED (remote)' thường do kết nối không ổn định."
	case strings.Contains(lower, "sparse not allowed") || strings.Contains(lower, "sparse"):
		return "Gợi ý: File image ở dạng sparse không được hỗ trợ ở mode này. Thử chuyển sang non-sparse image hoặc flash ở mode khác."
	case strings.Contains(lower, "timeout"):
		return "Gợi ý: Lệnh bị timeout — kiểm tra kết nối USB và thử lại."
	case strings.Contains(lower, "not enough space") || strings.Contains(lower, "insufficient"):
		return "Gợi ý: Không đủ dung lượng trên partition. Thử xóa dữ liệu hoặc resize partition trước."
	default:
		return ""
	}
}

// logFlashError logs a detailed flash error with partition name, mode, error output, and suggestion.
func (a *App) logFlashError(partition, mode string, err error) {
	errStr := err.Error()
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf("!!! [%s] Flash partition '%s' thất bại: %s", mode, partition, errStr))
	a.addFlashReportLog(fmt.Sprintf("[ERROR] [%s] %s: %s", mode, partition, errStr))

	if suggestion := flashErrorSuggestion(errStr); suggestion != "" {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> "+suggestion)
		a.addFlashReportLog("[SUGGESTION] " + suggestion)
	}
}

func (a *App) logInfo(msg string) {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO]\n"+msg)
}

func (a *App) logWarn(msg string) {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[WARN]\n"+msg)
}

func (a *App) logError(msg string) {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[ERROR]\n"+msg)
}

func (a *App) runFastboot(args ...string) error {
	fastboot := a.GetToolPath("fastboot")
	cmd := exec.Command(fastboot, args...)
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%v: %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

func (a *App) fastbootFlash(partition, imgPath string) error {
	a.logInfo(fmt.Sprintf("Flashing [%s]...", partition))
	return a.runFastboot("flash", partition, imgPath)
}

func (a *App) fastbootRebootBootloader() {
	_ = a.runFastboot("reboot-bootloader")
	time.Sleep(5 * time.Second)
}

func (a *App) normalizeToFastboot() error {
	d := a.CheckDevice()
	if d.State == "fastboot" || d.State == "bootloader" {
		return nil
	}

	if d.State == "fastbootD" {
		a.logInfo("Exiting fastbootD to bootloader...")
		_ = a.runFastboot("reboot", "bootloader")
		time.Sleep(6 * time.Second)
		return nil
	}

	if d.State == "device" {
		a.logInfo("Rebooting device to bootloader...")
		adb := a.GetToolPath("adb")
		cmd := exec.Command(adb, "reboot", "bootloader")
		configureCmd(cmd)
		_ = cmd.Run()
		time.Sleep(6 * time.Second)
		return nil
	}

	return fmt.Errorf("unsupported state for fastboot: %s", d.State)
}

// ------------------------------
// Shared zip helpers
// ------------------------------

// zipHasAnySuffix checks if the zip contains at least one file whose name ends with any of the provided suffixes.
func zipHasAnySuffix(zipPath string, suffixes ...string) bool {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return false
	}
	defer r.Close()

	for _, f := range r.File {
		name := strings.ToLower(f.Name)
		for _, s := range suffixes {
			if strings.HasSuffix(name, strings.ToLower(s)) {
				return true
			}
		}
	}
	return false
}

func (a *App) listZipFiles(zipPath string) ([]string, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, err
	}
	defer r.Close()

	out := make([]string, 0, len(r.File))
	for _, f := range r.File {
		// keep original entry name (with folders)
		out = append(out, f.Name)
	}
	return out, nil
}

// extractZipToTempDir extracts a zip file into a temp directory and returns that directory.
// Caller should os.RemoveAll(dir) when done.
func (a *App) extractZipToTempDir(zipPath string) (string, error) {
	dir, err := os.MkdirTemp("", "flashflow_zip_")
	if err != nil {
		return "", err
	}
	if err := unzip(zipPath, dir); err != nil {
		_ = os.RemoveAll(dir)
		return "", err
	}
	return dir, nil
}

// unzip extracts the given zip into destDir, preserving directories.
func unzip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	for _, f := range r.File {
		target := filepath.Join(destDir, f.Name)

		// ZipSlip protection
		if !strings.HasPrefix(target, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}

		rc, err := f.Open()
		if err != nil {
			return err
		}

		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
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

// ------------------------------
// Shared file discovery helpers
// ------------------------------

// findFirstMatch searches recursively under root for the first file whose base name matches pattern (filepath.Match).
// Returns the first matching path in WalkDir order, or empty string if no file matches.
func (a *App) findFirstMatch(root, pattern string) string {
	var found string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d == nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		ok, _ := filepath.Match(pattern, filepath.Base(path))
		if ok {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// findFileRecursive searches recursively under root for an exact file name (base name match).
func findFileRecursive(root, filename string) string {
	var found string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if found != "" {
			return filepath.SkipAll
		}
		if err != nil || d == nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if filepath.Base(path) == filename {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// findImgRoot attempts to locate a directory that contains .img files.
// If payload dumper created a nested folder, this will still find it.
func findImgRoot(root string) string {
	if root == "" {
		return ""
	}
	var found string
	_ = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if found != "" {
			return filepath.SkipAll
		}
		if err != nil || d == nil {
			return nil
		}
		if d.IsDir() {
			return nil
		}
		if strings.HasSuffix(strings.ToLower(d.Name()), ".img") {
			found = filepath.Dir(path)
			return filepath.SkipAll
		}
		return nil
	})
	return found
}

// ------------------------------
// Shared payload.bin helpers
// ------------------------------

// isPixelFactoryImage determines whether a Pixel ROM zip is a factory image.
// Heuristic: contains image-*.zip plus bootloader-*.img and radio-*.img at top level.
func isPixelFactoryImage(zipPath string) bool {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return false
	}
	defer r.Close()

	hasImageZip := false
	hasBootloader := false
	hasRadio := false

	for _, f := range r.File {
		base := strings.ToLower(filepath.Base(f.Name))
		if strings.HasPrefix(base, "image-") && strings.HasSuffix(base, ".zip") {
			hasImageZip = true
		}
		if strings.HasPrefix(base, "bootloader-") && strings.HasSuffix(base, ".img") {
			hasBootloader = true
		}
		if strings.HasPrefix(base, "radio-") && strings.HasSuffix(base, ".img") {
			hasRadio = true
		}
	}

	return hasImageZip && hasBootloader && hasRadio
}

// dumpPayload uses payload-dumper-go to extract images from payload.bin into outDir.
func (a *App) dumpPayload(payloadPath, outDir string) error {
	dumper := a.GetToolPath("payload-dumper-go")
	if dumper == "" {
		return fmt.Errorf("payload-dumper-go not found")
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return err
	}

	cmd := exec.Command(dumper, "-o", outDir, payloadPath)
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()

	// Check for non-zero exit code
	if err != nil {
		errMsg := fmt.Sprintf("payload-dumper-go không thể extract ROM này (exit error: %v). Output: %s", err, strings.TrimSpace(string(out)))
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

// ------------------------------
// Brand generic flash entrypoints
// ------------------------------

func FlashOnePlusGeneric(a *App, romPath string, wipe bool) error {
	// [FIX] Truyền đủ 4 tham số: path, wipe, skipFirmware(false), force(false)
	return a.FlashOnePlusROM(romPath, wipe, false, false)
}

func FlashPixelGeneric(a *App, romPath string, wipe bool) error {
	a.FlashPixelROM(romPath, wipe)
	return nil
}

func FlashXiaomiGeneric(a *App, romPath string, wipe bool) error {
	a.FlashXiaomiROM(romPath, wipe)
	return nil
}
