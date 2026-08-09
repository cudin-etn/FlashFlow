package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	// LicenseCacheTTL is the maximum duration (in seconds) a cached license is considered valid.
	LicenseCacheTTL int64 = 86400 // 24 hours

	// FREE_MODE is the single access-mode switch for backend and frontend.
	// Set false to re-enable the existing premium/license gates.
	FREE_MODE = true

	// LICENSE_API_URL remains the existing Final V7 deployment URL. Updating
	// that deployment preserves compatibility with every installed client.
	LICENSE_API_URL = "https://script.google.com/macros/s/AKfycbzGe00E_UcNZ0mT0OA249COfb56cNxW1RZJHtZ-518axGtRPPsKinTuutwUCW_pItaRTg/exec"
)

// IsFreeMode exposes the single backend access-mode switch to the frontend.
// Change FREE_MODE above to false to re-enable the existing premium gates/UI.
func (a *App) IsFreeMode() bool {
	return FREE_MODE
}

var (
	licenseMu           sync.RWMutex
	globalLicenseStatus = LicenseResponse{
		Result:   "UNKNOWN",
		Type:     "TRIAL",
		DaysLeft: 0,
		ExpiryTS: 0,
		IsPro:    false, // Mặc định là False
	}
)

// getLicenseStatus returns a copy of the current license state (read-locked).
func getLicenseStatus() LicenseResponse {
	licenseMu.RLock()
	defer licenseMu.RUnlock()
	return globalLicenseStatus
}

// setLicenseStatus overwrites the global license state (write-locked).
func setLicenseStatus(status LicenseResponse) {
	licenseMu.Lock()
	defer licenseMu.Unlock()
	globalLicenseStatus = status
}

// updateLicenseField applies a mutation function under write lock.
func updateLicenseField(fn func(s *LicenseResponse)) {
	licenseMu.Lock()
	defer licenseMu.Unlock()
	fn(&globalLicenseStatus)
}

type LicenseResponse struct {
	Result   string `json:"result"`    // ACTIVE, EXPIRED, ERROR
	Type     string `json:"type"`      // TRIAL, PRO, SHOP_SMALL, SHOP_BIG, WHITE_LABEL, RE_4H
	DaysLeft int    `json:"days_left"` // Số ngày còn lại
	ExpiryTS int64  `json:"expiry_ts"` // [MỚI] Thời điểm hết hạn (Unix Timestamp) cho gói 4H
	Message  string `json:"message"`
	IsPro    bool   `json:"isPro"`
}

// LicenseCacheEntry stores the last valid license response with timestamp for offline use.
type LicenseCacheEntry struct {
	Response  LicenseResponse `json:"response"`
	CheckedAt int64           `json:"checkedAt"` // Unix timestamp of last successful server check
	ExpiresAt int64           `json:"expiresAt"` // CheckedAt + LicenseCacheTTL (24h)
}

// licenseCacheFileName is the name of the cache file stored in the library directory.
const licenseCacheFileName = ".license_cache.json"

// getLicenseCachePath returns the full path to the license cache file.
func (a *App) getLicenseCachePath() string {
	return filepath.Join(a.getLibraryDir(), licenseCacheFileName)
}

// SaveLicenseCache saves the current valid license response with timestamp to disk.
func (a *App) SaveLicenseCache(resp LicenseResponse) error {
	now := time.Now().Unix()
	entry := LicenseCacheEntry{
		Response:  resp,
		CheckedAt: now,
		ExpiresAt: now + LicenseCacheTTL,
	}

	data, err := json.MarshalIndent(entry, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal license cache: %w", err)
	}

	cachePath := a.getLicenseCachePath()
	if err := os.MkdirAll(filepath.Dir(cachePath), 0755); err != nil {
		return fmt.Errorf("failed to create cache directory: %w", err)
	}

	if err := os.WriteFile(cachePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write license cache: %w", err)
	}

	return nil
}

// LoadLicenseCache reads the license cache from disk.
func (a *App) LoadLicenseCache() (*LicenseCacheEntry, error) {
	cachePath := a.getLicenseCachePath()
	data, err := os.ReadFile(cachePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read license cache: %w", err)
	}

	var entry LicenseCacheEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, fmt.Errorf("failed to parse license cache: %w", err)
	}

	return &entry, nil
}

// IsLicenseCacheValid returns true if the cache exists and has not expired (current time < ExpiresAt).
func (a *App) IsLicenseCacheValid() bool {
	entry, err := a.LoadLicenseCache()
	if err != nil {
		return false
	}
	return IsLicenseCacheEntryValid(entry, time.Now().Unix())
}

// IsLicenseCacheEntryValid is a pure function that checks if a cache entry is valid at a given timestamp.
// Cache is valid when currentTimestamp < entry.ExpiresAt (i.e., currentTimestamp - checkedAt < 86400).
func IsLicenseCacheEntryValid(entry *LicenseCacheEntry, currentTimestamp int64) bool {
	if entry == nil {
		return false
	}
	return currentTimestamp < entry.ExpiresAt
}

// IsLicenseValidForFlash combines online check + cache fallback to determine if flash is allowed.
// Logic:
//
//	a. If online check succeeds → use that result, update cache
//	b. If online check fails → check cache. If cache valid and not EXPIRED → allow
//	c. If cache expired or EXPIRED status → block
func (a *App) IsLicenseValidForFlash() bool {
	// Keep the free-mode bypass at the public flash gate as well as in
	// IsLicenseValid. Some callers use this method directly, so free mode must
	// never depend on an old cache entry or on the result of a server request.
	if FREE_MODE {
		return true
	}

	// First, check the in-memory global license status (set by online check)
	status := getLicenseStatus()
	if status.Result != "UNKNOWN" && status.Result != "ERROR" {
		// Online check has been performed successfully
		return a.IsLicenseValid()
	}

	// Online check failed or hasn't completed — fall back to cache
	entry, err := a.LoadLicenseCache()
	if err != nil {
		// No cache available → block
		return false
	}

	// Check if cache is still valid (within 24h)
	if !IsLicenseCacheEntryValid(entry, time.Now().Unix()) {
		// Cache expired → block
		return false
	}

	// Cache is valid — check if the cached license itself is not EXPIRED
	if entry.Response.Result == "EXPIRED" {
		return false
	}

	// Cache valid and license not expired → allow flash
	// Apply same logic as IsLicenseValid() but on cached response
	if isPaidPackage(entry.Response.Type) {
		return true
	}
	if entry.Response.Type == "TRIAL" {
		if entry.Response.DaysLeft <= 0 {
			return false
		}
		return true
	}

	return false
}

// 1. Lấy mã máy (HWID) - PHIÊN BẢN V3 (FIX UNKNOWN)
func (a *App) GetHWID() string {
	osName := runtime.GOOS

	// --- MAC OS ---
	if osName == "darwin" {
		cmd := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice")
		out, err := cmd.CombinedOutput()
		if err != nil {
			return "MAC_ERR_" + err.Error() // Debug lỗi
		}
		lines := strings.Split(string(out), "\n")
		for _, line := range lines {
			if strings.Contains(line, "IOPlatformUUID") {
				parts := strings.Split(line, "=")
				if len(parts) > 1 {
					id := strings.TrimSpace(parts[1])
					id = strings.ReplaceAll(id, "\"", "")
					return id
				}
			}
		}
		return "MAC_GENERIC_ID"
	}

	// --- WINDOWS ---
	if osName == "windows" {
		// CÁCH 1: PowerShell (Mạnh nhất)
		cmdPS := exec.Command("powershell", "-Command", "(Get-CimInstance -Class Win32_ComputerSystemProduct).UUID")
		outPS, errPS := cmdPS.CombinedOutput()
		if errPS == nil {
			uuid := strings.TrimSpace(string(outPS))
			if len(uuid) > 10 {
				return uuid
			}
		}

		// CÁCH 2: WMIC
		cmd := exec.Command("wmic", "csproduct", "get", "uuid")
		out, err := cmd.CombinedOutput()
		if err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				line = strings.TrimSpace(line)
				if line != "" && line != "UUID" && len(line) > 10 {
					return line
				}
			}
		}

		// CÁCH 3: Registry
		cmdReg := exec.Command("reg", "query", "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid")
		outReg, errReg := cmdReg.CombinedOutput()
		if errReg == nil {
			output := string(outReg)
			parts := strings.Fields(output)
			if len(parts) >= 3 {
				return parts[len(parts)-1]
			}
		}

		return "UNKNOWN_WINDOWS"
	}

	// --- LINUX ---
	if osName == "linux" {
		if out, err := os.ReadFile("/etc/machine-id"); err == nil {
			return strings.TrimSpace(string(out))
		}
		if out, err := os.ReadFile("/sys/class/dmi/id/product_uuid"); err == nil {
			return strings.TrimSpace(string(out))
		}
		return "UNKNOWN_LINUX"
	}

	return "UNKNOWN_OS_" + strings.ToUpper(osName)
}

// Helper: Kiểm tra xem Type có phải là gói trả phí không
func isPaidPackage(licenseType string) bool {
	// Only values issued by the current Google Script are premium packages.
	// Treating any unknown/non-empty value as paid would make a malformed server
	// response (or a future FREE value) unlock the app when FREE_MODE is turned
	// off. Keep TECHNICIAN for the existing local technician flow.
	switch strings.ToUpper(strings.TrimSpace(licenseType)) {
	case "RE_4H", "PRO_6M", "PRO", "SHOP_SMALL", "SHOP_BIG", "WHITE_LABEL", "ENTERPRISE", "TECHNICIAN":
		return true
	default:
		return false
	}
}

// buildLicenseRequestURL keeps old HWID-only clients compatible while newer
// builds report lightweight computer telemetry on the same check request.
// last_seen and launch_count are assigned by server time in Apps Script.
func buildLicenseRequestURL(hwid string, noCache bool) string {
	endpoint, err := url.Parse(LICENSE_API_URL)
	if err != nil {
		return LICENSE_API_URL
	}
	query := endpoint.Query()
	query.Set("hwid", hwid)
	query.Set("app_version", CurrentVersion)
	query.Set("os", runtime.GOOS)
	query.Set("arch", runtime.GOARCH)
	if noCache {
		query.Set("nocache", fmt.Sprintf("%d", time.Now().Unix()))
	}
	endpoint.RawQuery = query.Encode()
	return endpoint.String()
}

// 2. Gọi Server Check License (Chạy khi mở App)
func (a *App) CheckLicenseOnInit() {
	go func() {
		hwid := a.GetHWID()
		requestURL := buildLicenseRequestURL(hwid, false)

		client := http.Client{Timeout: 15 * time.Second}
		resp, err := client.Get(requestURL)
		if err != nil {
			fmt.Println("Check License Error:", err)
			// Online check failed — try to load from cache
			if cached, cacheErr := a.LoadLicenseCache(); cacheErr == nil {
				if IsLicenseCacheEntryValid(cached, time.Now().Unix()) {
					setLicenseStatus(cached.Response)
					wailsRuntime.EventsEmit(a.ctx, "license_checked", cached.Response)
					fmt.Printf(">>> LICENSE (from cache): %s | Type: %s | IsPro: %v\n", cached.Response.Result, cached.Response.Type, cached.Response.IsPro)
				}
			}
			return
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var res LicenseResponse
		if err := json.Unmarshal(body, &res); err == nil {
			// Map dữ liệu từ Server về Struct chuẩn
			if isPaidPackage(res.Type) && res.Result != "EXPIRED" {
				res.IsPro = true
			} else {
				res.IsPro = false
			}

			setLicenseStatus(res)
			wailsRuntime.EventsEmit(a.ctx, "license_checked", res)
			fmt.Printf(">>> LICENSE: %s | Type: %s | Exp: %d | IsPro: %v\n", res.Result, res.Type, res.ExpiryTS, res.IsPro)

			// Handle RE_4H expiry: emit notification and transition to TRIAL
			if res.Type == "RE_4H" && res.Result == "EXPIRED" {
				a.HandleRE4HExpiry()
			}

			// Save to cache on successful online check
			if res.Result != "ERROR" {
				if cacheErr := a.SaveLicenseCache(res); cacheErr != nil {
					fmt.Println(">>> LICENSE CACHE: Failed to save:", cacheErr)
				} else {
					fmt.Println(">>> LICENSE CACHE: Saved successfully")
				}
			}
		}
	}()
}

// 3. Hàm Kích Hoạt (Frontend gọi khi bấm nút ở Store)
func (a *App) ActivateLicense(key string) LicenseResponse {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đang kết nối Server kiểm tra trạng thái...")

	hwid := a.GetHWID()
	requestURL := buildLicenseRequestURL(hwid, true)

	client := http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(requestURL)
	if err != nil {
		return LicenseResponse{Result: "ERROR", Message: "Lỗi mạng. Vui lòng kiểm tra Internet.", IsPro: false}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var res LicenseResponse
	json.Unmarshal(body, &res)

	// [LOGIC MỚI] Xử lý đa gói cước
	if isPaidPackage(res.Type) && res.Result != "EXPIRED" {
		res.IsPro = true

		// Nếu là gói 4H, không ghi đè Message để Frontend tự xử lý timer
		if res.Type != "RE_4H" {
			res.Message = fmt.Sprintf("Kích hoạt thành công gói: %s", res.Type)
		}

	} else {
		res.IsPro = false
		if res.Result == "EXPIRED" {
			res.Message = "Hết hạn dùng thử. Vui lòng liên hệ Admin."
		} else {
			res.Message = fmt.Sprintf("Vẫn đang dùng thử (Gói %s). Còn %d ngày.", res.Type, res.DaysLeft)
		}
	}

	setLicenseStatus(res)
	// Save to cache on successful activation
	if res.Result != "ERROR" {
		if cacheErr := a.SaveLicenseCache(res); cacheErr != nil {
			fmt.Println(">>> LICENSE CACHE: Failed to save after activation:", cacheErr)
		}
	}

	// Handle RE_4H expiry: emit notification and transition to TRIAL
	if res.Type == "RE_4H" && res.Result == "EXPIRED" {
		a.HandleRE4HExpiry()
	}

	return res
}

// 4. Hàm Chặn Flash (Quan trọng nhất)
func (a *App) IsLicenseValid() bool {
	// FREE_MODE bypass — cho tất cả user flash free
	if FREE_MODE {
		return true
	}

	status := getLicenseStatus()
	// 1. Gói trả phí -> Luôn cho qua (Trừ khi server trả về EXPIRED)
	if isPaidPackage(status.Type) {
		if status.Result == "EXPIRED" {
			return false
		}
		// Với gói 4H, logic hết giờ đã được server xử lý trả về EXPIRED, nên ở đây OK
		return true
	}

	// 2. TRIAL
	if status.Type == "TRIAL" {
		if status.Result == "EXPIRED" || status.DaysLeft <= 0 {
			return false
		}
		return true
	}

	return false
}

// HandleRE4HExpiry handles the expiry of a RE_4H (4-hour) license package.
// When the server returns EXPIRED for a RE_4H package (or the local timer detects expiry):
// 1. Emits a "license_re4h_expired" event with package name and message
// 2. Transitions globalLicenseStatus to TRIAL within 5 seconds
func (a *App) HandleRE4HExpiry() {
	fmt.Println(">>> LICENSE: RE_4H package expired. Emitting notification and transitioning to TRIAL.")

	// Emit notification event to frontend
	wailsRuntime.EventsEmit(a.ctx, "license_re4h_expired", map[string]interface{}{
		"type":    "RE_4H",
		"message": "Gói RE_4H (4 giờ) đã hết hạn",
	})

	// Transition to TRIAL within 5 seconds (use goroutine with delay)
	go func() {
		time.Sleep(3 * time.Second) // Transition after 3s (within the 5s requirement)
		updateLicenseField(func(s *LicenseResponse) {
			s.Result = "EXPIRED"
			s.Type = "TRIAL"
			s.IsPro = false
			s.DaysLeft = 0
			s.ExpiryTS = 0
		})

		// Emit updated license status to frontend
		wailsRuntime.EventsEmit(a.ctx, "license_checked", getLicenseStatus())
		fmt.Println(">>> LICENSE: Transitioned to TRIAL mode after RE_4H expiry.")
	}()
}

// checkLicenseExpiredAfterFlash detects if the license transitioned to EXPIRED
// during an active flash session. If so, it emits "license_expired_after_flash"
// to notify the frontend. The next flash attempt will be blocked by IsLicenseValid().
func (a *App) checkLicenseExpiredAfterFlash(licenseAtStart LicenseResponse) {
	// License was already expired at start — nothing to do (shouldn't happen since we check before flash).
	if licenseAtStart.Result == "EXPIRED" {
		return
	}

	// Check current license status after flash completed.
	status := getLicenseStatus()
	if status.Result == "EXPIRED" {
		// License expired during the flash session.
		fmt.Println(">>> LICENSE: Expired during flash session. Blocking new sessions.")
		wailsRuntime.EventsEmit(a.ctx, "license_expired_after_flash", map[string]interface{}{
			"type":    status.Type,
			"message": "License đã hết hạn trong khi flash. Phiên flash hiện tại đã hoàn tất. Các phiên flash mới sẽ bị chặn.",
		})
	}
}
