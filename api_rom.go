package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// RomInfo là cấu trúc dữ liệu chuẩn để gửi về Frontend (React)
type RomInfo struct {
	Version     string `json:"version"`
	Android     string `json:"android"`
	Region      string `json:"region"`
	Type        string `json:"type"` // FASTBOOT, RECOVERY, OTA
	DownloadURL string `json:"downloadUrl"`
	Size        string `json:"size"`
	Date        string `json:"date"`
}

// FetchOnlineRoms là hàm Wails xuất ra cho Frontend gọi
func (a *App) FetchOnlineRoms(vendor string, codename string) []RomInfo {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> Đang tìm kiếm bản ROM mới nhất cho mã máy: [%s]...", codename))

	vendor = strings.ToLower(vendor)
	codename = strings.ToLower(codename)

	var results []RomInfo

	switch vendor {
	case "xiaomi":
		results = a.fetchXiaomiRoms(codename)
	case "pixel":
		results = a.fetchPixelRoms(codename)
	default:
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Chưa hỗ trợ tải ROM tự động cho dòng máy này.")
		return results
	}

	if len(results) == 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Không tìm thấy bản ROM nào hoặc máy chủ đang bảo trì.")
	} else {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> Thành công! Tìm thấy %d bản ROM.", len(results)))
	}

	return results
}

// ---------------------------------------------------------
// 1. MODULE TẢI ROM XIAOMI (Dùng public API)
// ---------------------------------------------------------
func (a *App) fetchXiaomiRoms(codename string) []RomInfo {
	var roms []RomInfo

	// Ở đây em sử dụng API của mifirm.net (rất phổ biến cho anh em thợ)
	// Trả về JSON cực kỳ đầy đủ thông tin của thiết bị
	url := fmt.Sprintf("https://mifirm.net/api/device/%s", codename)

	client := http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return roms
	}
	defer resp.Body.Close()

	// Khai báo struct hứng data từ MiFirm API
	type MiFirmResponse struct {
		Data []struct {
			Version string `json:"version"`
			Android string `json:"os_version"` // VD: 13.0, 14.0
			Branch  string `json:"branch"`     // Global, EEA, CN, RU
			Type    string `json:"type"`       // Fastboot, Recovery
			Link    string `json:"link"`       // Link tải
			Size    string `json:"size"`       // Kích thước (VD: 5.2GB)
			Date    string `json:"date"`
		} `json:"data"`
	}

	var res MiFirmResponse
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return roms
	}

	// Chuyển đổi sang chuẩn của App mình
	for _, item := range res.Data {
		// Chỉ lấy ROM Fastboot và Recovery để thợ dùng
		romType := strings.ToUpper(item.Type)
		if romType == "FASTBOOT" || romType == "RECOVERY" {
			roms = append(roms, RomInfo{
				Version:     item.Version,
				Android:     "Android " + item.Android,
				Region:      strings.ToUpper(item.Branch),
				Type:        romType,
				DownloadURL: item.Link,
				Size:        item.Size,
				Date:        item.Date,
			})
		}
	}

	return roms
}

// ---------------------------------------------------------
// 2. MODULE TẢI ROM PIXEL
// ---------------------------------------------------------
func (a *App) fetchPixelRoms(codename string) []RomInfo {
	var roms []RomInfo

	// LƯU Ý: Google KHÔNG có JSON API mở chính thức cho Firmware.
	// Để lấy data thực, ta cần cào (scrape) HTML từ developers.google.com
	// hoặc anh tự host 1 file JSON trên Server (Github/VPS) của anh.
	//
	// Tạm thời em tạo 1 dữ liệu mẫu (Mock Data) chuẩn xác của con Pixel 8 Pro (husky)
	// để anh ráp UI cho Frontend chạy mượt trước. Ta sẽ thay bằng API thực sau.

	roms = append(roms, RomInfo{
		Version:     "UQ1A.240205.004",
		Android:     "Android 14",
		Region:      "GLOBAL",
		Type:        "FASTBOOT",
		DownloadURL: fmt.Sprintf("https://dl.google.com/dl/android/aosp/%s-uq1a.240205.004-factory.zip", codename),
		Size:        "2.8 GB",
		Date:        "Feb 2024",
	})

	roms = append(roms, RomInfo{
		Version:     "UQ1A.231205.015",
		Android:     "Android 14",
		Region:      "GLOBAL",
		Type:        "FASTBOOT",
		DownloadURL: fmt.Sprintf("https://dl.google.com/dl/android/aosp/%s-uq1a.231205.015-factory.zip", codename),
		Size:        "2.7 GB",
		Date:        "Dec 2023",
	})

	return roms
}
