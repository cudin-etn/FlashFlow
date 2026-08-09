//go:build !windows

package main

import (
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// InstallDrivers: Phiên bản giả lập cho Mac/Linux để không bị lỗi compile
func (a *App) InstallDrivers() string {
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "!!! Tính năng cài Driver chỉ hỗ trợ trên Windows.")
	a.NotifyUI("error", "Tính năng này chỉ dành cho Windows")
	return "Error: Not supported on this OS"
}
