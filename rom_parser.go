package main

import (
	"archive/zip"
	"bufio"
	"strings"
)

// Đã lược bỏ struct RomAnalysis vì nó đã được khai báo hoặc xử lý logic trong app.go

// GetRomBoardName: Chỉ giữ lại hàm này để lấy thông tin Board phục vụ hiển thị trên UI
func (a *App) GetRomBoardName(zipPath string) (string, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return "", err
	}
	defer r.Close()

	for _, f := range r.File {
		// android-info.txt chứa thông tin định danh thiết bị của Google Pixel
		if f.Name == "android-info.txt" {
			rc, err := f.Open()
			if err != nil {
				return "", err
			}
			defer rc.Close()

			scanner := bufio.NewScanner(rc)
			for scanner.Scan() {
				line := scanner.Text()
				// Tìm dòng board hoặc product
				if strings.Contains(line, "require board=") {
					parts := strings.Split(line, "=")
					if len(parts) > 1 {
						return strings.TrimSpace(parts[1]), nil
					}
				}
				if strings.Contains(line, "require product=") {
					parts := strings.Split(line, "=")
					if len(parts) > 1 {
						return strings.TrimSpace(parts[1]), nil
					}
				}
			}
		}
	}
	return "unknown", nil
}

// Các hàm Unzip và AnalyzeRom đã được chuyển sang app.go
// để tránh lỗi "already declared" khi biên dịch Wails.
