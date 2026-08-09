package main

import (
	"archive/zip"
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/cudin-etn/FlashFlow/flasher"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx        context.Context
	run        *flasher.Runner
	flashMutex sync.Mutex
	isFlashing bool

	flashCtx    context.Context
	flashCancel context.CancelFunc

	toolsDir string

	lastMu sync.Mutex
	last   *DeviceInfo

	cmdMu       sync.Mutex
	cmdInFlight bool

	rebootMu    sync.Mutex
	rebootUntil time.Time

	selectedVendor string

	onePlusPlatformMu sync.RWMutex
	onePlusPlatform   onePlusPlatformInfo

	reportMu    sync.Mutex
	flashReport *FlashReport

	watcherMu     sync.Mutex
	watcherPaused bool

	backupMu     sync.Mutex
	backupCtx    context.Context
	backupCancel context.CancelFunc
}

func (a *App) isFlashActive() bool {
	a.flashMutex.Lock()
	defer a.flashMutex.Unlock()
	return a.isFlashing
}

// PauseDeviceWatcher stops the device watcher polling loop from calling
// fastboot devices / adb devices to avoid USB conflicts during flash.
func (a *App) PauseDeviceWatcher() {
	a.watcherMu.Lock()
	a.watcherPaused = true
	a.watcherMu.Unlock()
}

// ResumeDeviceWatcher restores the device watcher to normal operation
// after flash completes (success or failure).
func (a *App) ResumeDeviceWatcher() {
	a.watcherMu.Lock()
	a.watcherPaused = false
	a.watcherMu.Unlock()
}

func (a *App) isWatcherPaused() bool {
	a.watcherMu.Lock()
	defer a.watcherMu.Unlock()
	return a.watcherPaused
}

func (a *App) activeFlashContext() context.Context {
	a.flashMutex.Lock()
	defer a.flashMutex.Unlock()
	if a.isFlashing && a.flashCtx != nil {
		return a.flashCtx
	}
	return context.Background()
}

// isFlashCancelled returns true if the user has requested cancellation via CancelFlash().
// Flash loops should check this between commands to stop gracefully.
func (a *App) isFlashCancelled() bool {
	ctx := a.activeFlashContext()
	select {
	case <-ctx.Done():
		return true
	default:
		return false
	}
}

type DeviceInfo struct {
	flasher.Device
	Connected  bool         `json:"connected"`
	Vendor     string       `json:"vendor"`
	Bootloader string       `json:"bootloader"`
	Actions    QuickActions `json:"actions"`
}

type QuickActions struct {
	RebootSystem     bool `json:"rebootSystem"`
	RebootBootloader bool `json:"rebootBootloader"`
	RebootRecovery   bool `json:"rebootRecovery"`
	RebootFastbootD  bool `json:"rebootFastbootD"`
	LockBootloader   bool `json:"lockBootloader"`
}

type FlashReport struct {
	SessionID            string   `json:"sessionId"`
	StartedAt            string   `json:"startedAt"`
	EndedAt              string   `json:"endedAt"`
	DeviceName           string   `json:"deviceName"`
	Vendor               string   `json:"vendor"`
	ROM                  string   `json:"rom"`
	Wipe                 bool     `json:"wipe"`
	ARBMode              string   `json:"arbMode"`
	Result               string   `json:"result"`
	FlashedPartitions    []string `json:"flashedPartitions"`
	SkippedARBPartitions []string `json:"skippedArbPartitions"`
	Failures             []string `json:"failures"`
	Logs                 []string `json:"logs"`
}

type RomSourceAnalysis struct {
	Path         string   `json:"path"`
	Name         string   `json:"name"`
	Exists       bool     `json:"exists"`
	IsDir        bool     `json:"isDir"`
	IsZip        bool     `json:"isZip"`
	HasPayload   bool     `json:"hasPayload"`
	ImageCount   int      `json:"imageCount"`
	SampleImages []string `json:"sampleImages"`
	SourceType   string   `json:"sourceType"`
	PrepareMode  string   `json:"prepareMode"`
	Valid        bool     `json:"valid"`
	Message      string   `json:"message"`
}

func (a *App) Ping() string { return "pong" }

func NewApp() *App {
	return &App{
		run:            flasher.NewRunner(),
		selectedVendor: "",
	}
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.locateToolsDir()
	if a.run != nil {
		a.run.SetToolPaths(a.GetToolPath("adb"), a.GetToolPath("fastboot"))
	}
	wailsRuntime.EventsEmit(a.ctx, "show_brand_selector", true)
	go a.deviceWatcher()
	a.CheckLicenseOnInit()
}

func (a *App) startFlashReport(romPath, vendor string, wipe bool, skipFirmware bool, force bool) {
	arbMode := "normal"
	if skipFirmware {
		arbMode = "keep_fw_old"
	} else if force {
		arbMode = "full_force"
	}
	report := &FlashReport{
		SessionID: time.Now().Format("20060102_150405"),
		StartedAt: time.Now().Format(time.RFC3339),
		Vendor:    vendor,
		ROM:       filepath.Base(romPath),
		Wipe:      wipe,
		ARBMode:   arbMode,
		Result:    "running",
	}
	a.reportMu.Lock()
	a.flashReport = report
	a.reportMu.Unlock()
	wailsRuntime.EventsEmit(a.ctx, "flash_report_update", report)
}

func (a *App) finishFlashReport(result string) {
	a.reportMu.Lock()
	if a.flashReport != nil {
		// Don't overwrite if already finalized (e.g., "cancelled" should not be overwritten by "failed")
		if a.flashReport.Result != "running" {
			a.reportMu.Unlock()
			return
		}
		a.flashReport.Result = result
		a.flashReport.EndedAt = time.Now().Format(time.RFC3339)
	}
	report := a.flashReport
	a.reportMu.Unlock()
	if report != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_report_update", report)
		// Auto-save report to file
		a.saveFlashReportToFile(report)
	}
}

func (a *App) addFlashReportLog(line string) {
	a.reportMu.Lock()
	if a.flashReport != nil {
		a.flashReport.Logs = append(a.flashReport.Logs, line)
	}
	a.reportMu.Unlock()
}

func (a *App) markFlashPartition(partition string) {
	a.reportMu.Lock()
	if a.flashReport != nil {
		a.flashReport.FlashedPartitions = append(a.flashReport.FlashedPartitions, partition)
	}
	a.reportMu.Unlock()
	wailsRuntime.EventsEmit(a.ctx, "flash_stage_event", map[string]string{"type": "flashed", "partition": partition})
}

func (a *App) markSkippedARBPartition(partition string) {
	a.reportMu.Lock()
	if a.flashReport != nil {
		a.flashReport.SkippedARBPartitions = append(a.flashReport.SkippedARBPartitions, partition)
	}
	a.reportMu.Unlock()
	wailsRuntime.EventsEmit(a.ctx, "flash_stage_event", map[string]string{"type": "skipped_arb", "partition": partition})
}

func (a *App) markFlashFailure(message string) {
	a.reportMu.Lock()
	if a.flashReport != nil {
		a.flashReport.Failures = append(a.flashReport.Failures, message)
	}
	a.reportMu.Unlock()
}

func (a *App) setFlashReportDeviceName(deviceName string) {
	a.reportMu.Lock()
	if a.flashReport != nil {
		a.flashReport.DeviceName = deviceName
	}
	a.reportMu.Unlock()
}

func (a *App) saveFlashReportToFile(report *FlashReport) {
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Report] Không thể serialize report: "+err.Error())
		return
	}
	reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Report] Không thể tạo thư mục Reports: "+err.Error())
		return
	}
	filename := fmt.Sprintf("flash_report_%s.json", report.SessionID)
	path := filepath.Join(reportsDir, filename)
	if err := os.WriteFile(path, data, 0644); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Report] Không thể lưu report: "+err.Error())
		return
	}
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Report] Đã lưu Flash Report: "+path)
}

func (a *App) ExportLatestFlashReport() (string, error) {
	a.reportMu.Lock()
	if a.flashReport == nil {
		a.reportMu.Unlock()
		return "", fmt.Errorf("chưa có flash report")
	}
	data, err := json.MarshalIndent(a.flashReport, "", "  ")
	sessionID := a.flashReport.SessionID
	a.reportMu.Unlock()
	if err != nil {
		return "", err
	}
	reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		return "", err
	}
	path := filepath.Join(reportsDir, "flash_report_"+sessionID+".json")
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", err
	}
	return path, nil
}

// --- STRUCTS CHO LIBRARY ---
type LibraryItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Path      string `json:"path"`
	Size      string `json:"size"`
	Date      string `json:"date"`
	Type      string `json:"type"`
	DeviceTag string `json:"deviceTag"`
}

// --- ROM LIBRARY MANAGER HELPERS ---

func (a *App) getLibraryDir() string {
	cfg := a.loadConfig()
	if cfg.LibraryPath != "" {
		if _, err := os.Stat(cfg.LibraryPath); err == nil {
			return cfg.LibraryPath
		}
	}
	home, _ := os.UserHomeDir()
	libPath := filepath.Join(home, ".flashflow", "library")
	os.MkdirAll(libPath, 0755)
	return libPath
}

func (a *App) getRomID(zipPath string) string {
	info, err := os.Stat(zipPath)
	if err != nil {
		return "unknown_rom"
	}
	safeName := strings.ReplaceAll(info.Name(), " ", "_")
	return fmt.Sprintf("%s_%d", safeName, info.Size())
}

func (a *App) checkCachedRom(zipPath string) (string, bool) {
	libDir := a.getLibraryDir()
	romID := a.getRomID(zipPath)
	targetDir := filepath.Join(libDir, romID)
	marker := filepath.Join(targetDir, ".completed")

	if _, err := os.Stat(marker); err == nil {
		images, _ := collectAllImagesRecursive(targetDir)
		if len(images) > 0 {
			return targetDir, true
		}

		// Marker tồn tại nhưng không có .img => cache hỏng, bỏ marker để chuẩn bị lại ROM.
		_ = os.Remove(marker)
	}

	return targetDir, false
}

func (a *App) markRomAsCached(targetDir string) {
	marker := filepath.Join(targetDir, ".completed")
	os.WriteFile(marker, []byte("ok"), 0644)
}

func (a *App) GetLibraryList() []LibraryItem {
	libDir := a.getLibraryDir()
	entries, err := os.ReadDir(libDir)
	if err != nil {
		return []LibraryItem{}
	}

	var items []LibraryItem

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		fullPath := filepath.Join(libDir, entry.Name())
		var size int64
		filepath.Walk(fullPath, func(_ string, info os.FileInfo, err error) error {
			if err != nil || info == nil {
				return nil
			}
			if !info.IsDir() {
				size += info.Size()
			}
			return nil
		})

		sizeStr := fmt.Sprintf("%.1f GB", float64(size)/1024/1024/1024)
		if size < 1024*1024*1024 {
			sizeStr = fmt.Sprintf("%.0f MB", float64(size)/1024/1024)
		}

		info, err := entry.Info()
		if err != nil || info == nil {
			continue
		}
		dateStr := info.ModTime().Format("02/01/2006")

		romType := "Raw Images"
		if _, err := os.Stat(filepath.Join(fullPath, "payload.bin")); err == nil {
			romType = "Payload Extracted"
		}

		// --- LOGIC NHẬN DIỆN MỚI ---
		deviceTag := "Unknown"

		// Ưu tiên 1: Kiểm tra xem có file .tag do người dùng set không
		tagPath := filepath.Join(fullPath, ".tag")
		if tagBytes, err := os.ReadFile(tagPath); err == nil {
			deviceTag = string(tagBytes) // Lấy tag từ file (ví dụ: "OnePlus")
		} else {
			// Ưu tiên 2: Nếu không có file .tag thì đoán theo tên folder (Logic cũ)
			lowerName := strings.ToLower(entry.Name())
			if strings.Contains(lowerName, "pixel") {
				deviceTag = "Pixel"
			} else if strings.Contains(lowerName, "oneplus") || strings.Contains(lowerName, "oxygen") || strings.Contains(lowerName, "coloros") {
				deviceTag = "OnePlus"
			} else if strings.Contains(lowerName, "xiaomi") || strings.Contains(lowerName, "miui") || strings.Contains(lowerName, "hyperos") {
				deviceTag = "Xiaomi"
			}
		}
		items = append(items, LibraryItem{
			ID:        entry.Name(),
			Name:      entry.Name(),
			Path:      fullPath,
			Size:      sizeStr,
			Date:      dateStr,
			Type:      romType,
			DeviceTag: deviceTag,
		})
	}
	return items
}

func (a *App) OpenLibraryFolder(path string) {
	var cmd *exec.Cmd
	if runtime.GOOS == "darwin" {
		cmd = exec.Command("open", path)
	} else if runtime.GOOS == "windows" {
		cmd = exec.Command("explorer", path)
	} else {
		cmd = exec.Command("xdg-open", path)
	}
	cmd.Start()
}

// --- BRAND SELECTION ---
func (a *App) SetDeviceBrand(brand string) {
	brand = strings.ToLower(strings.TrimSpace(brand))
	if brand != "oneplus" {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> %s đang ở trạng thái Coming Soon. Hiện chỉ hỗ trợ OnePlus.", brand))
		wailsRuntime.EventsEmit(a.ctx, "toast_notify", "warning", "Hiện FlashFlow chỉ hỗ trợ OnePlus")
		return
	}
	a.selectedVendor = brand
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> Đã chọn dòng máy: %s", brand))
	info := a.CheckDevice()
	wailsRuntime.EventsEmit(a.ctx, "device_changed", info)
	wailsRuntime.EventsEmit(a.ctx, "device_update", info)
}

// --- HỆ THỐNG (DEBLOAT) ---

type AppPackage struct {
	ID   string `json:"id"`
	Path string `json:"path"`
	Type string `json:"type"`
}

func (a *App) GetInstalledApps() ([]AppPackage, error) {
	adbPath := a.GetToolPath("adb")
	var apps []AppPackage

	scanApps := func(flag string, typeLabel string) error {
		out, err := a.RunCommandReturnOutput("", adbPath, "shell", "pm", "list", "packages", flag)
		if err != nil {
			return err
		}
		lines := strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" || !strings.HasPrefix(line, "package:") {
				continue
			}
			id := strings.TrimPrefix(line, "package:")
			id = strings.TrimSpace(id)
			apps = append(apps, AppPackage{ID: id, Path: "", Type: typeLabel})
		}
		return nil
	}

	if err := scanApps("-3", "user"); err != nil {
		return nil, fmt.Errorf("Lỗi đọc User Apps: %v", err)
	}
	if err := scanApps("-s", "system"); err != nil {
		return nil, fmt.Errorf("Lỗi đọc System Apps: %v", err)
	}
	return apps, nil
}

// runDebloatADBCommand chỉ phục vụ cụm Debloat.
// Tách riêng để debloat có timeout/output rõ ràng mà không ảnh hưởng luồng flash ROM.
func (a *App) runDebloatADBCommand(args ...string) string {
	adbPath := a.GetToolPath("adb")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	fullArgs := append([]string{}, args...)
	cmd := exec.CommandContext(ctx, adbPath, fullArgs...)
	configureCmd(cmd)

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [Debloat] "+adbPath+" "+strings.Join(fullArgs, " "))
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))

	if ctx.Err() == context.DeadlineExceeded {
		return "Error: adb command timeout sau 20s. Kiểm tra USB Debugging / authorize trên điện thoại. Output: " + output
	}
	if err != nil {
		if output != "" {
			return "Error: " + output
		}
		return "Error: " + err.Error()
	}
	if output == "" {
		return "OK"
	}
	return output
}

// Debloat app không root: gỡ khỏi user hiện tại bằng pm uninstall -k --user 0 <package>.
func (a *App) UninstallPackage(packageName string) string {
	packageName = strings.TrimSpace(packageName)
	if packageName == "" {
		return "Error: package name trống"
	}

	return a.runDebloatADBCommand("shell", "pm", "uninstall", "-k", "--user", "0", packageName)
}

func (a *App) RestorePackage(packageName string) string {
	packageName = strings.TrimSpace(packageName)
	if packageName == "" {
		return "Error: package name trống"
	}

	return a.runDebloatADBCommand("shell", "cmd", "package", "install-existing", packageName)
}

func (a *App) NotifyUI(typeMsg string, message string) {
	wailsRuntime.EventsEmit(a.ctx, "toast_notify", typeMsg, message)
}

func (a *App) UpdateProgress(p int, s string) {
	wailsRuntime.EventsEmit(a.ctx, "flash_progress", p)
	wailsRuntime.EventsEmit(a.ctx, "flash_step", s)
}

func (a *App) waitForFastboot() error {
	ctx := a.activeFlashContext()
	interval := 300 * time.Millisecond
	requiredStableReads := 3
	if runtime.GOOS == "windows" {
		interval = 800 * time.Millisecond
		requiredStableReads = 2
	}

	timeout := time.After(45 * time.Second)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	successCount := 0
	for {
		select {
		case <-ctx.Done():
			return fmt.Errorf("đã hủy chờ fastboot")
		case <-timeout:
			return fmt.Errorf("hết thời gian chờ fastboot")
		case <-ticker.C:
			fbs, _ := a.run.ListFastbootDevices()
			if len(fbs) > 0 {
				successCount++
				if successCount >= requiredStableReads {
					return nil
				}
			} else {
				successCount = 0
			}
		}
	}
}

// ModeReconnectTimeout is the maximum time to wait for a device to reconnect
// after a mode switch (bootloader ↔ fastbootd).
const ModeReconnectTimeout = 40 * time.Second

// ModeStabilityDelay is the minimum time to wait after detecting device reconnection
// before sending the next flash command. This ensures the device's fastboot service
// is fully ready to accept commands.
const ModeStabilityDelay = 4 * time.Second

func (a *App) waitForSpecificMode(targetMode string, expectedSerial ...string) error {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf("... Đang đợi thiết bị vào chế độ %s (timeout %v)...", targetMode, ModeReconnectTimeout))
	time.Sleep(2 * time.Second) // Initial grace period for device to start rebooting
	wantedSerial := ""
	if len(expectedSerial) > 0 {
		wantedSerial = strings.TrimSpace(expectedSerial[0])
	}

	timeout := time.After(ModeReconnectTimeout)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	stableModeReads := 0
	const requiredStableModeReads = 2

	for {
		select {
		case <-timeout:
			wailsRuntime.EventsEmit(a.ctx, "device_mode_switch_done", map[string]interface{}{"success": false, "target": targetMode})
			return fmt.Errorf("timeout: thiết bị không kết nối lại trong %v khi chờ chế độ %s", ModeReconnectTimeout, targetMode)
		case <-ticker.C:
			fbs, _ := a.run.ListFastbootDevices()
			confirmedThisTick := false
			for _, d := range fbs {
				if wantedSerial != "" && d.Serial != wantedSerial {
					continue
				}
				isUserspace := a.getFastbootVar(d.Serial, "is-userspace")
				isUserspace = strings.TrimSpace(isUserspace)

				modeConfirmed := false
				if targetMode == "fastbootd" && isUserspace == "yes" {
					modeConfirmed = true
				}
				if targetMode == "bootloader" && (isUserspace == "no" || isUserspace == "" || isUserspace == "--") {
					modeConfirmed = true
				}

				if modeConfirmed {
					confirmedThisTick = true
					stableModeReads++
					if stableModeReads < requiredStableModeReads {
						continue
					}
					wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> Thiết bị đã vào %s. Chờ ổn định %v trước khi tiếp tục...", targetMode, ModeStabilityDelay))
					time.Sleep(ModeStabilityDelay)
					wailsRuntime.EventsEmit(a.ctx, "device_mode_switch_done", map[string]interface{}{"success": true, "target": targetMode})
					return nil
				}
			}
			if !confirmedThisTick {
				stableModeReads = 0
			}
		}
	}
}

func (a *App) runOnePlusWipeFallback(contextLabel string, serial ...string) error {
	fastbootBin := a.GetToolPath("fastboot")
	attempts := [][]string{
		{"-w"},
		{"erase", "userdata"},
		{"format", "userdata"},
	}

	var lastErr error
	for idx, args := range attempts {
		if len(serial) > 0 && strings.TrimSpace(serial[0]) != "" {
			args = onePlusFastbootArgs(serial[0], args...)
		}
		cmdLabel := "fastboot " + strings.Join(args, " ")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> %s wipe attempt %d/%d: %s", contextLabel, idx+1, len(attempts), cmdLabel))
		if err := a.RunCommandStreaming("", fastbootBin, args...); err != nil {
			lastErr = err
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf("!!! %s thất bại: %v", cmdLabel, err))
			continue
		}
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Wipe data thành công bằng: "+cmdLabel)
		return nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("không có lệnh wipe nào được thực thi")
	}
	return fmt.Errorf("wipe data thất bại sau fallback: %w", lastErr)
}

func (a *App) AnalyzeRomSource(path string) RomSourceAnalysis {
	res := RomSourceAnalysis{Path: path, Name: filepath.Base(path)}
	info, err := os.Stat(path)
	if err != nil {
		res.Message = "Không tìm thấy ROM source"
		return res
	}
	res.Exists = true
	res.IsDir = info.IsDir()
	res.IsZip = !info.IsDir() && strings.EqualFold(filepath.Ext(path), ".zip")

	addImage := func(name string) {
		res.ImageCount++
		if len(res.SampleImages) < 6 {
			res.SampleImages = append(res.SampleImages, filepath.Base(name))
		}
	}

	if res.IsDir {
		_ = filepath.WalkDir(path, func(p string, d os.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			base := strings.ToLower(filepath.Base(p))
			if base == "payload.bin" {
				res.HasPayload = true
			}
			if strings.HasSuffix(base, ".img") {
				addImage(p)
			}
			return nil
		})
	} else if res.IsZip {
		r, err := zip.OpenReader(path)
		if err != nil {
			res.Message = "Không đọc được file ZIP"
			return res
		}
		defer r.Close()
		for _, f := range r.File {
			base := strings.ToLower(filepath.Base(f.Name))
			if base == "payload.bin" {
				res.HasPayload = true
			}
			if strings.HasSuffix(base, ".img") {
				addImage(f.Name)
			}
		}
	}

	switch {
	case res.IsDir && res.ImageCount > 0:
		res.SourceType = "folder_images"
		res.PrepareMode = "use_unpacked_images"
		res.Valid = true
		res.Message = "Thư mục ROM đã unpack, dùng image trực tiếp"
	case res.IsDir && res.HasPayload:
		res.SourceType = "folder_payload"
		res.PrepareMode = "dump_payload_during_flash"
		res.Valid = true
		res.Message = "Thư mục Full OTA, sẽ dump payload.bin khi flash"
	case res.IsZip && res.HasPayload:
		res.SourceType = "zip_payload"
		res.PrepareMode = "extract_payload_then_dump"
		res.Valid = true
		res.Message = "Full OTA ZIP, sẽ extract payload.bin rồi dump"
	case res.IsZip && res.ImageCount > 0:
		res.SourceType = "zip_images"
		res.PrepareMode = "extract_images"
		res.Valid = true
		res.Message = "ZIP chứa image rời"
	default:
		res.SourceType = "invalid"
		res.PrepareMode = "unsupported"
		res.Message = "Source không có payload.bin hoặc .img hợp lệ"
	}
	return res
}

func (a *App) WipeDataSafe() error {
	d := a.CheckDevice()
	if !d.Connected {
		return fmt.Errorf("chưa kết nối thiết bị")
	}
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Bắt đầu quy trình Wipe Data (Safe Mode)...")

	if d.State == "fastbootd" || (d.State != "bootloader" && d.State != "fastboot") {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đang chuyển về Bootloader để Wipe sạch nhất...")

		if d.State == "device" {
			_ = a.RunCommandWithDir("", a.GetToolPath("adb"), "reboot", "bootloader")
		} else {
			_ = a.RunCommandWithDir("", a.GetToolPath("fastboot"), "reboot", "bootloader")
		}

		if err := a.waitForFastboot(); err != nil {
			return err
		}
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "... Đợi ổn định kết nối (3s)...")
		time.Sleep(3 * time.Second)
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đang Wipe tại Bootloader...")
	if err := a.runOnePlusWipeFallback("Post-flash"); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Lỗi Wipe: "+err.Error())
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! GỢI Ý: Hãy thử chọn 'Format Data' thủ công trên màn hình điện thoại.")
		return err
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Xóa dữ liệu hoàn tất! (Clean)")
	return nil
}

func (a *App) deviceWatcher() {
	interval := 900 * time.Millisecond
	if runtime.GOOS == "windows" {
		interval = 1500 * time.Millisecond
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
		}

		if a.isFlashActive() || a.isCmdInFlight() || a.isWatcherPaused() {
			continue
		}

		info := a.CheckDevice()
		// CheckDevice already performs the ADB/fastboot discovery. Do not run
		// another pair of discovery commands during reboot grace. Also avoid
		// sending identical events every tick; the dashboard only needs an event
		// when a render-relevant field changes (including battery/slot/state).
		a.publishWatcherInfo(info)
	}
}

// publishWatcherInfo updates the cached device and emits watcher events only
// when the externally visible device state changed. This keeps the 900ms
// reconnect polling responsive without forcing React to re-render constantly.
func (a *App) publishWatcherInfo(info DeviceInfo) {
	a.lastMu.Lock()
	previous := a.last
	changed := previous == nil || deviceInfoFingerprint(*previous) != deviceInfoFingerprint(info)
	wasConnected := previous != nil && previous.Connected
	if changed {
		copy := info
		a.last = &copy
	}
	a.lastMu.Unlock()
	if !changed {
		return
	}
	if !info.Connected && wasConnected {
		wailsRuntime.EventsEmit(a.ctx, "device_disconnected", true)
	}
	wailsRuntime.EventsEmit(a.ctx, "device_changed", info)
	wailsRuntime.EventsEmit(a.ctx, "device_update", info)
}

func deviceInfoFingerprint(info DeviceInfo) string {
	return fmt.Sprintf("%t|%s|%s|%s|%s|%s|%s|%s|%s|%s|%t%t%t%t%t",
		info.Connected, info.Serial, info.State, info.Model, info.OS, info.Build,
		info.Battery, info.Slot, info.Vendor, info.Bootloader,
		info.Actions.RebootSystem, info.Actions.RebootBootloader, info.Actions.RebootRecovery,
		info.Actions.RebootFastbootD, info.Actions.LockBootloader)
}

func (a *App) locateToolsDir() {
	exePath, err := os.Executable()
	if err != nil {
		exePath, _ = os.Getwd()
	}
	exeDir := filepath.Dir(exePath)
	if runtime.GOOS == "darwin" && strings.Contains(exePath, "Contents/MacOS") {
		resourceDir := filepath.Join(exeDir, "..", "Resources")
		if _, err := os.Stat(filepath.Join(resourceDir, "adb")); err == nil {
			a.toolsDir = resourceDir
			oldPath := os.Getenv("PATH")
			_ = os.Setenv("PATH", a.toolsDir+string(os.PathListSeparator)+oldPath)
			if a.run != nil {
				a.run.SetToolPaths(a.GetToolPath("adb"), a.GetToolPath("fastboot"))
			}
			println("Mac Bundle detected. Tools dir set to:", a.toolsDir)
			return
		}
	}
	var osFolder string
	if runtime.GOOS == "windows" {
		osFolder = "win"
	} else if runtime.GOOS == "darwin" {
		if runtime.GOARCH == "arm64" {
			osFolder = "mac_silicon"
		} else {
			osFolder = "mac_intel"
		}
	} else {
		osFolder = "linux"
	}
	possiblePaths := []string{
		filepath.Join(exeDir, "tools", osFolder),
		filepath.Join(exeDir, "..", "..", "tools", osFolder),
	}
	wd, _ := os.Getwd()
	possiblePaths = append(possiblePaths, filepath.Join(wd, "tools", osFolder))
	for _, path := range possiblePaths {
		if _, err := os.Stat(path); err == nil {
			a.toolsDir = path
			break
		}
	}
	if a.toolsDir != "" {
		old := os.Getenv("PATH")
		if old == "" {
			_ = os.Setenv("PATH", a.toolsDir)
		} else {
			_ = os.Setenv("PATH", a.toolsDir+string(os.PathListSeparator)+old)
		}
	}
	if a.run != nil {
		a.run.SetToolPaths(a.GetToolPath("adb"), a.GetToolPath("fastboot"))
	}
}

func (a *App) GetToolPath(name string) string {
	if filepath.IsAbs(name) {
		return name
	}
	if runtime.GOOS == "windows" && !strings.HasSuffix(name, ".exe") {
		name += ".exe"
	}
	if a.toolsDir != "" {
		if runtime.GOOS == "darwin" && runtime.GOARCH != "arm64" && name == "payload-dumper-go" {
			intelPayload := filepath.Join(a.toolsDir, "mac_intel", name)
			if _, err := os.Stat(intelPayload); err == nil {
				return intelPayload
			}
		}
		return filepath.Join(a.toolsDir, name)
	}
	return name
}

func (a *App) runCmdStreaming(ctx context.Context, cmd *exec.Cmd) error {
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return err
	}
	scanPipe := func(r io.Reader, prefix string) {
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			line := sc.Text()
			if prefix != "" {
				line = prefix + line
			}
			wailsRuntime.EventsEmit(a.ctx, "flash_log", line)
		}
	}
	go scanPipe(stdout, "")
	go scanPipe(stderr, "[err] ")
	return cmd.Wait()
}

func (a *App) isCmdInFlight() bool {
	a.cmdMu.Lock()
	defer a.cmdMu.Unlock()
	return a.cmdInFlight
}

func (a *App) beginCmd() bool {
	a.cmdMu.Lock()
	defer a.cmdMu.Unlock()
	if a.cmdInFlight {
		return false
	}
	a.cmdInFlight = true
	return true
}

func (a *App) endCmd() {
	a.cmdMu.Lock()
	a.cmdInFlight = false
	a.cmdMu.Unlock()
	info := a.CheckDevice()
	a.lastMu.Lock()
	a.last = &info
	a.lastMu.Unlock()
	wailsRuntime.EventsEmit(a.ctx, "device_changed", info)
	wailsRuntime.EventsEmit(a.ctx, "device_update", info)
}

func (a *App) withCmd(fn func() error) {
	if !a.beginCmd() {
		return
	}
	defer a.endCmd()
	_ = fn()
}

func (a *App) withCmdAsync(fn func() error) {
	if !a.beginCmd() {
		return
	}
	go func() {
		defer a.endCmd()
		_ = fn()
	}()
}

func (a *App) withInteractiveFastboot(fn func() error) {
	go func() {
		_ = fn()
	}()
}

func (a *App) RunCommandWithDirUnlocked(dir string, name string, args ...string) error {
	realPath := a.GetToolPath(name)
	if !a.isFlashActive() && isRebootCommand(name, args) {
		a.markRebooting("Thiết bị đang khởi động lại...")
	}
	if strings.Contains(strings.ToLower(name), "fastboot") {
		for _, arg := range args {
			if strings.ToLower(arg) == "bootloader" {
				a.setRebootGrace(40 * time.Second)
				break
			}
		}
	}
	// Use a 60s timeout context so CancelFlash() does NOT kill the running command.
	cmdCtx, cmdCancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cmdCancel()

	cmd := exec.CommandContext(cmdCtx, realPath, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()
	outputStr := string(out)
	if len(outputStr) > 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", outputStr)
	}
	if err != nil {
		if cmdCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("lệnh timeout (60s): %s %s", filepath.Base(realPath), strings.Join(args, " "))
		}
		if len(outputStr) == 0 {
			return fmt.Errorf("lệnh thất bại: %v", err)
		}
		return fmt.Errorf("%s", outputStr)
	}
	return nil
}

func (a *App) setRebootGrace(d time.Duration) {
	a.rebootMu.Lock()
	a.rebootUntil = time.Now().Add(d)
	a.rebootMu.Unlock()
}

func (a *App) rebootGraceActive() bool {
	a.rebootMu.Lock()
	until := a.rebootUntil
	a.rebootMu.Unlock()
	return !until.IsZero() && time.Now().Before(until)
}

func (a *App) clearRebootGrace() {
	a.rebootMu.Lock()
	a.rebootUntil = time.Time{}
	a.rebootMu.Unlock()
}

func isRebootCommand(tool string, args []string) bool {
	t := strings.ToLower(strings.TrimSpace(tool))
	if strings.Contains(t, "adb") || strings.Contains(t, "fastboot") {
		for i := 0; i < len(args); i++ {
			if strings.ToLower(args[i]) == "reboot" {
				return true
			}
		}
	}
	return false
}

func isHeavyFastbootCommand(args []string) bool {
	for _, arg := range args {
		a := strings.ToLower(strings.TrimSpace(arg))
		switch a {
		case "flash", "wipe-super", "-w", "erase":
			return true
		}
	}
	return false
}

func (a *App) markRebooting(reason string) {
	a.setRebootGrace(35 * time.Second)
	currentSerial := ""
	a.lastMu.Lock()
	if a.last != nil {
		currentSerial = a.last.Serial
	}
	a.lastMu.Unlock()
	if currentSerial == "" {
		currentSerial = "--"
	}
	info := DeviceInfo{
		Device:     flasher.Device{State: "reconnecting", Model: "Đang kết nối lại...", Serial: currentSerial},
		Connected:  false,
		Vendor:     "unknown",
		Bootloader: "--",
		Actions:    QuickActions{},
	}
	if strings.TrimSpace(reason) != "" {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> "+reason)
	}
	wailsRuntime.EventsEmit(a.ctx, "device_changed", info)
	wailsRuntime.EventsEmit(a.ctx, "device_update", info)
}

func detectVendorFromHints(hints ...string) string {
	joined := strings.ToLower(strings.Join(hints, " "))
	switch {
	case strings.Contains(joined, "google") || strings.Contains(joined, "pixel"):
		return "pixel"
	case strings.Contains(joined, "oneplus") || strings.Contains(joined, "oplus") || strings.HasPrefix(joined, "op"):
		return "oneplus"
	case strings.Contains(joined, "xiaomi") || strings.Contains(joined, "redmi") || strings.Contains(joined, "poco"):
		return "xiaomi"
	default:
		return "unknown"
	}
}

func normalizeSlotSuffix(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "--" {
		return "--"
	}
	if strings.HasPrefix(s, "_") && len(s) >= 2 {
		s = s[1:]
	}
	if s == "a" || s == "b" {
		return s
	}
	return "--"
}

func (a *App) CheckDevice() DeviceInfo {
	if a.isFlashActive() {
		return DeviceInfo{
			Device:     flasher.Device{State: "busy", Model: "Đang nạp ROM..."},
			Connected:  true,
			Vendor:     "unknown",
			Bootloader: "--",
		}
	}
	grace := a.rebootGraceActive()
	adbs, _ := a.run.ListADBDevices()
	if len(adbs) > 0 {
		if grace {
			a.clearRebootGrace()
		}
		d := adbs[0]
		if d.Model == "" {
			d.Model = "Android Device"
		}

		// Try batch getprop first (single subprocess), fall back to individual calls
		var manufacturer, brand, deviceProp string
		if props, err := a.getAdbPropsAll(d.Serial); err == nil {
			manufacturer = props["ro.product.manufacturer"]
			brand = props["ro.product.brand"]
			deviceProp = props["ro.product.device"]
			d.OS = props["ro.build.version.release"]
			d.Build = props["ro.build.display.id"]
			if d.Build == "" {
				d.Build = props["ro.build.id"]
			}
			d.Slot = normalizeSlotSuffix(props["ro.boot.slot_suffix"])
		} else {
			// Fallback: individual getAdbProp calls
			manufacturer = a.getAdbProp(d.Serial, "ro.product.manufacturer")
			brand = a.getAdbProp(d.Serial, "ro.product.brand")
			deviceProp = a.getAdbProp(d.Serial, "ro.product.device")
			d.OS = a.getAdbProp(d.Serial, "ro.build.version.release")
			d.Build = a.getAdbProp(d.Serial, "ro.build.display.id")
			if d.Build == "" || d.Build == "--" {
				d.Build = a.getAdbProp(d.Serial, "ro.build.id")
			}
			d.Slot = normalizeSlotSuffix(a.getAdbProp(d.Serial, "ro.boot.slot_suffix"))
		}
		d.Battery = a.getAdbBattery(d.Serial)
		bootloaderStatus := "--"
		var vendor string
		if a.selectedVendor != "" {
			vendor = a.selectedVendor
		} else {
			vendor = detectVendorFromHints(manufacturer, brand, deviceProp, d.Model)
		}
		actions := QuickActions{RebootBootloader: true, RebootRecovery: true, RebootSystem: true}
		return DeviceInfo{
			Device:     d,
			Connected:  true,
			Vendor:     vendor,
			Bootloader: bootloaderStatus,
			Actions:    actions,
		}
	}
	fbs, _ := a.run.ListFastbootDevices()
	if len(fbs) > 0 {
		if grace {
			a.clearRebootGrace()
		}
		d := fbs[0]
		if strings.TrimSpace(d.Model) == "" {
			d.Model = "Fastboot Device"
		}
		product := a.getFastbootVar(d.Serial, "product")
		slot := a.getFastbootVar(d.Serial, "current-slot")
		isUserspace := a.getFastbootVar(d.Serial, "is-userspace")
		bootloaderStatus := "unknown"
		unlocked := a.getFastbootVar(d.Serial, "unlocked")
		if unlocked == "" || unlocked == "--" {
			devState := a.getFastbootVar(d.Serial, "device-state")
			if strings.Contains(strings.ToLower(devState), "unlock") {
				bootloaderStatus = "unlocked"
			} else if strings.Contains(strings.ToLower(devState), "lock") {
				bootloaderStatus = "locked"
			}
		} else {
			if strings.ToLower(unlocked) == "yes" {
				bootloaderStatus = "unlocked"
			} else {
				bootloaderStatus = "locked"
			}
		}
		d.Build = a.getFastbootVar(d.Serial, "version-bootloader")
		d.Slot = normalizeSlotSuffix(slot)
		if product != "--" && product != "" {
			d.Model = d.Model + " (" + product + ")"
		}
		var vendor string
		if a.selectedVendor != "" {
			vendor = a.selectedVendor
		} else {
			vendor = detectVendorFromHints(product, d.Model)
		}
		actions := QuickActions{
			RebootSystem: true, RebootBootloader: false, RebootFastbootD: true, LockBootloader: true,
		}
		if strings.TrimSpace(isUserspace) == "yes" {
			d.State = "fastbootd"
			actions.RebootFastbootD = false
			actions.RebootBootloader = true
		} else {
			d.State = "bootloader"
			actions.RebootFastbootD = true
		}
		return DeviceInfo{
			Device:     d,
			Connected:  true,
			Vendor:     vendor,
			Bootloader: bootloaderStatus,
			Actions:    actions,
		}
	}
	if grace {
		return DeviceInfo{
			Device:     flasher.Device{State: "reconnecting", Model: "Đang kết nối lại..."},
			Connected:  false,
			Vendor:     "unknown",
			Bootloader: "--",
		}
	}
	return DeviceInfo{
		Device:     flasher.Device{State: "disconnected", Model: "Chưa kết nối"},
		Connected:  false,
		Vendor:     "unknown",
		Bootloader: "--",
	}
}

func (a *App) SelectRomFile() string {
	path, _ := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Chọn File ROM (.zip)",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Zip Files", Pattern: "*.zip"},
			{DisplayName: "All Files", Pattern: "*.*"},
		},
	})
	return path
}

func (a *App) SelectRomFolder() string {
	path, _ := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Chọn thư mục ROM đã giải nén",
	})
	return path
}

func (a *App) SelectImageFiles() []string {
	paths, err := wailsRuntime.OpenMultipleFilesDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Chọn File Partition (.img) - Giữ Ctrl/Cmd để chọn nhiều",
		Filters: []wailsRuntime.FileFilter{
			{DisplayName: "Image Files (*.img)", Pattern: "*.img"},
		},
	})
	if err != nil {
		return []string{}
	}
	return paths
}

func (a *App) VerifyRomFile(path string) bool {
	if path == "" {
		return false
	}
	_, err := os.Stat(path)
	return err == nil
}

func (a *App) OpenBrowserToDownload() {
	wailsRuntime.BrowserOpenURL(a.ctx, "https://developer.android.com/studio/releases/platform-tools")
}

func (a *App) preflightOnePlusFlash(romPath string, vendor string) error {
	if strings.ToLower(strings.TrimSpace(vendor)) != "oneplus" {
		return fmt.Errorf("Phase 1 chỉ cho phép OnePlus")
	}
	if strings.TrimSpace(romPath) == "" {
		return fmt.Errorf("chưa chọn ROM")
	}
	if _, err := os.Stat(romPath); err != nil {
		return fmt.Errorf("không tìm thấy ROM: %v", err)
	}
	for _, tool := range []string{"fastboot", "adb"} {
		toolPath := a.GetToolPath(tool)
		if _, err := os.Stat(toolPath); err != nil {
			return fmt.Errorf("không tìm thấy tool %s: %s", tool, toolPath)
		}
	}
	adbs, _ := a.run.ListADBDevices()
	fbs, _ := a.run.ListFastbootDevices()
	if len(adbs)+len(fbs) == 0 {
		return fmt.Errorf("không tìm thấy thiết bị ADB/Fastboot")
	}
	if len(adbs)+len(fbs) > 1 {
		return fmt.Errorf("phát hiện nhiều thiết bị. Chỉ cắm 1 máy khi nạp ROM")
	}
	if len(adbs) == 1 {
		battery := a.getAdbBattery(adbs[0].Serial)
		if battery != "" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Battery: "+battery)
		}
	}
	return nil
}

// Start flash ROM thật từ wizard.
func (a *App) StartFlashReal(romPath string, shouldWipe bool, vendorOverride string, skipFirmware bool, forceIgnoreArb bool) {
	if !a.IsLicenseValid() {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! HẾT HẠN DÙNG THỬ 7 NGÀY !!!")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Vui lòng vào Store nâng cấp gói với siêu ưu đãi.")
		wailsRuntime.EventsEmit(a.ctx, "toast_notify", "error", "Hết hạn dùng thử. Vui lòng nâng cấp!")
		return
	}

	// Record license status at session start for graceful expiry detection.
	licenseAtStart := getLicenseStatus()

	vendor := vendorOverride
	if vendor == "" {
		vendor = a.selectedVendor
	}
	if err := a.preflightOnePlusFlash(romPath, vendor); err != nil {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! PREFLIGHT: "+err.Error())
		wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
		return
	}
	a.startFlashReport(romPath, vendor, shouldWipe, skipFirmware, forceIgnoreArb)
	a.flashMutex.Lock()
	if a.isFlashing {
		a.flashMutex.Unlock()
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: Hệ thống đang bận.")
		wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
		return
	}

	a.isFlashing = true
	a.flashCtx, a.flashCancel = context.WithCancel(a.ctx)
	a.flashMutex.Unlock()

	// Pause device watcher to avoid USB conflicts during flash.
	a.PauseDeviceWatcher()

	// Chạy flash trong goroutine để UI không bị block.
	go func(path string, wipe bool, vendorOverride string, skipFW bool, force bool) {
		defer func() {
			if r := recover(); r != nil {
				msg := fmt.Sprintf("panic: %v", r)
				wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! FATAL: "+msg)
				a.markFlashFailure(msg)
				a.finishFlashReport("failed")
				wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			}
			a.flashMutex.Lock()
			a.isFlashing = false
			if a.flashCancel != nil {
				a.flashCancel()
				a.flashCancel = nil
			}
			a.flashCtx = nil
			a.flashMutex.Unlock()
			// Resume device watcher after flash completes (success or failure).
			a.ResumeDeviceWatcher()

			// Graceful license expiry: if license was valid at start but expired during flash,
			// notify the frontend. The next flash attempt will be blocked by IsLicenseValid().
			a.checkLicenseExpiredAfterFlash(licenseAtStart)
		}()

		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Preparing device connection...")

		// Nếu máy đang ở Android system thì đưa về Bootloader trước khi flash.
		a.resetOnePlusPlatform()
		adbs, _ := a.run.ListADBDevices()
		if len(adbs) > 0 {
			a.captureOnePlusPlatformFromADB(adbs[0].Serial)
			platform := a.currentOnePlusPlatform()
			if platform.Family == onePlusPlatformMediaTek {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> Detected MediaTek/Dimensity via ADB (%s / %s). Safe Mode will preserve early MTK firmware.", platform.SoC, platform.Board))
			}
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Device detected via ADB. Rebooting to Bootloader...")
			_, err := a.RunCommandReturnOutput("", a.GetToolPath("adb"), "-s", adbs[0].Serial, "reboot", "bootloader")
			if err != nil {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! CẢNH BÁO: Không thể reboot qua ADB. Hãy kiểm tra USB Debugging / authorization.")
			}
			a.setRebootGrace(45 * time.Second)
			if runtime.GOOS == "windows" {
				time.Sleep(8 * time.Second)
			} else {
				time.Sleep(5 * time.Second)
			}
		}

		// Chờ thiết bị xuất hiện trong Fastboot.
		if err := a.waitForFastboot(); err != nil {
			msg := "Không tìm thấy thiết bị Fastboot"
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI KẾT NỐI: "+msg+".")
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! GỢI Ý: Hãy đưa máy về Bootloader thủ công nếu cần.")
			a.markFlashFailure(msg)
			a.finishFlashReport("failed")
			wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			return
		}
		// Auto Flash ROM luôn bắt đầu từ Bootloader, không bắt đầu từ FastbootD.
		fbs, _ := a.run.ListFastbootDevices()
		if len(fbs) > 0 {
			serial := fbs[0].Serial
			// Set device name in report from fastboot product variable
			product := a.getFastbootVar(serial, "product")
			if product != "" && product != "--" {
				a.setFlashReportDeviceName(product)
			} else {
				a.setFlashReportDeviceName(serial)
			}
			isUserspace := a.getFastbootVar(serial, "is-userspace")
			if strings.TrimSpace(isUserspace) == "yes" {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Device is in FastbootD. Rebooting back to Bootloader...")
				if err := a.RunCommandStreaming("", a.GetToolPath("fastboot"), "reboot", "bootloader"); err != nil {
					msg := "Không thể reboot từ FastbootD về Bootloader: " + err.Error()
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: "+msg)
					a.markFlashFailure(msg)
					a.finishFlashReport("failed")
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return
				}
				a.setRebootGrace(45 * time.Second)
				if runtime.GOOS == "windows" {
					time.Sleep(6 * time.Second)
				} else {
					time.Sleep(2 * time.Second)
				}
				if err := a.waitForFastboot(); err != nil {
					msg := "Không thể vào Bootloader"
					wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI: "+msg+".")
					a.markFlashFailure(msg)
					a.finishFlashReport("failed")
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return
				}
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Bootloader ready.")
				time.Sleep(1 * time.Second)
			}

			bootloaderStatus := strings.ToLower(strings.TrimSpace(a.getFastbootVar(serial, "unlocked")))
			deviceState := strings.ToLower(strings.TrimSpace(a.getFastbootVar(serial, "device-state")))
			if bootloaderStatus == "no" || deviceState == "locked" {
				msg := "Bootloader đang LOCKED. Không thể flash ROM/IMG cho tới khi unlock bootloader"
				wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! PREFLIGHT: "+msg)
				a.markFlashFailure(msg)
				a.finishFlashReport("failed")
				wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
				return
			}
		}

		// Dispatch flash theo vendor.
		if vendor == "" || vendor == "unknown" {
			msg := "Chưa chọn dòng máy"
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! "+msg+". Vui lòng chọn trước khi tiếp tục.")
			a.markFlashFailure(msg)
			a.finishFlashReport("failed")
			wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			return
		}
		if strings.ToLower(vendor) != "oneplus" {
			msg := "FlashFlow Phase 2 chỉ hỗ trợ flash OnePlus"
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Hiện tại FlashFlow chỉ hỗ trợ flash OnePlus. Pixel/Xiaomi đang ở trạng thái Coming Soon.")
			a.markFlashFailure(msg)
			a.finishFlashReport("failed")
			wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			return
		}
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Dòng máy đã chọn: "+vendor)
		// Lưu ý: OnePlus engine tự emit flash_complete true/false bên trong.
		if err := a.DispatchFlashByBrand(path, vendor, wipe, skipFW, force); err != nil {
			if errors.Is(err, ErrOnePlusARBDecisionRequired) {
				return
			}
			wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! LỖI NẠP: "+err.Error())
			a.markFlashFailure(err.Error())
			a.finishFlashReport("failed")
			wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
			return
		}
		a.finishFlashReport("success")

	}(romPath, shouldWipe, vendorOverride, skipFirmware, forceIgnoreArb)
}

// Dispatch flash theo vendor đã chọn.
func (a *App) DispatchFlashByBrand(romPath, vendor string, shouldWipe bool, skipFirmware bool, force bool) error {
	switch strings.ToLower(strings.TrimSpace(vendor)) {
	case "oneplus":
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Flash engine: OnePlus")
		return a.FlashOnePlusROM(romPath, shouldWipe, skipFirmware, force)
	case "pixel":
		return fmt.Errorf("Pixel đang ở trạng thái Coming Soon")
	case "xiaomi":
		return fmt.Errorf("Xiaomi đang ở trạng thái Coming Soon")
	default:
		return fmt.Errorf("không hỗ trợ dòng máy: %s", vendor)
	}
}

// CancelFlash signals the flash engine to stop after the current fastboot command
// finishes (max 60s). It does NOT kill the running command — it waits for it to
// complete naturally, then halts the flash loop.
func (a *App) CancelFlash() {
	a.flashMutex.Lock()
	cancel := a.flashCancel
	active := a.isFlashing
	a.flashMutex.Unlock()

	if !active || cancel == nil {
		return
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đang dừng... chờ lệnh hiện tại hoàn tất (tối đa 60 giây)")
	// Signal cancellation — the flash loops check flashCtx.Done() between commands.
	// The running command uses its own timeout context (not flashCtx), so it won't be killed.
	cancel()
}

type GithubRelease struct {
	TagName string `json:"tag_name"`
	HtmlUrl string `json:"html_url"`
	Body    string `json:"body"`
}

type UpdateInfo struct {
	HasUpdate  bool   `json:"hasUpdate"`
	LatestVer  string `json:"latestVer"`
	CurrentVer string `json:"currentVer"`
	Link       string `json:"link"`
	Changelog  string `json:"changelog"`
}

const CurrentVersion = "2.0.3"
const AppIdentifier = "flashflow"

func cleanReleaseVersion(tagName string) string {
	clean := strings.ToLower(strings.TrimSpace(tagName))
	clean = strings.ReplaceAll(clean, AppIdentifier, "")
	clean = strings.Trim(clean, "-_/ ")
	if strings.HasPrefix(clean, "v") {
		clean = strings.TrimPrefix(clean, "v")
	}
	return strings.Trim(clean, "-_/ ")
}

func compareVersions(a, b string) int {
	aParts := versionParts(a)
	bParts := versionParts(b)
	maxLen := len(aParts)
	if len(bParts) > maxLen {
		maxLen = len(bParts)
	}
	for i := 0; i < maxLen; i++ {
		var av, bv int
		if i < len(aParts) {
			av = aParts[i]
		}
		if i < len(bParts) {
			bv = bParts[i]
		}
		if av > bv {
			return 1
		}
		if av < bv {
			return -1
		}
	}
	return 0
}

func versionParts(version string) []int {
	parts := strings.Split(version, ".")
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		value := 0
		seenDigit := false
		for _, ch := range part {
			if ch < '0' || ch > '9' {
				break
			}
			seenDigit = true
			value = value*10 + int(ch-'0')
		}
		if seenDigit {
			out = append(out, value)
		}
	}
	return out
}

func (a *App) CheckForUpdate() UpdateInfo {
	url := "https://api.github.com/repos/cudin-etn/t-dev-studio/releases"

	client := http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return UpdateInfo{HasUpdate: false}
	}
	defer resp.Body.Close()

	var releases []GithubRelease
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil {
		return UpdateInfo{HasUpdate: false}
	}

	for _, rel := range releases {
		if !strings.Contains(strings.ToLower(rel.TagName), AppIdentifier) {
			continue
		}

		cleanVer := cleanReleaseVersion(rel.TagName)

		if compareVersions(cleanVer, CurrentVersion) > 0 {
			println("--- UPDATE FOUND ---")
			println("Github Raw:", rel.TagName)
			println("Github Clean:", cleanVer)
			println("Local:", CurrentVersion)
			finalChangelog := rel.Body
			separator := "---HISTORY---" // Từ khóa vách ngăn

			if strings.Contains(finalChangelog, separator) {
				parts := strings.Split(finalChangelog, separator)
				if len(parts) > 0 {
					finalChangelog = strings.TrimSpace(parts[0])
				}
			}
			// Nếu không tìm thấy vách ngăn, nó sẽ hiện toàn bộ (giữ nguyên logic cũ)

			return UpdateInfo{
				HasUpdate:  true,
				LatestVer:  cleanVer,
				CurrentVer: CurrentVersion,
				Link:       rel.HtmlUrl,
				Changelog:  finalChangelog, // Đã được làm sạch
			}
		}
		break
	}

	return UpdateInfo{HasUpdate: false}
}

// ==========================================================
// [NEW] QUẢN LÝ CẤU HÌNH & THƯ VIỆN (LIBRARY MANAGER)
// ==========================================================

type AppConfig struct {
	LibraryPath string `json:"library_path"`
}

func (a *App) getConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".flashflow", "config.json")
}

func (a *App) loadConfig() AppConfig {
	var config AppConfig
	data, err := os.ReadFile(a.getConfigPath())
	if err == nil {
		json.Unmarshal(data, &config)
	}
	return config
}

func (a *App) saveConfig(config AppConfig) {
	home, _ := os.UserHomeDir()
	os.MkdirAll(filepath.Join(home, ".flashflow"), 0755)

	data, _ := json.MarshalIndent(config, "", "  ")
	os.WriteFile(a.getConfigPath(), data, 0644)
}

// --- CÁC HÀM MÀ FRONTEND SẼ GỌI ---

// 1. Đổi kho chứa ROM
func (a *App) ChangeLibraryPath() string {
	selection, err := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Chọn thư mục lưu trữ ROM mới",
	})

	if err != nil || selection == "" {
		return ""
	}

	// Lưu đường dẫn mới vào Config
	cfg := a.loadConfig()
	cfg.LibraryPath = selection
	a.saveConfig(cfg)

	return "OK"
}

func (a *App) libraryChildPath(path string) (string, error) {
	libDir, err := filepath.Abs(a.getLibraryDir())
	if err != nil {
		return "", err
	}
	cleanPath, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(libDir, cleanPath)
	if err != nil {
		return "", err
	}
	if rel == "." || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		return "", fmt.Errorf("đường dẫn không thuộc Library")
	}
	return cleanPath, nil
}

func sanitizeLibraryName(name string) (string, error) {
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == ".." {
		return "", fmt.Errorf("tên thư mục không hợp lệ")
	}
	if strings.ContainsAny(name, `/\\`) || filepath.IsAbs(name) || strings.Contains(name, "..") {
		return "", fmt.Errorf("tên thư mục không được chứa ký tự đường dẫn")
	}
	return name, nil
}

// 2. Đổi tên thư mục ROM
func (a *App) RenameLibraryItem(currentPath string, newName string) error {
	currentPath, err := a.libraryChildPath(currentPath)
	if err != nil {
		return err
	}
	newName, err = sanitizeLibraryName(newName)
	if err != nil {
		return err
	}
	parentDir := filepath.Dir(currentPath)
	newPath := filepath.Join(parentDir, newName)

	if err := os.Rename(currentPath, newPath); err != nil {
		return fmt.Errorf("lỗi hệ thống: %v", err)
	}

	return nil
}

// 3. Xóa thư mục ROM
func (a *App) DeleteLibraryItem(path string) error {
	path, err := a.libraryChildPath(path)
	if err != nil {
		return err
	}
	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("lỗi hệ thống: %v", err)
	}

	return nil
}

// 4. Lưu Tag thủ công (Tạo file .tag trong thư mục ROM)
func (a *App) SetRomTag(path string, tag string) error {
	path, err := a.libraryChildPath(path)
	if err != nil {
		return err
	}
	tagFile := filepath.Join(path, ".tag")
	// Ghi file .tag chứa tên hãng (ví dụ: "OnePlus")
	err = os.WriteFile(tagFile, []byte(tag), 0644)
	if err != nil {
		return fmt.Errorf("không thể lưu tag: %v", err)
	}
	return nil
}

// SelectFile mở hộp thoại chọn file của hệ điều hành
func (a *App) SelectFile(fileType string) string {
	// Cấu hình bộ lọc file
	var filters []wailsRuntime.FileFilter
	if fileType == "img" {
		filters = []wailsRuntime.FileFilter{
			{DisplayName: "Disk Image (*.img)", Pattern: "*.img"},
			{DisplayName: "All Files", Pattern: "*.*"},
		}
	} else {
		filters = []wailsRuntime.FileFilter{
			{DisplayName: "All Files", Pattern: "*.*"},
		}
	}

	// Mở Dialog
	selection, err := wailsRuntime.OpenFileDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title:   "Chọn file để Flash",
		Filters: filters,
	})

	if err != nil {
		return ""
	}
	return selection
}

// SwitchMode dùng các hàm reboot trong app_actions.go.
func (a *App) SwitchMode(targetMode string) string {
	var err error

	// Gọi thẳng các hàm có sẵn, không viết lại logic check
	switch targetMode {
	case "Bootloader":
		err = a.RebootBootloader()
	case "FastbootD":
		err = a.RebootFastbootD()
	case "Recovery":
		err = a.RebootRecovery()
	default:
		return "UNKNOWN_MODE_REQUEST"
	}

	if err != nil {
		// Trả về lỗi để Frontend hiển thị
		return "Lỗi: " + err.Error()
	}

	return "OK"
}

// =====================================================================
// CÁC HÀM CORE CHẠY LỆNH
// =====================================================================

func (a *App) RunCommandStreaming(dir string, name string, args ...string) error {
	realPath := a.GetToolPath(name)

	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	isHeavy := isHeavyFastbootCommand(args)
	var cmdCtx context.Context
	var cmdCancel context.CancelFunc
	var cmd *exec.Cmd
	if isHeavy {
		cmd = exec.Command(realPath, args...)
	} else {
		// Keep timeout for short/read commands to avoid hanging tool.
		cmdCtx, cmdCancel = context.WithTimeout(context.Background(), 60*time.Second)
		defer cmdCancel()
		cmd = exec.CommandContext(cmdCtx, realPath, args...)
	}
	if dir != "" {
		cmd.Dir = dir
	}
	configureCmd(cmd)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	var outputMu sync.Mutex
	var outputLines []string
	const maxCapturedLines = 80
	captureLine := func(line string) {
		outputMu.Lock()
		defer outputMu.Unlock()
		outputLines = append(outputLines, line)
		if len(outputLines) > maxCapturedLines {
			outputLines = outputLines[len(outputLines)-maxCapturedLines:]
		}
	}

	scanAndEmit := func(r io.Reader, prefix string) {
		scanner := bufio.NewScanner(r)
		buf := make([]byte, 0, 64*1024)
		scanner.Buffer(buf, 1024*1024)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" {
				continue
			}
			captureLine(line)
			wailsRuntime.EventsEmit(a.ctx, "flash_log", prefix+line)
		}
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); scanAndEmit(stdout, "") }()
	go func() { defer wg.Done(); scanAndEmit(stderr, "") }()

	waitErr := cmd.Wait()
	wg.Wait()

	if !isHeavy && waitErr != nil && cmdCtx.Err() == context.DeadlineExceeded {
		return fmt.Errorf("lệnh timeout (60s): %s %s", filepath.Base(realPath), strings.Join(args, " "))
	}
	if waitErr != nil {
		outputMu.Lock()
		captured := strings.TrimSpace(strings.Join(outputLines, "\n"))
		outputMu.Unlock()
		if captured != "" {
			return fmt.Errorf("%v: %s", waitErr, captured)
		}
	}
	return waitErr
}

func (a *App) RunCommandWithDir(dir string, name string, args ...string) error {
	realPath := a.GetToolPath(name)
	if !a.isFlashActive() && isRebootCommand(name, args) {
		a.markRebooting("Thiết bị đang khởi động lại...")
	}
	if strings.Contains(strings.ToLower(name), "fastboot") {
		for _, arg := range args {
			if strings.ToLower(arg) == "bootloader" {
				a.setRebootGrace(40 * time.Second)
				break
			}
		}
	}

	// 1. Khóa tài nguyên
	flasher.ToolsLock()
	defer flasher.ToolsUnlock() // Tự động dọn dẹp

	isHeavy := isHeavyFastbootCommand(args)
	var cmdCtx context.Context
	var cmdCancel context.CancelFunc
	var cmd *exec.Cmd
	if isHeavy {
		cmd = exec.Command(realPath, args...)
	} else {
		// Keep timeout for short/read commands to avoid hanging tool.
		cmdCtx, cmdCancel = context.WithTimeout(context.Background(), 60*time.Second)
		defer cmdCancel()
		cmd = exec.CommandContext(cmdCtx, realPath, args...)
	}
	if dir != "" {
		cmd.Dir = dir
	}
	configureCmd(cmd)

	out, err := cmd.CombinedOutput()
	outputStr := string(out)

	if len(outputStr) > 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", outputStr)
	}
	if err != nil {
		if !isHeavy && cmdCtx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("lệnh timeout (60s): %s %s", filepath.Base(realPath), strings.Join(args, " "))
		}
		if len(outputStr) == 0 {
			return fmt.Errorf("lệnh thất bại: %v", err)
		}
		return fmt.Errorf("%s", outputStr)
	}
	return nil
}

// Chạy command trả output dạng blocking. Có lock để tránh tranh chấp tool khi flash/reboot.
func (a *App) RunCommandReturnOutput(dir string, name string, args ...string) (string, error) {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	realPath := a.GetToolPath(name)
	// Use a 60s timeout context so CancelFlash() does NOT kill the running command.
	cmdCtx, cmdCancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cmdCancel()

	cmd := exec.CommandContext(cmdCtx, realPath, args...)
	configureCmd(cmd)
	if dir != "" {
		cmd.Dir = dir
	}
	out, err := cmd.CombinedOutput()
	if err != nil && cmdCtx.Err() == context.DeadlineExceeded {
		return string(out), fmt.Errorf("lệnh timeout (60s): %s %s", filepath.Base(realPath), strings.Join(args, " "))
	}
	return string(out), err
}

// --- HÀM ĐỌC THÔNG SỐ ADB / FASTBOOT ---

func (a *App) getAdbProp(serial, key string) string {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock() // Thay vì Unlock thủ công

	cmd := exec.Command(a.GetToolPath("adb"), "-s", serial, "shell", "getprop", key)
	configureCmd(cmd)
	out, _ := cmd.CombinedOutput()
	return strings.TrimSpace(string(out))
}

// PropMap holds parsed Android system properties.
type PropMap map[string]string

// ParseGetpropOutput parses the output of "adb shell getprop" into a map.
// Each line has format: [property.name]: [value]
func ParseGetpropOutput(output string) PropMap {
	props := make(PropMap)
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "[") {
			continue
		}
		closeBracket := strings.Index(line, "]")
		if closeBracket < 2 {
			continue
		}
		key := line[1:closeBracket]
		valueStart := strings.Index(line[closeBracket:], "[")
		if valueStart < 0 {
			continue
		}
		valueStart += closeBracket + 1
		valueEnd := strings.LastIndex(line, "]")
		if valueEnd <= valueStart {
			continue
		}
		value := line[valueStart:valueEnd]
		props[key] = value
	}
	return props
}

// getAdbPropsAll runs a single "adb shell getprop" and returns all properties.
func (a *App) getAdbPropsAll(serial string) (PropMap, error) {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	cmd := exec.Command(a.GetToolPath("adb"), "-s", serial, "shell", "getprop")
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, err
	}
	return ParseGetpropOutput(string(out)), nil
}

func (a *App) getAdbBattery(serial string) string {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock() // Thay vì Unlock thủ công

	cmd := exec.Command(a.GetToolPath("adb"), "-s", serial, "shell", "dumpsys", "battery")
	configureCmd(cmd)
	out, _ := cmd.CombinedOutput()
	s := string(out)
	for _, l := range strings.Split(s, "\n") {
		l = strings.TrimSpace(l)
		if strings.HasPrefix(l, "level:") {
			return strings.TrimSpace(strings.TrimPrefix(l, "level:"))
		}
	}
	return "--"
}

func (a *App) getFastbootVar(serial, varName string) string {
	flasher.ToolsLock()
	defer flasher.ToolsUnlock() // Thay vì Unlock thủ công

	cmd := exec.Command(a.GetToolPath("fastboot"), "-s", serial, "getvar", varName)
	configureCmd(cmd)
	out, _ := cmd.CombinedOutput()
	return parseFastbootVarOutput(string(out), varName)
}

func parseFastbootVarOutput(output, varName string) string {
	marker := varName + ":"
	for _, line := range strings.Split(output, "\n") {
		if index := strings.Index(line, marker); index >= 0 {
			return strings.TrimSpace(line[index+len(marker):])
		}
	}
	return "--"
}
