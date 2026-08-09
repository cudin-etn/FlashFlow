package main

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/cudin-etn/FlashFlow/flasher"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Restore order constants define the sequence in which components are restored.
// Lower values are restored first.
const (
	RestoreOrderContacts = 1
	RestoreOrderSMS      = 2
	RestoreOrderAppAPK   = 3
	RestoreOrderAppData  = 4
	RestoreOrderMedia    = 5
)

// restoreComponentOrder defines the ordered list of components for restore.
// The restore sequence deliberately excludes /data/system, lockscreen,
// keymaster and encryption-sensitive data.
var restoreComponentOrder = []struct {
	Name  string
	Order int
}{
	{Name: "contacts", Order: RestoreOrderContacts},
	{Name: "sms", Order: RestoreOrderSMS},
	{Name: "app_apk", Order: RestoreOrderAppAPK},
	{Name: "app_data", Order: RestoreOrderAppData},
	{Name: "media", Order: RestoreOrderMedia},
}

type RestoreOptions struct {
	DryRun             bool     `json:"dryRun"`
	SelectedComponents []string `json:"selectedComponents"`
}

type RestoreCompatibilityReport struct {
	Compatible bool     `json:"compatible"`
	DryRun     bool     `json:"dryRun"`
	Warnings   []string `json:"warnings"`
	Blocked    []string `json:"blocked"`
	Components []string `json:"components"`
}

// restoreMu protects restore state fields.
var restoreMu sync.Mutex
var restoreCancel context.CancelFunc

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func (a *App) normalizeBackupPath(backupPath string) (string, error) {
	backupPath = strings.TrimSpace(backupPath)
	if backupPath == "" {
		return "", fmt.Errorf("backupPath cannot be empty")
	}
	if filepath.IsAbs(backupPath) {
		return backupPath, nil
	}
	if strings.Contains(backupPath, "..") || strings.Contains(backupPath, "/") || strings.Contains(backupPath, "\\") {
		return "", fmt.Errorf("invalid backup filename")
	}
	return filepath.Join(a.getLibraryDir(), "Backups", backupPath), nil
}

// StartRestore begins the restore process for a given backup file.
// It first checks root access (reusing CheckRootAccess from backup_engine.go)
// with a 5-second timeout. If the device is not rooted, it emits an error event
// and returns an error. If rooted, it emits a success log and returns nil.
// Actual restore logic will be added in later tasks.
func (a *App) StartRestore(backupPath string) error {
	return a.StartSelectiveRestore(backupPath, RestoreOptions{})
}

func (a *App) StartSelectiveRestore(backupPath string, options RestoreOptions) error {
	resolvedBackupPath, pathErr := a.normalizeBackupPath(backupPath)
	if pathErr != nil {
		return pathErr
	}
	backupPath = resolvedBackupPath
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] Bắt đầu quy trình khôi phục...")
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "starting",
		"message": "Đang khởi tạo quá trình khôi phục...",
	})

	// Create restore context with cancel for graceful interruption
	restoreCtx, cancel := context.WithCancel(context.Background())
	restoreMu.Lock()
	restoreCancel = cancel
	restoreMu.Unlock()

	// Ensure we clean up the restore context when done
	defer func() {
		cancel()
		restoreMu.Lock()
		restoreCancel = nil
		restoreMu.Unlock()
	}()

	// Bước 1: Kiểm tra root (reuse CheckRootAccess từ backup_engine.go, timeout 5s)
	hasRoot, err := a.CheckRootAccess()
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Lỗi kiểm tra root: %v", err),
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Lỗi kiểm tra root: %v", err))
		return fmt.Errorf("lỗi kiểm tra root: %w", err)
	}

	if !hasRoot {
		errMsg := "Thiết bị chưa được root. Khôi phục dữ liệu yêu cầu quyền root."
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": errMsg,
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
		return fmt.Errorf(errMsg)
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✓ Thiết bị đã root, sẵn sàng khôi phục")
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "root_confirmed",
		"message": "Thiết bị đã có quyền root, sẵn sàng khôi phục.",
	})

	// Bước 2: Xác minh tính toàn vẹn file backup (checksum SHA-256, timeout 30s)
	if err := a.VerifyBackupChecksum(backupPath); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("File backup bị hỏng: %v", err),
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Checksum không hợp lệ: %v", err))
		return fmt.Errorf("xác minh checksum thất bại: %w", err)
	}

	// Bước 3: Kiểm tra dung lượng trống trên thiết bị
	metadata, err := a.ValidateBackup(backupPath)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Không thể đọc metadata backup: %v", err),
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Lỗi đọc metadata: %v", err))
		return fmt.Errorf("lỗi đọc metadata backup: %w", err)
	}

	report := buildRestoreCompatibilityReport(metadata, options)
	wailsRuntime.EventsEmit(a.ctx, "restore_compatibility", report)
	if !report.Compatible {
		msg := "Backup chứa component bị chặn: " + strings.Join(report.Blocked, ", ")
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{"state": "blocked", "message": msg})
		return fmt.Errorf(msg)
	}
	if options.DryRun {
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{"state": "dry_run_complete", "message": "Dry-run hoàn tất. Chưa ghi dữ liệu nào lên thiết bị."})
		return nil
	}

	sufficient, err := a.CheckDeviceSpace(metadata.TotalSize)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Lỗi kiểm tra dung lượng thiết bị: %v", err),
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Lỗi kiểm tra dung lượng: %v", err))
		return fmt.Errorf("lỗi kiểm tra dung lượng thiết bị: %w", err)
	}
	if !sufficient {
		errMsg := fmt.Sprintf("Dung lượng trống trên thiết bị không đủ để khôi phục dữ liệu (cần %s)", formatBytes(metadata.TotalSize))
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": errMsg,
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
		return fmt.Errorf(errMsg)
	}

	// Bước 4: Thực hiện khôi phục theo thứ tự an toàn (contacts → sms → app_data → media)
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] Bắt đầu khôi phục dữ liệu theo thứ tự...")
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "restoring",
		"message": "Đang khôi phục dữ liệu...",
	})

	restoreStartTime := time.Now()

	results, err := a.executeOrderedRestore(restoreCtx, backupPath, metadata, options)

	restoreDuration := time.Since(restoreStartTime)

	if err != nil {
		// Check if this was an interruption (partial results available)
		if strings.Contains(err.Error(), "restore bị gián đoạn") {
			// The restore_interrupted event was already emitted by executeOrderedRestore
			// Emit summary even on interruption
			var totalRestored int64
			successCount := 0
			for _, r := range results {
				if r.Status == "success" {
					successCount++
					totalRestored += r.Size
				}
			}
			wailsRuntime.EventsEmit(a.ctx, "restore_complete", map[string]interface{}{
				"appsRestored": successCount,
				"dataSize":     totalRestored,
				"duration":     formatDuration(restoreDuration),
				"components":   results,
				"interrupted":  true,
			})
			return fmt.Errorf("restore bị gián đoạn: %w", err)
		}
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Lỗi khôi phục: %v", err),
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Lỗi khôi phục: %v", err))
		return fmt.Errorf("lỗi khôi phục dữ liệu: %w", err)
	}

	// Tổng kết
	var totalRestored int64
	successCount := 0
	for _, r := range results {
		if r.Status == "success" {
			successCount++
			totalRestored += r.Size
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
		">>> [Restore] ═══ Tổng kết: %d thành phần thành công | Tổng dữ liệu: %s | Thời gian: %s ═══",
		successCount, formatBytes(totalRestored), formatDuration(restoreDuration),
	))
	wailsRuntime.EventsEmit(a.ctx, "restore_complete", map[string]interface{}{
		"appsRestored": successCount,
		"dataSize":     totalRestored,
		"duration":     formatDuration(restoreDuration),
		"components":   results,
		"interrupted":  false,
	})
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "completed",
		"message": fmt.Sprintf("Khôi phục hoàn tất: %d thành phần, %s dữ liệu, thời gian: %s", successCount, formatBytes(totalRestored), formatDuration(restoreDuration)),
	})

	return nil
}

// ValidateBackup opens the ZIP file at backupPath, reads and parses metadata.json
// from inside the ZIP, and returns the BackupMetadata struct.
// Returns error if the file doesn't exist, isn't a valid ZIP, or doesn't contain metadata.json.
func (a *App) ValidateBackup(backupPath string) (*BackupMetadata, error) {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] Đang kiểm tra file backup: %s", backupPath))
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "validating",
		"message": "Đang kiểm tra tính hợp lệ của file backup...",
	})

	// Check if file exists
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		errMsg := fmt.Sprintf("File backup không tồn tại: %s", backupPath)
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": errMsg,
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
		return nil, fmt.Errorf(errMsg)
	}

	// Try to open as ZIP
	r, err := zip.OpenReader(backupPath)
	if err != nil {
		errMsg := fmt.Sprintf("File không phải ZIP hợp lệ: %v", err)
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "error",
			"message": errMsg,
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
		return nil, fmt.Errorf(errMsg)
	}
	defer r.Close()

	// Find and read metadata.json
	for _, f := range r.File {
		if f.Name == "metadata.json" {
			rc, err := f.Open()
			if err != nil {
				errMsg := fmt.Sprintf("Không thể đọc metadata.json: %v", err)
				wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
					"state":   "error",
					"message": errMsg,
				})
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
				return nil, fmt.Errorf(errMsg)
			}
			defer rc.Close()

			var metadata BackupMetadata
			decoder := json.NewDecoder(rc)
			if err := decoder.Decode(&metadata); err != nil {
				errMsg := fmt.Sprintf("Không thể parse metadata.json: %v", err)
				wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
					"state":   "error",
					"message": errMsg,
				})
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
				return nil, fmt.Errorf(errMsg)
			}

			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Restore] ✓ Backup hợp lệ: %s (%s, %d thành phần)",
				metadata.DeviceName, metadata.CreatedAt, len(metadata.Components),
			))
			wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
				"state":   "validated",
				"message": fmt.Sprintf("Backup hợp lệ: %s", metadata.DeviceName),
			})

			return &metadata, nil
		}
	}

	errMsg := "File backup không chứa metadata.json"
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "error",
		"message": errMsg,
	})
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ "+errMsg)
	return nil, fmt.Errorf(errMsg)
}

func selectedComponentSet(options RestoreOptions) map[string]bool {
	if len(options.SelectedComponents) == 0 {
		return nil
	}
	set := make(map[string]bool)
	for _, name := range options.SelectedComponents {
		name = strings.TrimSpace(name)
		if name != "" {
			set[name] = true
		}
	}
	return set
}

func isRestoreSensitivePath(path string) bool {
	p := strings.ToLower(strings.TrimSpace(path))
	blocked := []string{
		"/data/system",
		"/data/misc/vold",
		"/data/misc/keystore",
		"/data/misc/gatekeeper",
		"/data/misc/keychain",
		"/data/misc/locksettings",
		"/data/system_ce",
		"/data/system_de",
	}
	for _, b := range blocked {
		if strings.HasPrefix(p, b) {
			return true
		}
	}
	return strings.Contains(p, "keymaster") || strings.Contains(p, "locksettings")
}

func buildRestoreCompatibilityReport(metadata *BackupMetadata, options RestoreOptions) RestoreCompatibilityReport {
	report := RestoreCompatibilityReport{Compatible: true, DryRun: options.DryRun, Warnings: []string{}, Blocked: []string{}, Components: []string{}}
	if metadata.FormatVersion < 2 {
		report.Warnings = append(report.Warnings, "Backup format cũ, metadata component có thể thiếu checksum/type.")
	}
	selected := selectedComponentSet(options)
	for _, comp := range metadata.Components {
		if selected != nil && !selected[comp.Name] {
			continue
		}
		report.Components = append(report.Components, comp.Name)
		if isRestoreSensitivePath(comp.Source) || comp.Type == "settings" {
			report.Compatible = false
			report.Blocked = append(report.Blocked, comp.Name)
		}
		if comp.Checksum == "" {
			report.Warnings = append(report.Warnings, comp.Name+": thiếu checksum component")
		}
	}
	if len(report.Components) == 0 {
		report.Compatible = false
		report.Blocked = append(report.Blocked, "chưa chọn component nào để restore")
	}
	return report
}

// VerifyBackupChecksum verifies the SHA-256 integrity of a backup ZIP file.
// It reads the stored checksum from the backup's metadata.json, computes the
// actual SHA-256 of the ZIP file, and compares them.
// If the metadata has no checksum (empty string), verification is skipped with a warning.
// Must complete within 30 seconds.
func (a *App) VerifyBackupChecksum(backupPath string) error {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] Đang xác minh tính toàn vẹn file backup (SHA-256)...")
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "verifying_checksum",
		"message": "Đang xác minh tính toàn vẹn file backup...",
	})

	// Use context with 30-second timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Channel to receive the result
	type checksumResult struct {
		err error
	}
	resultCh := make(chan checksumResult, 1)

	go func() {
		// Step 1: Validate backup to get metadata (which contains stored checksum)
		metadata, err := a.ValidateBackup(backupPath)
		if err != nil {
			resultCh <- checksumResult{err: fmt.Errorf("không thể đọc metadata: %w", err)}
			return
		}

		// Step 2: Check if metadata has a checksum
		if metadata.Checksum == "" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ⚠ Cảnh báo: Bản backup không có checksum, bỏ qua xác minh")
			wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
				"state":   "checksum_skipped",
				"message": "Bản backup không có checksum, bỏ qua xác minh tính toàn vẹn.",
			})
			resultCh <- checksumResult{err: nil}
			return
		}

		// Step 3: Compute SHA-256 of the ZIP file
		computedChecksum, err := calculateFileChecksum(backupPath)
		if err != nil {
			resultCh <- checksumResult{err: fmt.Errorf("không thể tính checksum file: %w", err)}
			return
		}

		// Step 4: Compare computed checksum with stored checksum
		if computedChecksum != metadata.Checksum {
			resultCh <- checksumResult{
				err: fmt.Errorf("checksum không khớp: file có thể bị hỏng (expected: %s, got: %s)",
					metadata.Checksum, computedChecksum),
			}
			return
		}

		// Checksum matches — integrity verified
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✓ Checksum hợp lệ, file backup toàn vẹn")
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "checksum_verified",
			"message": "File backup toàn vẹn, checksum hợp lệ.",
		})
		resultCh <- checksumResult{err: nil}
	}()

	// Wait for result or timeout
	select {
	case <-ctx.Done():
		return fmt.Errorf("xác minh checksum vượt quá thời gian cho phép (30 giây)")
	case result := <-resultCh:
		return result.err
	}
}

// CheckDeviceSpace checks if the device's /data partition has enough free space
// for the restore operation. It runs "adb shell df /data" and parses the output
// to extract available bytes.
// Returns (true, nil) if available >= requiredBytes, (false, nil) if insufficient,
// or (false, error) on failure to determine space.
func (a *App) CheckDeviceSpace(requiredBytes int64) (bool, error) {
	adbPath := a.GetToolPath("adb")

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] Đang kiểm tra dung lượng trống trên thiết bị...")
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "checking_space",
		"message": "Đang kiểm tra dung lượng trống trên thiết bị...",
	})

	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "shell", "df", "/data")
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✗ Timeout khi kiểm tra dung lượng thiết bị")
		return false, fmt.Errorf("timeout khi kiểm tra dung lượng thiết bị (10 giây)")
	}
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Lỗi kiểm tra dung lượng: %v", err))
		return false, fmt.Errorf("lỗi chạy df /data: %v, output: %s", err, strings.TrimSpace(string(out)))
	}

	output := strings.TrimSpace(string(out))

	// Parse the df output. Typical format:
	// Filesystem     1K-blocks    Used Available Use% Mounted on
	// /dev/block/...  123456789 98765432  24691357  80% /data
	availableBytes, err := parseDfAvailableBytes(output)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] ✗ Không thể parse dung lượng: %v", err))
		return false, fmt.Errorf("không thể parse dung lượng từ df output: %w", err)
	}

	// Emit space info event
	wailsRuntime.EventsEmit(a.ctx, "restore_space_info", map[string]interface{}{
		"requiredBytes":  requiredBytes,
		"availableBytes": availableBytes,
		"sufficient":     availableBytes >= requiredBytes,
	})

	if availableBytes >= requiredBytes {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
			">>> [Restore] ✓ Dung lượng đủ: cần %s, có %s",
			formatBytes(requiredBytes), formatBytes(availableBytes),
		))
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "space_sufficient",
			"message": fmt.Sprintf("Dung lượng đủ: cần %s, có %s", formatBytes(requiredBytes), formatBytes(availableBytes)),
		})
		return true, nil
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
		">>> [Restore] ✗ Dung lượng không đủ: cần %s, chỉ có %s",
		formatBytes(requiredBytes), formatBytes(availableBytes),
	))
	wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
		"state":   "insufficient_space",
		"message": fmt.Sprintf("Dung lượng không đủ: cần %s, chỉ có %s trống trên thiết bị", formatBytes(requiredBytes), formatBytes(availableBytes)),
	})
	return false, nil
}

// parseDfAvailableBytes parses the output of "adb shell df /data" and returns
// the available space in bytes. The "Available" column is in 1K-blocks, so we
// multiply by 1024 to get bytes.
func parseDfAvailableBytes(output string) (int64, error) {
	lines := strings.Split(output, "\n")
	if len(lines) < 2 {
		return 0, fmt.Errorf("df output quá ngắn: %q", output)
	}

	// Find the data line (skip header). Look for a line containing "/data"
	for _, line := range lines[1:] {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// The line should contain /data as the mount point
		if !strings.Contains(line, "/data") {
			continue
		}

		// Split by whitespace. Expected columns:
		// Filesystem  1K-blocks  Used  Available  Use%  Mounted_on
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		// The "Available" column is typically at index 3
		availableStr := fields[3]
		available1KBlocks, err := strconv.ParseInt(availableStr, 10, 64)
		if err != nil {
			return 0, fmt.Errorf("không parse được Available từ %q: %v", availableStr, err)
		}

		// Convert 1K-blocks to bytes
		return available1KBlocks * 1024, nil
	}

	return 0, fmt.Errorf("không tìm thấy dòng /data trong df output: %q", output)
}

// executeOrderedRestore extracts the backup ZIP to a temp directory and restores
// each component in the defined safe order: contacts → sms → app_data → media.
// For each component present in the backup metadata, it pushes the data back to the device.
// Checks for interruption (USB disconnect, battery low, user cancel) before each component.
// Logs each restore step with timestamps and status to flash_log.
// Returns results for each component attempted.
func restoreOrderForType(componentType string) int {
	switch componentType {
	case "contacts":
		return RestoreOrderContacts
	case "sms":
		return RestoreOrderSMS
	case "app_apk":
		return RestoreOrderAppAPK
	case "app_data":
		return RestoreOrderAppData
	case "media":
		return RestoreOrderMedia
	default:
		return 99
	}
}

func (a *App) executeOrderedRestore(ctx context.Context, backupPath string, metadata *BackupMetadata, options RestoreOptions) ([]ComponentResult, error) {
	// Step 1: Extract the ZIP to a temp directory
	tempDir, err := os.MkdirTemp("", "flashflow_restore_*")
	if err != nil {
		return nil, fmt.Errorf("không thể tạo thư mục tạm: %w", err)
	}
	defer os.RemoveAll(tempDir)

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] Đang giải nén file backup...")

	if err := a.extractZipToDir(backupPath, tempDir); err != nil {
		return nil, fmt.Errorf("không thể giải nén backup: %w", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] ✓ Giải nén hoàn tất")

	selected := selectedComponentSet(options)
	components := []BackupComponentMeta{}
	for _, comp := range metadata.Components {
		if selected != nil && !selected[comp.Name] {
			continue
		}
		if comp.Type == "" {
			comp.Type = comp.Name
		}
		components = append(components, comp)
	}
	sort.Slice(components, func(i, j int) bool {
		return restoreOrderForType(components[i].Type) < restoreOrderForType(components[j].Type)
	})
	totalComponents := len(components)

	// Step 2: Restore each component in the defined order
	var results []ComponentResult
	componentIndex := 0

	for _, ordered := range components {
		// Check for interruption before each component
		if interrupted, reason := a.isBackupInterrupted(ctx); interrupted {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Restore] [%s] ⚠ Gián đoạn: %s",
				time.Now().Format("15:04:05"), reason,
			))

			// Build lists of completed and incomplete components
			var completedNames []string
			for _, r := range results {
				if r.Status == "success" {
					completedNames = append(completedNames, r.Name)
				}
			}
			var incompleteNames []string
			// Current component and all remaining
			incompleteNames = append(incompleteNames, ordered.Name)
			for _, o := range components[componentIndex+1:] {
				incompleteNames = append(incompleteNames, o.Name)
			}

			// Emit restore_interrupted event
			wailsRuntime.EventsEmit(a.ctx, "restore_interrupted", map[string]interface{}{
				"reason":     reason,
				"completed":  completedNames,
				"incomplete": incompleteNames,
			})

			wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
				"state":   "interrupted",
				"message": fmt.Sprintf("Khôi phục bị gián đoạn: %s. Đã khôi phục: %s", reason, strings.Join(completedNames, ", ")),
			})

			return results, fmt.Errorf("restore bị gián đoạn: %s", reason)
		}

		// Emit progress before starting this component
		percent := 0
		if totalComponents > 0 {
			percent = (componentIndex * 100) / totalComponents
		}
		wailsRuntime.EventsEmit(a.ctx, "restore_progress", map[string]interface{}{
			"percent":   percent,
			"component": ordered.Name,
		})

		// Log start time for this component (Task 6.8)
		componentStartTime := time.Now()
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
			">>> [Restore] [%s] Bắt đầu: %s",
			componentStartTime.Format("15:04:05"), ordered.Name,
		))

		// Determine the local path for this component
		componentLocalPath := filepath.Join(tempDir, ordered.Name)

		// Check if the component directory/file exists in extracted data
		if _, statErr := os.Stat(componentLocalPath); os.IsNotExist(statErr) {
			// Try looking for the tar.gz file directly
			tarPath := filepath.Join(tempDir, ordered.Name, ordered.Name+".tar.gz")
			if _, tarStatErr := os.Stat(tarPath); os.IsNotExist(tarStatErr) {
				componentEndTime := time.Now()
				componentDuration := componentEndTime.Sub(componentStartTime)
				results = append(results, ComponentResult{
					Name:   ordered.Name,
					Size:   0,
					Status: "failed",
					Error:  fmt.Sprintf("thành phần %s không tìm thấy trong backup đã giải nén", ordered.Name),
				})
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
					">>> [Restore] [%s] Hoàn tất: %s | %s | %s | Thời gian: %s",
					componentEndTime.Format("15:04:05"), ordered.Name, formatBytes(0), "failed", formatDuration(componentDuration),
				))
				componentIndex++
				continue
			}
			componentLocalPath = tarPath
		}

		// Push the component to the device
		checksumPath := componentLocalPath
		if ordered.Type != "media" && ordered.Type != "app_apk" {
			if info, statErr := os.Stat(componentLocalPath); statErr == nil && info.IsDir() {
				candidate := filepath.Join(componentLocalPath, ordered.Name+".tar.gz")
				if _, candidateErr := os.Stat(candidate); candidateErr == nil {
					checksumPath = candidate
				}
			}
		}
		if ordered.Checksum != "" {
			if actual, checksumErr := calculatePathChecksum(checksumPath); checksumErr != nil || actual != ordered.Checksum {
				bytesRestored := int64(0)
				result := ComponentResult{Name: ordered.Name, Type: ordered.Type, Source: ordered.Source, Size: bytesRestored, Status: "failed"}
				if checksumErr != nil {
					result.Error = checksumErr.Error()
				} else {
					result.Error = "checksum component không khớp"
				}
				results = append(results, result)
				componentIndex++
				continue
			}
		}

		bytesRestored, pushErr := a.pushRestoreComponent(ordered, componentLocalPath)

		// Log end time and duration for this component (Task 6.8)
		componentEndTime := time.Now()
		componentDuration := componentEndTime.Sub(componentStartTime)

		result := ComponentResult{
			Name:   ordered.Name,
			Type:   ordered.Type,
			Source: ordered.Source,
			Size:   bytesRestored,
		}

		if pushErr != nil {
			result.Status = "failed"
			result.Error = pushErr.Error()
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Restore] [%s] Hoàn tất: %s | %s | %s | Thời gian: %s",
				componentEndTime.Format("15:04:05"), ordered.Name, formatBytes(bytesRestored), "failed", formatDuration(componentDuration),
			))
		} else {
			result.Status = "success"
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Restore] [%s] Hoàn tất: %s | %s | %s | Thời gian: %s",
				componentEndTime.Format("15:04:05"), ordered.Name, formatBytes(bytesRestored), "success", formatDuration(componentDuration),
			))
		}

		results = append(results, result)
		componentIndex++

		// After pushing a component, check again if we got interrupted during the push
		if interrupted, reason := a.isBackupInterrupted(ctx); interrupted {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Restore] [%s] ⚠ Gián đoạn sau khi push %s: %s",
				time.Now().Format("15:04:05"), ordered.Name, reason,
			))

			// The current component was already pushed (success or fail), keep it.
			var completedNames []string
			for _, r := range results {
				if r.Status == "success" {
					completedNames = append(completedNames, r.Name)
				}
			}
			var incompleteNames []string
			for _, o := range components[componentIndex:] {
				incompleteNames = append(incompleteNames, o.Name)
			}

			// Emit restore_interrupted event
			wailsRuntime.EventsEmit(a.ctx, "restore_interrupted", map[string]interface{}{
				"reason":     reason,
				"completed":  completedNames,
				"incomplete": incompleteNames,
			})

			wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
				"state":   "interrupted",
				"message": fmt.Sprintf("Khôi phục bị gián đoạn: %s. Đã khôi phục: %s", reason, strings.Join(completedNames, ", ")),
			})

			return results, fmt.Errorf("restore bị gián đoạn: %s", reason)
		}
	}

	// Emit final progress: 100% done
	wailsRuntime.EventsEmit(a.ctx, "restore_progress", map[string]interface{}{
		"percent":   100,
		"component": "done",
	})

	return results, nil
}

// pushRestoreComponent pushes a single backup component back to the device.
// For root-protected paths (contacts, sms, app_data):
//   - Finds the .tar.gz file in the component directory
//   - adb push <local_tar.gz> /sdcard/.flashflow_restore_tmp/<name>.tar.gz
//   - adb shell su -c "tar -xzf /sdcard/.flashflow_restore_tmp/<name>.tar.gz -C /"
//   - adb shell su -c "rm -f /sdcard/.flashflow_restore_tmp/<name>.tar.gz"
//
// For media:
//   - adb push <local_media_dir>/ /sdcard/
//
// Returns bytes pushed and any error.
func (a *App) pushRestoreComponent(component BackupComponentMeta, localPath string) (int64, error) {
	adbPath := a.GetToolPath("adb")
	componentName := component.Name

	if component.Type == "media" {
		// Media — direct adb push to /sdcard/ (no root needed)
		target := component.Source
		if strings.TrimSpace(target) == "" {
			target = "/sdcard/"
		}
		return a.adbPushDirect(adbPath, localPath, target)
	}

	if component.Type == "app_apk" {
		return a.installAppAPKComponent(localPath)
	}

	if isRestoreSensitivePath(component.Source) || component.Type == "settings" {
		return 0, fmt.Errorf("component %s bị chặn vì trỏ tới vùng nhạy cảm: %s", component.Name, component.Source)
	}

	// Root-protected components — push tar.gz then extract with root
	// Find the .tar.gz file in the component directory
	tarGzPath := ""
	info, err := os.Stat(localPath)
	if err != nil {
		return 0, fmt.Errorf("không thể truy cập %s: %w", localPath, err)
	}

	if info.IsDir() {
		// Look for .tar.gz file inside the directory
		entries, readErr := os.ReadDir(localPath)
		if readErr != nil {
			return 0, fmt.Errorf("không thể đọc thư mục %s: %w", localPath, readErr)
		}
		for _, entry := range entries {
			if strings.HasSuffix(entry.Name(), ".tar.gz") {
				tarGzPath = filepath.Join(localPath, entry.Name())
				break
			}
		}
		if tarGzPath == "" {
			return 0, fmt.Errorf("không tìm thấy file .tar.gz trong %s", localPath)
		}
	} else {
		// localPath is the tar.gz file itself
		tarGzPath = localPath
	}

	// Get file size for reporting
	tarInfo, err := os.Stat(tarGzPath)
	if err != nil {
		return 0, fmt.Errorf("không thể đọc thông tin file %s: %w", tarGzPath, err)
	}
	fileSize := tarInfo.Size()

	// Step 1: Create temp directory on device
	deviceTmpDir := "/sdcard/.flashflow_restore_tmp"
	deviceTmpPath := deviceTmpDir + "/" + componentName + ".tar.gz"

	_, err = a.runADBShellRoot(adbPath, fmt.Sprintf("mkdir -p %s", deviceTmpDir))
	if err != nil {
		return 0, fmt.Errorf("không thể tạo thư mục tạm trên thiết bị: %w", err)
	}

	// Step 2: Push tar.gz to device temp location
	_, pushErr := a.adbPushDirect(adbPath, tarGzPath, deviceTmpPath)
	if pushErr != nil {
		// Cleanup
		_, _ = a.runADBShellRoot(adbPath, fmt.Sprintf("rm -f %s", deviceTmpPath))
		return 0, fmt.Errorf("lỗi push %s lên thiết bị: %w", componentName, pushErr)
	}

	// Step 3: Extract tar.gz on device with root
	extractCmd := fmt.Sprintf("tar -xzf %s -C /", deviceTmpPath)
	_, extractErr := a.runADBShellRootLong(adbPath, extractCmd, 5*time.Minute)
	if extractErr != nil {
		// Cleanup device temp file
		_, _ = a.runADBShellRoot(adbPath, fmt.Sprintf("rm -f %s", deviceTmpPath))
		return fileSize, fmt.Errorf("lỗi giải nén %s trên thiết bị: %w", componentName, extractErr)
	}

	// Step 4: Restore SELinux context and basic owner/mode when available.
	if strings.TrimSpace(component.Source) != "" {
		if component.Type == "app_data" {
			owner := strings.TrimSpace(a.rootShellOutput(30*time.Second, fmt.Sprintf("stat -c %%u:%%g %s 2>/dev/null", shellQuote(strings.TrimRight(component.Source, "/")))))
			if owner != "" {
				_, _ = a.runADBShellRootLong(adbPath, fmt.Sprintf("chown -R %s %s 2>/dev/null || true", owner, shellQuote(strings.TrimRight(component.Source, "/"))), 2*time.Minute)
			}
		}
		_, _ = a.runADBShellRootLong(adbPath, fmt.Sprintf("restorecon -RF %s 2>/dev/null || true", shellQuote(component.Source)), 2*time.Minute)
	}

	// Step 5: Cleanup temp file on device
	_, _ = a.runADBShellRoot(adbPath, fmt.Sprintf("rm -f %s", deviceTmpPath))

	return fileSize, nil
}

func (a *App) installAppAPKComponent(localPath string) (int64, error) {
	apkDir := filepath.Join(localPath, "apk")
	entries, err := os.ReadDir(apkDir)
	if err != nil {
		return 0, fmt.Errorf("không đọc được thư mục APK: %w", err)
	}
	var apkFiles []string
	var total int64
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".apk") {
			continue
		}
		p := filepath.Join(apkDir, entry.Name())
		apkFiles = append(apkFiles, p)
		if info, statErr := os.Stat(p); statErr == nil {
			total += info.Size()
		}
	}
	sort.Strings(apkFiles)
	if len(apkFiles) == 0 {
		return 0, fmt.Errorf("không tìm thấy APK trong backup")
	}

	flasher.ToolsLock()
	defer flasher.ToolsUnlock()
	adbPath := a.GetToolPath("adb")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	args := []string{"install", "-r"}
	if len(apkFiles) > 1 {
		args = []string{"install-multiple", "-r"}
	}
	args = append(args, apkFiles...)
	cmd := exec.CommandContext(ctx, adbPath, args...)
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if ctx.Err() == context.DeadlineExceeded {
		return total, fmt.Errorf("timeout khi cài APK")
	}
	if err != nil {
		return total, fmt.Errorf("cài APK thất bại: %s", output)
	}
	return total, nil
}

// adbPushDirect runs "adb push <localPath> <remotePath>" and returns bytes pushed.
func (a *App) adbPushDirect(adbPath, localPath, remotePath string) (int64, error) {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "push", localPath, remotePath)
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	if ctx.Err() == context.DeadlineExceeded {
		return 0, fmt.Errorf("timeout khi push %s (10 phút)", localPath)
	}

	// Parse bytes pushed from adb push output
	// Typical format: "path: 1 file pushed, 0 skipped. 45.2 MB/s (123456789 bytes in 2.734s)"
	var bytesTransferred int64
	if strings.Contains(output, "bytes in") {
		if idx := strings.Index(output, "("); idx >= 0 {
			sub := output[idx+1:]
			if endIdx := strings.Index(sub, " bytes"); endIdx >= 0 {
				if n, parseErr := strconv.ParseInt(strings.TrimSpace(sub[:endIdx]), 10, 64); parseErr == nil {
					bytesTransferred = n
				}
			}
		}
	}

	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Restore] Cảnh báo push %s: %s", localPath, output))
		if bytesTransferred > 0 {
			return bytesTransferred, nil // partial success
		}
		return 0, fmt.Errorf("adb push thất bại: %s", output)
	}

	// If we couldn't parse bytes from output, get file/dir size
	if bytesTransferred == 0 {
		info, statErr := os.Stat(localPath)
		if statErr == nil {
			if info.IsDir() {
				bytesTransferred = a.calculateDirSize(localPath)
			} else {
				bytesTransferred = info.Size()
			}
		}
	}

	return bytesTransferred, nil
}

// extractZipToDir extracts all files from a ZIP archive to the specified directory.
func (a *App) extractZipToDir(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("không thể mở ZIP: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		// Skip metadata.json — we already parsed it
		if f.Name == "metadata.json" {
			continue
		}

		destPath := filepath.Join(destDir, f.Name)

		// Security: prevent zip slip
		if !strings.HasPrefix(filepath.Clean(destPath), filepath.Clean(destDir)+string(os.PathSeparator)) {
			continue
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(destPath, 0755); err != nil {
				return fmt.Errorf("không thể tạo thư mục %s: %w", destPath, err)
			}
			continue
		}

		// Ensure parent directory exists
		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			return fmt.Errorf("không thể tạo thư mục cha cho %s: %w", destPath, err)
		}

		// Extract file
		rc, err := f.Open()
		if err != nil {
			return fmt.Errorf("không thể mở entry %s: %w", f.Name, err)
		}

		outFile, err := os.Create(destPath)
		if err != nil {
			rc.Close()
			return fmt.Errorf("không thể tạo file %s: %w", destPath, err)
		}

		if _, err := io.Copy(outFile, rc); err != nil {
			outFile.Close()
			rc.Close()
			return fmt.Errorf("lỗi ghi file %s: %w", destPath, err)
		}

		outFile.Close()
		rc.Close()
	}

	return nil
}

// CancelRestore cancels the currently running restore operation.
// The restore will stop gracefully after the current ADB command finishes.
func (a *App) CancelRestore() {
	restoreMu.Lock()
	defer restoreMu.Unlock()

	if restoreCancel != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Restore] Người dùng yêu cầu hủy khôi phục...")
		wailsRuntime.EventsEmit(a.ctx, "restore_status", map[string]string{
			"state":   "cancelling",
			"message": "Đang dừng quá trình khôi phục...",
		})
		restoreCancel()
	}
}
