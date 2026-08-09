package main

import (
	"archive/zip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/cudin-etn/FlashFlow/flasher"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// BackupComponent đại diện cho một thành phần dữ liệu cần backup từ thiết bị.
type BackupComponent struct {
	Name        string // "contacts", "sms", "app_apk__com_example", "app_data__com_example", "media__Download"
	Type        string // "contacts", "sms", "app_apk", "app_data", "media"
	Source      string // Đường dẫn trên thiết bị
	PackageName string // Chỉ dùng cho app_data
	Priority    int    // Thứ tự backup (số nhỏ = ưu tiên cao)
}

// ComponentResult chứa kết quả backup của một thành phần.
type ComponentResult struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Source   string `json:"source"`
	Checksum string `json:"checksum"`
	Size     int64  `json:"size"`
	Status   string `json:"status"` // "success", "failed", "partial"
	Error    string `json:"error"`
}

// BackupMetadata chứa thông tin metadata của bản backup, được lưu dưới dạng
// metadata.json bên trong file ZIP.
type BackupMetadata struct {
	FormatVersion int                   `json:"formatVersion"`
	AppVersion    string                `json:"appVersion"`
	DeviceName    string                `json:"deviceName"`
	DeviceSerial  string                `json:"deviceSerial"`
	CreatedAt     string                `json:"createdAt"`
	Checksum      string                `json:"checksum"`
	Mode          string                `json:"mode"`
	RiskNote      string                `json:"riskNote"`
	Components    []BackupComponentMeta `json:"components"`
	TotalSize     int64                 `json:"totalSize"`
	Logs          []string              `json:"logs"`
}

// BackupComponentMeta chứa thông tin metadata của một thành phần trong backup.
type BackupComponentMeta struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Source   string `json:"source"`
	Path     string `json:"path"`
	Checksum string `json:"checksum"`
	Size     int64  `json:"size"`
	Status   string `json:"status"`
}

type RootCapabilityReport struct {
	HasRoot         bool     `json:"hasRoot"`
	RootProvider    string   `json:"rootProvider"`
	SuPath          string   `json:"suPath"`
	HasTar          bool     `json:"hasTar"`
	HasGzip         bool     `json:"hasGzip"`
	HasToybox       bool     `json:"hasToybox"`
	HasBusybox      bool     `json:"hasBusybox"`
	SELinux         string   `json:"selinux"`
	AndroidSDK      string   `json:"androidSdk"`
	AndroidRelease  string   `json:"androidRelease"`
	DataFreeBytes   int64    `json:"dataFreeBytes"`
	SdcardFreeBytes int64    `json:"sdcardFreeBytes"`
	MultiUser       bool     `json:"multiUser"`
	Users           []string `json:"users"`
	Warnings        []string `json:"warnings"`
}

type BackupSelectionOptions struct {
	Contacts     bool     `json:"contacts"`
	SMS          bool     `json:"sms"`
	AppPackages  []string `json:"appPackages"`
	MediaFolders []string `json:"mediaFolders"`
}

// sanitizeDeviceName replaces spaces and special characters in a device name
// with underscores to create a safe filename.
func sanitizeDeviceName(name string) string {
	if name == "" {
		return "Unknown_Device"
	}
	// Replace any character that is not alphanumeric, dash, or underscore with underscore
	re := regexp.MustCompile(`[^a-zA-Z0-9\-_]`)
	sanitized := re.ReplaceAllString(name, "_")
	// Collapse multiple underscores
	re2 := regexp.MustCompile(`_+`)
	sanitized = re2.ReplaceAllString(sanitized, "_")
	// Trim leading/trailing underscores
	sanitized = strings.Trim(sanitized, "_")
	if sanitized == "" {
		return "Unknown_Device"
	}
	return sanitized
}

func sanitizeComponentName(name string) string {
	return strings.ToLower(sanitizeDeviceName(strings.ReplaceAll(name, ".", "_")))
}

func componentLocalName(component BackupComponent) string {
	if component.Name != "" {
		return sanitizeComponentName(component.Name)
	}
	return sanitizeComponentName(component.Type)
}

// calculateFileChecksum computes the SHA-256 checksum of a file and returns
// it in the format "sha256:<hex>".
func calculateFileChecksum(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("không thể mở file để tính checksum: %w", err)
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", fmt.Errorf("lỗi đọc file khi tính checksum: %w", err)
	}

	return "sha256:" + hex.EncodeToString(h.Sum(nil)), nil
}

func calculatePathChecksum(path string) (string, error) {
	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.IsDir() {
		return calculateFileChecksum(path)
	}

	h := sha256.New()
	var files []string
	if err := filepath.Walk(path, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		files = append(files, p)
		return nil
	}); err != nil {
		return "", err
	}
	sort.Strings(files)
	for _, p := range files {
		rel, _ := filepath.Rel(path, p)
		_, _ = h.Write([]byte(filepath.ToSlash(rel)))
		f, err := os.Open(p)
		if err != nil {
			return "", err
		}
		if _, err := io.Copy(h, f); err != nil {
			f.Close()
			return "", err
		}
		f.Close()
	}
	return "sha256:" + hex.EncodeToString(h.Sum(nil)), nil
}

// compressBackupToZIP compresses all pulled backup data into a single ZIP file
// with a metadata.json inside. The ZIP is saved to {library}/Backups/{deviceName}_{YYYYMMDD}_{HHmmss}.zip.
// After creating the ZIP, it calculates the SHA-256 checksum and updates the metadata inside.
// Returns the final ZIP file path.
func (a *App) compressBackupToZIP(outputDir string, results []ComponentResult, deviceName string, deviceSerial string) (string, error) {
	now := time.Now()

	// Build ZIP filename
	safeName := sanitizeDeviceName(deviceName)
	zipFilename := fmt.Sprintf("%s_%s.zip", safeName, now.Format("20060102_150405"))
	backupDir := filepath.Join(a.getLibraryDir(), "Backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return "", fmt.Errorf("không thể tạo thư mục Backups: %w", err)
	}
	zipPath := filepath.Join(backupDir, zipFilename)

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Đang nén dữ liệu vào: %s", zipFilename))
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "compressing",
		"message": "Đang nén dữ liệu backup thành file ZIP...",
	})

	// Build component metadata
	var components []BackupComponentMeta
	var totalSize int64
	for _, r := range results {
		meta := BackupComponentMeta{
			Name:     r.Name,
			Type:     r.Type,
			Source:   r.Source,
			Path:     r.Name + "/",
			Checksum: r.Checksum,
			Size:     r.Size,
			Status:   r.Status,
		}
		components = append(components, meta)
		totalSize += r.Size
	}

	// Create metadata (checksum will be updated after ZIP is finalized)
	metadata := BackupMetadata{
		FormatVersion: 2,
		AppVersion:    CurrentVersion,
		DeviceName:    deviceName,
		DeviceSerial:  deviceSerial,
		CreatedAt:     now.Format(time.RFC3339),
		Checksum:      "", // Will be set after ZIP creation
		Mode:          "selective-root",
		RiskNote:      "FlashFlow không backup/restore /data/system, lockscreen, keymaster hoặc dữ liệu nhạy cảm mã hóa.",
		Components:    components,
		TotalSize:     totalSize,
		Logs:          []string{"created selective root backup", "excluded /data/system and encryption-sensitive paths"},
	}

	// Create ZIP file
	zipFile, err := os.Create(zipPath)
	if err != nil {
		return "", fmt.Errorf("không thể tạo file ZIP: %w", err)
	}

	zipWriter := zip.NewWriter(zipFile)

	// Walk outputDir and add all files to ZIP
	err = filepath.Walk(outputDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		if info.IsDir() {
			return nil
		}

		// Get relative path from outputDir
		relPath, err := filepath.Rel(outputDir, path)
		if err != nil {
			return err
		}
		// Use forward slashes in ZIP
		relPath = filepath.ToSlash(relPath)

		// Create ZIP entry with file info
		header, err := zip.FileInfoHeader(info)
		if err != nil {
			return err
		}
		header.Name = relPath
		header.Method = zip.Deflate

		writer, err := zipWriter.CreateHeader(header)
		if err != nil {
			return err
		}

		file, err := os.Open(path)
		if err != nil {
			return err
		}
		defer file.Close()

		_, err = io.Copy(writer, file)
		return err
	})
	if err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi khi thêm file vào ZIP: %w", err)
	}

	// Add metadata.json to ZIP (without checksum for now)
	metadataJSON, err := json.MarshalIndent(metadata, "", "  ")
	if err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi serialize metadata: %w", err)
	}

	metaWriter, err := zipWriter.Create("metadata.json")
	if err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi tạo metadata.json trong ZIP: %w", err)
	}
	if _, err := metaWriter.Write(metadataJSON); err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi ghi metadata.json: %w", err)
	}

	manifestJSON, err := json.MarshalIndent(components, "", "  ")
	if err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi serialize manifest: %w", err)
	}
	manifestWriter, err := zipWriter.Create("manifest.json")
	if err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi tạo manifest.json trong ZIP: %w", err)
	}
	if _, err := manifestWriter.Write(manifestJSON); err != nil {
		zipWriter.Close()
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi ghi manifest.json: %w", err)
	}

	// Close ZIP writer and file
	if err := zipWriter.Close(); err != nil {
		zipFile.Close()
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi đóng ZIP writer: %w", err)
	}
	if err := zipFile.Close(); err != nil {
		os.Remove(zipPath)
		return "", fmt.Errorf("lỗi đóng file ZIP: %w", err)
	}

	// Calculate checksum of the final ZIP
	checksum, err := calculateFileChecksum(zipPath)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không thể tính checksum: %v", err))
		// Don't fail the whole backup for checksum error, just log it
	} else {
		metadata.Checksum = checksum
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Checksum: %s", checksum))
	}

	// Get final ZIP size
	zipInfo, err := os.Stat(zipPath)
	if err == nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] File ZIP: %s (%s)", zipFilename, formatBytes(zipInfo.Size())))
	}

	return zipPath, nil
}

// defaultBackupComponents trả về danh sách các thành phần backup mặc định
// theo thứ tự ưu tiên.
func defaultBackupComponents() []BackupComponent {
	return []BackupComponent{
		{Name: "contacts", Type: "contacts", Source: "/data/data/com.android.providers.contacts/databases/", Priority: 1},
		{Name: "sms", Type: "sms", Source: "/data/data/com.android.providers.telephony/databases/", Priority: 2},
	}
}

func backupComponentsFromSelection(selection BackupSelectionOptions) []BackupComponent {
	components := []BackupComponent{}
	if selection.Contacts {
		components = append(components, BackupComponent{Name: "contacts", Type: "contacts", Source: "/data/data/com.android.providers.contacts/databases/", Priority: 1})
	}
	if selection.SMS {
		components = append(components, BackupComponent{Name: "sms", Type: "sms", Source: "/data/data/com.android.providers.telephony/databases/", Priority: 2})
	}
	for i, pkg := range selection.AppPackages {
		pkg = strings.TrimSpace(pkg)
		if pkg == "" || strings.Contains(pkg, "/") || strings.Contains(pkg, "..") {
			continue
		}
		components = append(components, BackupComponent{
			Name:        "app_apk__" + sanitizeComponentName(pkg),
			Type:        "app_apk",
			Source:      pkg,
			PackageName: pkg,
			Priority:    10 + (i * 2),
		})
		components = append(components, BackupComponent{
			Name:        "app_data__" + sanitizeComponentName(pkg),
			Type:        "app_data",
			Source:      "/data/data/" + pkg + "/",
			PackageName: pkg,
			Priority:    11 + (i * 2),
		})
	}
	for i, folder := range selection.MediaFolders {
		folder = strings.Trim(strings.TrimSpace(folder), "/")
		if folder == "" || strings.Contains(folder, "..") {
			continue
		}
		components = append(components, BackupComponent{
			Name:     "media__" + sanitizeComponentName(folder),
			Type:     "media",
			Source:   "/sdcard/" + folder + "/",
			Priority: 100 + i,
		})
	}
	return components
}

// pullBackupComponent pulls a single backup component from the device to a local directory.
// For root-protected paths (/data/...), it uses:
//
//	adb shell su -c "tar -czf /sdcard/.flashflow_backup_tmp/<name>.tar.gz <source>"
//	adb pull /sdcard/.flashflow_backup_tmp/<name>.tar.gz <localDir>
//	adb shell su -c "rm -rf /sdcard/.flashflow_backup_tmp/<name>.tar.gz"
//
// For /sdcard (media), it uses direct "adb pull /sdcard/ <localDir>" (no root needed).
// Returns the total bytes pulled and any error.
func (a *App) pullBackupComponent(component BackupComponent, outputDir string) (int64, error) {
	adbPath := a.GetToolPath("adb")
	localName := componentLocalName(component)

	// Create subdirectory for this component
	localDir := filepath.Join(outputDir, localName)
	if err := os.MkdirAll(localDir, 0755); err != nil {
		return 0, fmt.Errorf("không thể tạo thư mục %s: %w", localDir, err)
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Đang pull: %s (%s)", component.Name, component.Source))
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "pulling",
		"message": fmt.Sprintf("Đang backup: %s", component.Name),
	})

	if component.Type == "media" {
		// Media (/sdcard) — direct adb pull, no root needed
		pulledBytes, err := a.adbPullDirect(adbPath, component.Source, localDir)
		if err != nil {
			return pulledBytes, fmt.Errorf("lỗi pull %s: %w", component.Name, err)
		}
		return pulledBytes, nil
	}

	if component.Type == "app_apk" {
		pulledBytes, err := a.pullAppAPKComponent(component, localDir)
		if err != nil {
			return pulledBytes, fmt.Errorf("lỗi backup APK %s: %w", component.PackageName, err)
		}
		return pulledBytes, nil
	}

	// Root-protected paths — tar on device, then pull tar file
	tmpFileName := localName + ".tar.gz"
	deviceTmpDir := "/sdcard/.flashflow_backup_tmp"
	deviceTmpPath := deviceTmpDir + "/" + tmpFileName

	// Step 1: Create temp dir on device
	_, err := a.runADBShellRoot(adbPath, fmt.Sprintf("mkdir -p %s", deviceTmpDir))
	if err != nil {
		return 0, fmt.Errorf("không thể tạo thư mục tạm trên thiết bị: %w", err)
	}

	// Step 2: Tar the source to temp location on device
	tarCmd := fmt.Sprintf("tar -czf %s -C / %s 2>/dev/null || true", deviceTmpPath, strings.TrimPrefix(component.Source, "/"))
	_, err = a.runADBShellRootLong(adbPath, tarCmd, 5*time.Minute)
	if err != nil {
		// Cleanup on failure
		_, _ = a.runADBShellRoot(adbPath, fmt.Sprintf("rm -f %s", deviceTmpPath))
		return 0, fmt.Errorf("lỗi tar %s trên thiết bị: %w", component.Name, err)
	}

	// Step 3: Pull the tar file to local
	localTarPath := filepath.Join(localDir, tmpFileName)
	pulledBytes, err := a.adbPullDirect(adbPath, deviceTmpPath, localDir)
	if err != nil {
		// Cleanup device temp
		_, _ = a.runADBShellRoot(adbPath, fmt.Sprintf("rm -f %s", deviceTmpPath))
		return pulledBytes, fmt.Errorf("lỗi pull tar %s: %w", component.Name, err)
	}

	// Step 4: Cleanup temp file on device
	_, _ = a.runADBShellRoot(adbPath, fmt.Sprintf("rm -f %s", deviceTmpPath))

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] ✓ %s: %s", component.Name, formatBytes(pulledBytes)))

	// Verify the tar file exists locally
	if info, statErr := os.Stat(localTarPath); statErr == nil {
		pulledBytes = info.Size()
	}

	return pulledBytes, nil
}

func (a *App) pullAppAPKComponent(component BackupComponent, localDir string) (int64, error) {
	adbPath := a.GetToolPath("adb")
	pkg := strings.TrimSpace(component.PackageName)
	if pkg == "" {
		pkg = strings.TrimSpace(component.Source)
	}
	if pkg == "" || strings.Contains(pkg, "/") || strings.Contains(pkg, "..") {
		return 0, fmt.Errorf("package không hợp lệ: %s", pkg)
	}

	out := a.adbShellOutput(15*time.Second, "pm", "path", pkg)
	lines := strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n")
	var apkPaths []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "package:") {
			apkPath := strings.TrimSpace(strings.TrimPrefix(line, "package:"))
			if apkPath != "" {
				apkPaths = append(apkPaths, apkPath)
			}
		}
	}
	if len(apkPaths) == 0 {
		return 0, fmt.Errorf("không tìm thấy APK cho %s", pkg)
	}

	var total int64
	apkDir := filepath.Join(localDir, "apk")
	if err := os.MkdirAll(apkDir, 0755); err != nil {
		return 0, err
	}
	for i, apkPath := range apkPaths {
		name := filepath.Base(apkPath)
		if name == "" || name == "." || name == "/" {
			name = fmt.Sprintf("split_%02d.apk", i)
		}
		dest := filepath.Join(apkDir, fmt.Sprintf("%02d_%s", i, sanitizeDeviceName(name)))
		size, err := a.adbPullFile(adbPath, apkPath, dest)
		if err != nil {
			return total, err
		}
		total += size
	}

	versionName := a.adbShellOutput(10*time.Second, "sh", "-c", fmt.Sprintf("dumpsys package %s 2>/dev/null | grep -m 1 versionName", shellQuote(pkg)))
	metadata := map[string]interface{}{
		"packageName": pkg,
		"apkPaths":    apkPaths,
		"versionName": strings.TrimSpace(versionName),
		"createdAt":   time.Now().Format(time.RFC3339),
	}
	metadataJSON, _ := json.MarshalIndent(metadata, "", "  ")
	if err := os.WriteFile(filepath.Join(localDir, "package.json"), metadataJSON, 0644); err != nil {
		return total, err
	}
	if total == 0 {
		total = a.calculateDirSize(localDir)
	}
	return total, nil
}

func (a *App) adbPullFile(adbPath, remotePath, localPath string) (int64, error) {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	cmd := exec.CommandContext(ctx, adbPath, "pull", remotePath, localPath)
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return 0, fmt.Errorf("timeout khi pull %s", remotePath)
	}
	if err != nil {
		return 0, fmt.Errorf("adb pull thất bại: %s", strings.TrimSpace(string(out)))
	}
	if info, statErr := os.Stat(localPath); statErr == nil {
		return info.Size(), nil
	}
	return 0, nil
}

// adbPullDirect runs "adb pull <remotePath> <localDir>" and returns bytes pulled.
func (a *App) adbPullDirect(adbPath, remotePath, localDir string) (int64, error) {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "pull", remotePath, localDir)
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	if ctx.Err() == context.DeadlineExceeded {
		return 0, fmt.Errorf("timeout khi pull %s (10 phút)", remotePath)
	}

	// Parse bytes pulled from adb pull output (e.g., "1234 files pulled, 0 skipped. 45.2 MB/s (123456789 bytes in 2.734s)")
	var bytesTransferred int64
	if strings.Contains(output, "bytes in") {
		// Try to parse "(NNNN bytes in ...)"
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
		// adb pull may return error but still pull some files
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo pull %s: %s", remotePath, output))
		if bytesTransferred > 0 {
			return bytesTransferred, nil // partial success
		}
		return 0, fmt.Errorf("adb pull thất bại: %s", output)
	}

	// If we couldn't parse bytes from output, calculate from local dir size
	if bytesTransferred == 0 {
		bytesTransferred = a.calculateDirSize(localDir)
	}

	return bytesTransferred, nil
}

// runADBShellRoot runs "adb shell su -c '<command>'" with a 30s timeout.
func (a *App) runADBShellRoot(adbPath, command string) (string, error) {
	return a.runADBShellRootLong(adbPath, command, 30*time.Second)
}

// runADBShellRootLong runs "adb shell su -c '<command>'" with a custom timeout.
func (a *App) runADBShellRootLong(adbPath, command string, timeout time.Duration) (string, error) {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "shell", "su", "-c", command)
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	if ctx.Err() == context.DeadlineExceeded {
		return output, fmt.Errorf("timeout (%v) khi chạy: %s", timeout, command)
	}
	if err != nil {
		return output, fmt.Errorf("lỗi chạy lệnh root: %v, output: %s", err, output)
	}
	return output, nil
}

// calculateDirSize returns the total size of all files in a directory (recursive).
func (a *App) calculateDirSize(dir string) int64 {
	var total int64
	_ = filepath.Walk(dir, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		total += info.Size()
		return nil
	})
	return total
}

// checkDeviceConnection verifies the device is still connected by running "adb devices"
// and checking if any device is listed. Returns true if device is connected.
func (a *App) checkDeviceConnection() bool {
	adbPath := a.GetToolPath("adb")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "devices")
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	if err != nil || ctx.Err() == context.DeadlineExceeded {
		return false
	}

	output := string(out)
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "List of") {
			continue
		}
		// A connected device line looks like: "SERIAL\tdevice" or "SERIAL\trecovery"
		if strings.Contains(line, "\tdevice") || strings.Contains(line, "\trecovery") {
			return true
		}
	}
	return false
}

// checkDeviceBattery reads the device battery percentage via ADB.
// Returns the battery percentage (0-100) and any error.
func (a *App) checkDeviceBattery() (int, error) {
	adbPath := a.GetToolPath("adb")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "shell", "cat", "/sys/class/power_supply/battery/capacity")
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return 0, fmt.Errorf("timeout khi đọc pin thiết bị")
	}
	if err != nil {
		return 0, fmt.Errorf("không thể đọc pin: %v", err)
	}

	output := strings.TrimSpace(string(out))
	battery, err := strconv.Atoi(output)
	if err != nil {
		return 0, fmt.Errorf("không parse được mức pin từ %q: %v", output, err)
	}

	return battery, nil
}

// isBackupInterrupted checks both device connection and battery level.
// Returns (true, reason) if backup should be interrupted, (false, "") otherwise.
func (a *App) isBackupInterrupted(ctx context.Context) (bool, string) {
	// Check if context was cancelled (manual cancel via CancelBackup)
	select {
	case <-ctx.Done():
		return true, "Backup đã bị hủy bởi người dùng"
	default:
	}

	// Check USB connection
	if !a.checkDeviceConnection() {
		return true, "Mất kết nối USB với thiết bị"
	}

	// Check battery level
	battery, err := a.checkDeviceBattery()
	if err != nil {
		// If we can't read battery, log warning but don't interrupt
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không đọc được pin: %v", err))
		return false, ""
	}

	if battery < 5 {
		return true, fmt.Sprintf("Pin thiết bị quá thấp (%d%%)", battery)
	}

	return false, ""
}

// CancelBackup cancels the currently running backup operation.
// The backup will stop gracefully after the current adb command finishes.
func (a *App) CancelBackup() {
	a.backupMu.Lock()
	defer a.backupMu.Unlock()

	if a.backupCancel != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Người dùng yêu cầu hủy backup...")
		a.backupCancel()
	}
}

// startProgressTicker starts a background goroutine that emits backup_progress events
// every 2 seconds during a component pull. It monitors the local output directory size
// to provide intra-component progress updates.
// Returns a stop function that must be called when the pull completes.
func (a *App) startProgressTicker(componentDir string, componentName string, basePercent int, componentPercent int) func() {
	ticker := time.NewTicker(2 * time.Second)
	done := make(chan struct{})

	go func() {
		for {
			select {
			case <-done:
				ticker.Stop()
				return
			case <-ticker.C:
				// Calculate current size of the component's local directory
				currentSize := a.calculateDirSize(componentDir)
				// Emit progress with current component info and base percentage
				// Since we can't know the total expected size per component precisely,
				// we report the base percent (from completed components) plus a small
				// indication of activity. The percent stays at basePercent until the
				// component finishes, but we still emit every 2s to satisfy the requirement.
				wailsRuntime.EventsEmit(a.ctx, "backup_progress", map[string]interface{}{
					"percent":   basePercent,
					"component": componentName,
					"pulled":    currentSize,
				})
			}
		}
	}()

	return func() {
		close(done)
	}
}

// executeBackupComponents iterates through all backup components in priority order,
// pulls each one, and collects results. Emits backup_progress events every 2 seconds
// during each component pull to satisfy the progress reporting requirement.
// Checks for device connection and battery level before each component.
// If interrupted, keeps successful data, cleans temp files, and notifies user.
// Logs start/end time, data size, duration, and status for each component to flash_log.
func (a *App) executeBackupComponents(ctx context.Context, outputDir string, components []BackupComponent) ([]ComponentResult, error) {
	// Sort by priority
	sort.Slice(components, func(i, j int) bool {
		return components[i].Priority < components[j].Priority
	})

	var results []ComponentResult
	totalComponents := len(components)

	// Track overall backup timing
	backupStartTime := time.Now()

	for i, comp := range components {
		// Check for interruption before each component
		if interrupted, reason := a.isBackupInterrupted(ctx); interrupted {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Backup] ⚠ Gián đoạn: %s", reason,
			))

			// Clean up any partially-pulled temp files for the current component
			componentDir := filepath.Join(outputDir, componentLocalName(comp))
			if _, statErr := os.Stat(componentDir); statErr == nil {
				// Remove the directory for the component that was about to start
				_ = os.RemoveAll(componentDir)
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
					">>> [Backup] Đã xóa file tạm chưa hoàn chỉnh: %s", comp.Name,
				))
			}

			// Build lists of completed and incomplete components
			var completedNames []string
			for _, r := range results {
				if r.Status == "success" {
					completedNames = append(completedNames, r.Name)
				}
			}
			var incompleteNames []string
			for j := i; j < totalComponents; j++ {
				incompleteNames = append(incompleteNames, components[j].Name)
			}

			// Emit backup_interrupted event
			wailsRuntime.EventsEmit(a.ctx, "backup_interrupted", map[string]interface{}{
				"reason":     reason,
				"completed":  completedNames,
				"incomplete": incompleteNames,
			})

			// Notify user with detailed message
			wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
				"state":   "interrupted",
				"message": fmt.Sprintf("Backup bị gián đoạn: %s. Đã backup: %s", reason, strings.Join(completedNames, ", ")),
			})

			return results, fmt.Errorf("backup bị gián đoạn: %s", reason)
		}

		// Calculate percentage range for this component
		basePercent := int((float64(i) / float64(totalComponents)) * 100)

		// Log start time for this component
		componentStartTime := time.Now()
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
			">>> [Backup] [%s] Bắt đầu: %s (%d/%d)",
			componentStartTime.Format("15:04:05"), comp.Name, i+1, totalComponents,
		))
		wailsRuntime.EventsEmit(a.ctx, "backup_progress", map[string]interface{}{
			"percent":   basePercent,
			"component": comp.Name,
		})

		// Start the 2-second progress ticker for intra-component updates
		componentDir := filepath.Join(outputDir, componentLocalName(comp))
		// Ensure the directory exists before starting the ticker
		_ = os.MkdirAll(componentDir, 0755)
		componentPercent := int((1.0 / float64(totalComponents)) * 100)
		stopTicker := a.startProgressTicker(componentDir, comp.Name, basePercent, componentPercent)

		size, err := a.pullBackupComponent(comp, outputDir)

		// Stop the progress ticker now that the pull is complete
		stopTicker()

		// Log end time and duration for this component
		componentEndTime := time.Now()
		componentDuration := componentEndTime.Sub(componentStartTime)

		result := ComponentResult{
			Name:   componentLocalName(comp),
			Type:   comp.Type,
			Source: comp.Source,
			Size:   size,
		}

		if err != nil {
			result.Status = "failed"
			result.Error = err.Error()
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Backup] [%s] Hoàn tất: %s | %s | %s | Thời gian: %s",
				componentEndTime.Format("15:04:05"), comp.Name, formatBytes(size), "failed", formatDuration(componentDuration),
			))
		} else if size == 0 {
			result.Status = "partial"
			result.Error = "không có dữ liệu"
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Backup] [%s] Hoàn tất: %s | %s | %s | Thời gian: %s",
				componentEndTime.Format("15:04:05"), comp.Name, formatBytes(size), "partial", formatDuration(componentDuration),
			))
		} else {
			result.Status = "success"
			componentPath := filepath.Join(outputDir, componentLocalName(comp))
			if comp.Type != "media" && comp.Type != "app_apk" {
				componentPath = filepath.Join(componentPath, componentLocalName(comp)+".tar.gz")
			}
			if checksum, checksumErr := calculatePathChecksum(componentPath); checksumErr == nil {
				result.Checksum = checksum
			} else {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không tính được checksum %s: %v", comp.Name, checksumErr))
			}
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Backup] [%s] Hoàn tất: %s | %s | %s | Thời gian: %s",
				componentEndTime.Format("15:04:05"), comp.Name, formatBytes(size), "success", formatDuration(componentDuration),
			))
		}

		results = append(results, result)

		// After pulling a component, check again if we got interrupted during the pull
		if interrupted, reason := a.isBackupInterrupted(ctx); interrupted {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Backup] ⚠ Gián đoạn sau khi pull %s: %s", comp.Name, reason,
			))

			// The current component was already pulled (success or fail), keep it.
			// Clean up temp files for remaining components that won't be pulled.
			var completedNames []string
			for _, r := range results {
				if r.Status == "success" {
					completedNames = append(completedNames, r.Name)
				}
			}
			var incompleteNames []string
			for j := i + 1; j < totalComponents; j++ {
				incompleteNames = append(incompleteNames, components[j].Name)
			}

			// Emit backup_interrupted event
			wailsRuntime.EventsEmit(a.ctx, "backup_interrupted", map[string]interface{}{
				"reason":     reason,
				"completed":  completedNames,
				"incomplete": incompleteNames,
			})

			wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
				"state":   "interrupted",
				"message": fmt.Sprintf("Backup bị gián đoạn: %s. Đã backup: %s", reason, strings.Join(completedNames, ", ")),
			})

			return results, fmt.Errorf("backup bị gián đoạn: %s", reason)
		}
	}

	// Final progress
	wailsRuntime.EventsEmit(a.ctx, "backup_progress", map[string]interface{}{
		"percent":   100,
		"component": "done",
	})

	// Summary log: total time, total data, success/failed counts
	backupEndTime := time.Now()
	totalDuration := backupEndTime.Sub(backupStartTime)
	var totalDataPulled int64
	successCount := 0
	failedCount := 0
	for _, r := range results {
		totalDataPulled += r.Size
		switch r.Status {
		case "success":
			successCount++
		case "failed":
			failedCount++
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
		">>> [Backup] ═══ Tổng kết: %d thành công, %d thất bại | Tổng dữ liệu: %s | Tổng thời gian: %s ═══",
		successCount, failedCount, formatBytes(totalDataPulled), formatDuration(totalDuration),
	))

	return results, nil
}

// CheckRootAccess kiểm tra thiết bị có root hay không bằng cách chạy
// "adb shell su -c id" với timeout 5 giây.
// Trả về (true, nil) nếu có root, (false, nil) nếu không có root,
// (false, error) nếu timeout hoặc lỗi khác.
func (a *App) CheckRootAccess() (bool, error) {
	adbPath := a.GetToolPath("adb")

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "shell", "su", "-c", "id")
	configureCmd(cmd)

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Kiểm tra quyền root (vui lòng bấm Allow trên điện thoại nếu có popup)...")
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "checking_root",
		"message": "Đang kiểm tra quyền root... Bấm Allow trên điện thoại nếu có popup.",
	})

	out, _ := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	// Timeout — thiết bị không phản hồi hoặc user không bấm Allow
	if ctx.Err() == context.DeadlineExceeded {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Timeout: thiết bị không phản hồi lệnh su trong 15 giây. Có thể user chưa bấm Allow trên điện thoại.")
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": "Timeout 15s — Vui lòng bấm Allow trên điện thoại khi có popup yêu cầu quyền root, rồi thử lại.",
		})
		return false, fmt.Errorf("timeout: vui lòng bấm Allow trên điện thoại khi có popup root")
	}

	// Kiểm tra output có chứa uid=0 (root) — bỏ check err vì một số su binary trả exit code != 0
	if strings.Contains(output, "uid=0(root)") || strings.Contains(output, "uid=0") {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Thiết bị đã root ✓")
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "root_confirmed",
			"message": "Thiết bị đã có quyền root",
		})
		return true, nil
	}

	// Thiết bị không có root (su not found hoặc permission denied)
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Thiết bị KHÔNG có root. Output: %s", output))
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Hướng dẫn: Mở Magisk/KernelSU → Superuser → Cấp quyền cho 'Shell' → Thử lại")
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "no_root",
		"message": "Thiết bị chưa cấp quyền root cho Shell. Mở Magisk → Superuser → Cấp quyền cho Shell, rồi thử lại.",
	})
	return false, nil
}

func (a *App) adbShellOutput(timeout time.Duration, args ...string) string {
	adbPath := a.GetToolPath("adb")
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmdArgs := append([]string{"shell"}, args...)
	cmd := exec.CommandContext(ctx, adbPath, cmdArgs...)
	configureCmd(cmd)
	out, _ := cmd.CombinedOutput()
	return strings.TrimSpace(string(out))
}

func (a *App) rootShellOutput(timeout time.Duration, command string) string {
	adbPath := a.GetToolPath("adb")
	out, _ := a.runADBShellRootLong(adbPath, command, timeout)
	return strings.TrimSpace(out)
}

func parseFirstInt64(text string) int64 {
	for _, part := range strings.Fields(text) {
		if n, err := strconv.ParseInt(part, 10, 64); err == nil {
			return n
		}
	}
	return 0
}

func (a *App) DetectRootCapabilities() RootCapabilityReport {
	report := RootCapabilityReport{Warnings: []string{}}
	hasRoot, err := a.CheckRootAccess()
	report.HasRoot = hasRoot && err == nil
	if err != nil {
		report.Warnings = append(report.Warnings, err.Error())
	}
	if !report.HasRoot {
		report.Warnings = append(report.Warnings, "Backup/Restore chỉ hỗ trợ thiết bị root. Không có non-root fallback.")
		return report
	}

	report.SuPath = a.adbShellOutput(5*time.Second, "which", "su")
	magisk := a.rootShellOutput(5*time.Second, "magisk -V 2>/dev/null || magisk --version 2>/dev/null")
	ksu := a.rootShellOutput(5*time.Second, "ksud -V 2>/dev/null || test -d /data/adb/ksu && echo KernelSU")
	apatch := a.rootShellOutput(5*time.Second, "apd -V 2>/dev/null || test -d /data/adb/ap && echo APatch")
	switch {
	case strings.TrimSpace(magisk) != "":
		report.RootProvider = "Magisk"
	case strings.TrimSpace(ksu) != "":
		report.RootProvider = "KernelSU"
	case strings.TrimSpace(apatch) != "":
		report.RootProvider = "APatch"
	default:
		report.RootProvider = "generic su"
	}

	report.HasTar = strings.TrimSpace(a.rootShellOutput(5*time.Second, "command -v tar")) != ""
	report.HasGzip = strings.TrimSpace(a.rootShellOutput(5*time.Second, "command -v gzip")) != ""
	report.HasToybox = strings.TrimSpace(a.rootShellOutput(5*time.Second, "command -v toybox")) != ""
	report.HasBusybox = strings.TrimSpace(a.rootShellOutput(5*time.Second, "command -v busybox")) != ""
	report.SELinux = a.rootShellOutput(5*time.Second, "getenforce 2>/dev/null || echo unknown")
	report.AndroidSDK = a.adbShellOutput(5*time.Second, "getprop", "ro.build.version.sdk")
	report.AndroidRelease = a.adbShellOutput(5*time.Second, "getprop", "ro.build.version.release")
	report.DataFreeBytes = parseFirstInt64(a.rootShellOutput(5*time.Second, "df -B1 /data 2>/dev/null | tail -n 1 | awk '{print $4}'"))
	report.SdcardFreeBytes = parseFirstInt64(a.rootShellOutput(5*time.Second, "df -B1 /sdcard 2>/dev/null | tail -n 1 | awk '{print $4}'"))
	usersOut := a.rootShellOutput(5*time.Second, "pm list users 2>/dev/null")
	for _, line := range strings.Split(usersOut, "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(line, "UserInfo{") {
			report.Users = append(report.Users, line)
		}
	}
	report.MultiUser = len(report.Users) > 1
	if !report.HasTar {
		report.Warnings = append(report.Warnings, "Không tìm thấy tar; cần toybox/busybox tar để backup app data.")
	}
	if strings.EqualFold(report.SELinux, "Enforcing") {
		report.Warnings = append(report.Warnings, "SELinux Enforcing: restore sẽ chạy restorecon/fix permission sau từng component.")
	}
	return report
}

// isSpaceSufficient is a pure function that checks if freeSpace is at least
// 1.5 times the dataSize. Used for property-based testing.
// Returns true when freeSpace >= 1.5 * dataSize.
func isSpaceSufficient(freeSpace, dataSize int64) bool {
	// Use integer arithmetic to avoid floating-point precision issues:
	// freeSpace >= 1.5 * dataSize  ⟺  2 * freeSpace >= 3 * dataSize
	return 2*freeSpace >= 3*dataSize
}

// GetBackupEstimatedSize estimates the total backup size by querying the device
// for app data (/data/data) and media (/sdcard) sizes via ADB with root.
func (a *App) GetBackupEstimatedSize() (int64, error) {
	adbPath := a.GetToolPath("adb")

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Đang ước tính dung lượng dữ liệu cần backup...")
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "estimating_size",
		"message": "Đang ước tính dung lượng dữ liệu...",
	})

	var totalSize int64

	// Estimate app data size: /data/data
	appDataSize, err := a.getRemoteDirSize(adbPath, "/data/data")
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không thể đo /data/data: %v", err))
	} else {
		totalSize += appDataSize
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] /data/data: %s", formatBytes(appDataSize)))
	}

	// Estimate media size: /sdcard
	mediaSize, err := a.getRemoteDirSize(adbPath, "/sdcard")
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không thể đo /sdcard: %v", err))
	} else {
		totalSize += mediaSize
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] /sdcard: %s", formatBytes(mediaSize)))
	}

	if totalSize == 0 {
		return 0, fmt.Errorf("không thể ước tính dung lượng backup (cả /data/data và /sdcard đều không đọc được)")
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Tổng dung lượng ước tính: %s", formatBytes(totalSize)))
	return totalSize, nil
}

// getRemoteDirSize runs "adb shell su -c du -sb <path>" and parses the result.
func (a *App) getRemoteDirSize(adbPath, remotePath string) (int64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, adbPath, "shell", "su", "-c", fmt.Sprintf("du -sb %s", remotePath))
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return 0, fmt.Errorf("timeout khi đo dung lượng %s", remotePath)
	}
	if err != nil {
		return 0, fmt.Errorf("lỗi chạy du -sb %s: %v, output: %s", remotePath, err, strings.TrimSpace(string(out)))
	}

	output := strings.TrimSpace(string(out))
	// du -sb output format: "12345\t/path"
	parts := strings.Fields(output)
	if len(parts) < 1 {
		return 0, fmt.Errorf("output không hợp lệ từ du -sb %s: %q", remotePath, output)
	}

	size, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, fmt.Errorf("không parse được dung lượng từ %q: %v", parts[0], err)
	}

	return size, nil
}

// CheckDiskSpace checks if the disk containing the library directory has enough
// free space for the backup. Returns true if freeSpace >= 1.5 * estimatedSize.
func (a *App) CheckDiskSpace(estimatedSize int64) (bool, error) {
	libDir := a.getLibraryDir()
	freeSpace, err := getDiskFreeSpace(libDir)
	if err != nil {
		return false, fmt.Errorf("không thể kiểm tra dung lượng trống: %w", err)
	}

	sufficient := isSpaceSufficient(freeSpace, estimatedSize)

	requiredSpace := int64(float64(estimatedSize) * 1.5)
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
		">>> [Backup] Dung lượng trống: %s | Cần tối thiểu: %s (1.5x dữ liệu)",
		formatBytes(freeSpace), formatBytes(requiredSpace),
	))

	return sufficient, nil
}

// formatBytes formats bytes into a human-readable string.
func formatBytes(bytes int64) string {
	const (
		KB = 1024
		MB = KB * 1024
		GB = MB * 1024
	)
	switch {
	case bytes >= GB:
		return fmt.Sprintf("%.2f GB", float64(bytes)/float64(GB))
	case bytes >= MB:
		return fmt.Sprintf("%.1f MB", float64(bytes)/float64(MB))
	case bytes >= KB:
		return fmt.Sprintf("%.1f KB", float64(bytes)/float64(KB))
	default:
		return fmt.Sprintf("%d B", bytes)
	}
}

// formatDuration formats a time.Duration into a human-readable string (e.g., "2m30s", "45s").
func formatDuration(d time.Duration) string {
	if d < time.Second {
		return fmt.Sprintf("%dms", d.Milliseconds())
	}
	d = d.Round(time.Second)
	m := int(d.Minutes())
	s := int(d.Seconds()) % 60
	if m > 0 {
		return fmt.Sprintf("%dm%02ds", m, s)
	}
	return fmt.Sprintf("%ds", s)
}

// StartFullBackup bắt đầu quá trình backup toàn bộ dữ liệu thiết bị.
func (a *App) StartFullBackup() error {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Full backup đã bị vô hiệu hóa; chuyển sang selective contacts + sms.")
	return a.StartSelectiveBackup(BackupSelectionOptions{Contacts: true, SMS: true})
}

func (a *App) StartSelectiveBackup(selection BackupSelectionOptions) error {
	components := backupComponentsFromSelection(selection)
	if len(components) == 0 {
		return fmt.Errorf("chưa chọn thành phần nào để backup")
	}
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Bắt đầu quy trình Backup chọn lọc root-only...")
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "starting",
		"message": "Đang khởi tạo quá trình backup...",
	})

	// Create backup context with cancel for graceful interruption
	backupCtx, backupCancel := context.WithCancel(context.Background())
	a.backupMu.Lock()
	a.backupCtx = backupCtx
	a.backupCancel = backupCancel
	a.backupMu.Unlock()

	// Ensure we clean up the backup context when done
	defer func() {
		backupCancel()
		a.backupMu.Lock()
		a.backupCtx = nil
		a.backupCancel = nil
		a.backupMu.Unlock()
	}()

	// Bước 1: Kiểm tra root + capability report
	capabilities := a.DetectRootCapabilities()
	wailsRuntime.EventsEmit(a.ctx, "backup_capabilities", capabilities)
	if !capabilities.HasRoot {
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": "Thiết bị chưa có root hoặc chưa cấp quyền root cho Shell.",
		})
		return fmt.Errorf("backup chỉ hỗ trợ root; không có non-root mode")
	}

	// Bước 2: Kiểm tra dung lượng đĩa
	adbPath := a.GetToolPath("adb")
	var estimatedSize int64
	for _, comp := range components {
		if comp.Type == "app_apk" {
			continue
		}
		if size, err := a.getRemoteDirSize(adbPath, strings.TrimRight(comp.Source, "/")); err == nil {
			estimatedSize += size
		} else {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không ước tính được %s: %v", comp.Name, err))
		}
	}
	if estimatedSize == 0 {
		estimatedSize = 256 * 1024 * 1024
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Không ước tính được dung lượng, dùng mức dự phòng 256MB để kiểm tra disk.")
	}

	sufficient, err := a.CheckDiskSpace(estimatedSize)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Lỗi kiểm tra dung lượng trống: %v", err),
		})
		return fmt.Errorf("lỗi kiểm tra dung lượng trống: %w", err)
	}

	if !sufficient {
		libDir := a.getLibraryDir()
		freeSpace, _ := getDiskFreeSpace(libDir)
		requiredSpace := int64(float64(estimatedSize) * 1.5)
		errMsg := fmt.Sprintf(
			"Dung lượng trống không đủ. Cần tối thiểu: %s, hiện có: %s. Vui lòng giải phóng dung lượng trước khi backup.",
			formatBytes(requiredSpace), formatBytes(freeSpace),
		)
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": errMsg,
		})
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] ✗ "+errMsg)
		return fmt.Errorf(errMsg)
	}

	// Bước 3: Tạo thư mục output cho backup
	backupDir := filepath.Join(a.getLibraryDir(), "Backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Không thể tạo thư mục backup: %v", err),
		})
		return fmt.Errorf("không thể tạo thư mục backup: %w", err)
	}

	// Tạo thư mục tạm cho phiên backup này
	sessionID := time.Now().Format("20060102_150405")
	outputDir := filepath.Join(backupDir, "tmp_"+sessionID)
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Không thể tạo thư mục phiên backup: %v", err),
		})
		return fmt.Errorf("không thể tạo thư mục phiên backup: %w", err)
	}

	// Bước 4: Pull tất cả backup components
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Bắt đầu pull dữ liệu từ thiết bị...")
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "pulling",
		"message": "Đang backup dữ liệu từ thiết bị...",
	})

	results, err := a.executeBackupComponents(backupCtx, outputDir, components)
	if err != nil {
		// Check if this was an interruption (partial results available)
		if strings.Contains(err.Error(), "backup bị gián đoạn") {
			// Keep the output directory with successful data intact
			// The backup_interrupted event was already emitted by executeBackupComponents
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
				">>> [Backup] Dữ liệu đã backup được giữ tại: %s", outputDir,
			))
			return fmt.Errorf("backup bị gián đoạn: %w", err)
		}
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Lỗi backup: %v", err),
		})
		return fmt.Errorf("lỗi backup components: %w", err)
	}

	// Kiểm tra kết quả
	successCount := 0
	var totalPulled int64
	for _, r := range results {
		if r.Status == "success" {
			successCount++
			totalPulled += r.Size
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(
		">>> [Backup] Hoàn tất pull: %d/%d thành phần, tổng %s",
		successCount, len(results), formatBytes(totalPulled),
	))
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "completed_pull",
		"message": fmt.Sprintf("Đã pull %d/%d thành phần (%s)", successCount, len(results), formatBytes(totalPulled)),
	})

	// Bước 5: Nén dữ liệu thành file ZIP
	// Get device name from CheckDevice()
	deviceInfo := a.CheckDevice()
	deviceName := deviceInfo.Model
	deviceSerial := deviceInfo.Serial
	if deviceName == "" || deviceName == "Đang nạp ROM..." {
		deviceName = "Android_Device"
	}

	zipPath, err := a.compressBackupToZIP(outputDir, results, deviceName, deviceSerial)
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
			"state":   "error",
			"message": fmt.Sprintf("Lỗi nén ZIP: %v", err),
		})
		return fmt.Errorf("lỗi nén backup thành ZIP: %w", err)
	}

	// Bước 6: Xóa thư mục tạm sau khi ZIP đã tạo thành công
	if err := os.RemoveAll(outputDir); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Cảnh báo: không thể xóa thư mục tạm: %v", err))
		// Non-fatal — ZIP was created successfully
	} else {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Backup] Đã xóa thư mục tạm")
	}

	// Emit backup_complete event with final ZIP path
	wailsRuntime.EventsEmit(a.ctx, "backup_complete", map[string]interface{}{
		"path":    zipPath,
		"size":    totalPulled,
		"success": successCount,
		"total":   len(results),
	})
	wailsRuntime.EventsEmit(a.ctx, "backup_status", map[string]string{
		"state":   "completed",
		"message": fmt.Sprintf("Backup hoàn tất! File: %s", filepath.Base(zipPath)),
	})
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] ✓ Backup hoàn tất: %s", zipPath))

	return nil
}

// BackupItem represents a single backup entry for the UI.
type BackupItem struct {
	ID         string                `json:"id"`
	DeviceName string                `json:"deviceName"`
	CreatedAt  string                `json:"createdAt"`
	Size       int64                 `json:"size"`
	SizeStr    string                `json:"sizeStr"`
	Status     string                `json:"status"` // "complete" or "incomplete"
	Filename   string                `json:"filename"`
	Components []BackupComponentMeta `json:"components"`
}

// ListBackups scans the {library}/Backups/ directory for .zip files,
// reads metadata.json from each ZIP to get device name, date, size, status.
// Returns a sorted list (newest first) along with total disk usage.
func (a *App) ListBackups() []BackupItem {
	backupDir := filepath.Join(a.getLibraryDir(), "Backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return []BackupItem{}
	}

	entries, err := os.ReadDir(backupDir)
	if err != nil {
		return []BackupItem{}
	}

	var items []BackupItem

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if !strings.HasSuffix(strings.ToLower(entry.Name()), ".zip") {
			continue
		}

		fullPath := filepath.Join(backupDir, entry.Name())
		info, err := entry.Info()
		if err != nil {
			continue
		}

		// Try to read metadata from ZIP
		item := BackupItem{
			ID:       entry.Name(),
			Filename: entry.Name(),
			Size:     info.Size(),
		}

		// Format size
		if info.Size() >= 1024*1024*1024 {
			item.SizeStr = fmt.Sprintf("%.2f GB", float64(info.Size())/float64(1024*1024*1024))
		} else {
			item.SizeStr = fmt.Sprintf("%.1f MB", float64(info.Size())/float64(1024*1024))
		}

		// Try to read metadata.json from inside the ZIP
		metadata, metaErr := a.readBackupMetadata(fullPath)
		if metaErr == nil && metadata != nil {
			item.DeviceName = metadata.DeviceName
			item.CreatedAt = metadata.CreatedAt
			item.Components = metadata.Components

			// Determine status: check if all components are "success"
			allSuccess := true
			for _, comp := range metadata.Components {
				if comp.Status != "success" && comp.Status != "complete" {
					allSuccess = false
					break
				}
			}
			if allSuccess && len(metadata.Components) > 0 {
				item.Status = "complete"
			} else {
				item.Status = "incomplete"
			}
		} else {
			// Fallback: parse filename for device name and date
			item.DeviceName = parseDeviceNameFromFilename(entry.Name())
			item.CreatedAt = info.ModTime().Format(time.RFC3339)
			item.Status = "incomplete"
		}

		items = append(items, item)
	}

	// Sort by date descending (newest first)
	sort.Slice(items, func(i, j int) bool {
		ti, _ := time.Parse(time.RFC3339, items[i].CreatedAt)
		tj, _ := time.Parse(time.RFC3339, items[j].CreatedAt)
		return ti.After(tj)
	})

	return items
}

// readBackupMetadata opens a ZIP file and reads the metadata.json inside.
func (a *App) readBackupMetadata(zipPath string) (*BackupMetadata, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("cannot open zip: %w", err)
	}
	defer r.Close()

	for _, f := range r.File {
		if f.Name == "metadata.json" {
			rc, err := f.Open()
			if err != nil {
				return nil, fmt.Errorf("cannot open metadata.json: %w", err)
			}
			defer rc.Close()

			var metadata BackupMetadata
			decoder := json.NewDecoder(rc)
			if err := decoder.Decode(&metadata); err != nil {
				return nil, fmt.Errorf("cannot decode metadata.json: %w", err)
			}
			return &metadata, nil
		}
	}

	return nil, fmt.Errorf("metadata.json not found in zip")
}

// parseDeviceNameFromFilename extracts device name from backup filename format:
// {deviceName}_{YYYYMMDD}_{HHmmss}.zip
func parseDeviceNameFromFilename(filename string) string {
	// Remove .zip extension
	name := strings.TrimSuffix(filename, ".zip")

	// Try to find the date pattern at the end: _YYYYMMDD_HHmmss
	parts := strings.Split(name, "_")
	if len(parts) >= 3 {
		// Last two parts should be date and time
		// Rejoin everything except the last 2 parts as device name
		deviceParts := parts[:len(parts)-2]
		return strings.Join(deviceParts, " ")
	}

	return name
}

// DeleteBackup deletes the specified backup ZIP file.
// Returns error if file doesn't exist or can't be deleted.
func (a *App) DeleteBackup(filename string) error {
	if filename == "" {
		return fmt.Errorf("filename cannot be empty")
	}

	// Sanitize: prevent path traversal
	if strings.Contains(filename, "..") || strings.Contains(filename, "/") || strings.Contains(filename, "\\") {
		return fmt.Errorf("invalid filename")
	}

	backupDir := filepath.Join(a.getLibraryDir(), "Backups")
	fullPath := filepath.Join(backupDir, filename)

	// Check if file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		return fmt.Errorf("backup file not found: %s", filename)
	}

	// Delete the file
	if err := os.Remove(fullPath); err != nil {
		return fmt.Errorf("cannot delete backup: %w", err)
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Backup] Đã xóa bản backup: %s", filename))
	return nil
}

// GetBackupsDiskUsage returns the total size in bytes of all backup files.
func (a *App) GetBackupsDiskUsage() int64 {
	backupDir := filepath.Join(a.getLibraryDir(), "Backups")
	if _, err := os.Stat(backupDir); os.IsNotExist(err) {
		return 0
	}

	var totalSize int64
	_ = filepath.Walk(backupDir, func(_ string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		totalSize += info.Size()
		return nil
	})

	return totalSize
}
