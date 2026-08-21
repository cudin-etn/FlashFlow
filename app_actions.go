package main

import (
	"fmt"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// --- QUICK ACTIONS ---

func (a *App) withActiveDevice(fn func(d DeviceInfo) error) error {
	if !a.beginCmd() {
		return fmt.Errorf("đang có một tác vụ khác đang chạy")
	}
	defer a.endCmd()
	d := a.CheckDevice()
	if !d.Connected {
		return fmt.Errorf("không tìm thấy thiết bị đang kết nối")
	}
	return fn(d)
}

func (a *App) ensureBootloader(d DeviceInfo) error {
	if strings.HasPrefix(strings.ToLower(d.State), "fastboot") || d.State == "bootloader" {
		return nil
	}

	a.NotifyUI("info", "Đang khởi động vào Bootloader...")
	_ = a.RunCommandWithDir("", "adb", "-s", d.Serial, "reboot", "bootloader")

	if err := a.waitForFastboot(); err != nil {
		return err
	}

	// Chờ bootloader ổn định
	time.Sleep(1200 * time.Millisecond)

	return nil
}

func (a *App) waitForAdb(serial string) error {
	timeout := time.After(60 * time.Second)
	ticker := time.NewTicker(800 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeout:
			return fmt.Errorf("hết thời gian chờ ADB")
		case <-ticker.C:
			adbs, _ := a.run.ListADBDevices()
			for _, d := range adbs {
				if d.Serial == serial {
					return nil
				}
			}
		}
	}
}

func (a *App) RebootSystem() error {
	return a.withActiveDevice(func(d DeviceInfo) error {
		a.NotifyUI("info", "Đang khởi động lại hệ thống...")
		if strings.HasPrefix(strings.ToLower(d.State), "fastboot") || d.State == "bootloader" || d.State == "fastbootd" {
			if err := a.RunCommandWithDir("", "fastboot", "-s", d.Serial, "reboot"); err != nil {
				return err
			}
			return a.waitForAdb(d.Serial)
		}
		if err := a.RunCommandWithDir("", "adb", "-s", d.Serial, "reboot"); err != nil {
			return err
		}
		return a.waitForAdb(d.Serial)
	})
}

// [UPDATED] Hàm RebootBootloader Tiếng Việt & Logic chuẩn
func (a *App) RebootBootloader() error {
	a.NotifyUI("info", "Đang chuyển hướng vào Bootloader...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Lệnh: Khởi động lại vào Bootloader")
	wailsRuntime.EventsEmit(a.ctx, "device_mode_switching", map[string]string{"target": "bootloader"})

	// 1. Check ADB
	adbs, _ := a.run.ListADBDevices()
	if len(adbs) > 0 {
		return a.RunCommandWithDir("", "adb", "reboot", "bootloader")
	}

	// 2. Check Fastboot/FastbootD
	fbs, _ := a.run.ListFastbootDevices()
	if len(fbs) > 0 {
		d := fbs[0]
		isUserspace := a.getFastbootVar(d.Serial, "is-userspace")

		// Nếu đang ở FastbootD (Userspace) -> Cần lệnh reboot bootloader để về màn hình đen
		if strings.TrimSpace(isUserspace) == "yes" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Phát hiện FastbootD, đang quay về Bootloader thường...")
			if err := a.RunCommandWithDir("", "fastboot", "-s", d.Serial, "reboot", "bootloader"); err != nil {
				return err
			}
			return a.waitForFastboot()
		}

		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Thiết bị đã ở trong Bootloader")
		return nil
	}

	return fmt.Errorf("không tìm thấy thiết bị")
}

// [UPDATED] Hàm RebootRecovery thông minh (Hỗ trợ cả ADB và Fastboot)
func (a *App) RebootRecovery() error {
	a.NotifyUI("info", "Đang chuyển hướng vào Recovery...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Lệnh: Khởi động lại vào Recovery")
	wailsRuntime.EventsEmit(a.ctx, "device_mode_switching", map[string]string{"target": "recovery"})

	// 1. Nếu đang có ADB -> Dùng ADB
	adbs, _ := a.run.ListADBDevices()
	if len(adbs) > 0 {
		return a.RunCommandWithDir("", "adb", "reboot", "recovery")
	}

	// 2. Nếu đang ở Fastboot -> Dùng Fastboot (Cái anh cần cho Step 2)
	fbs, _ := a.run.ListFastbootDevices()
	if len(fbs) > 0 {
		// Lưu ý: Dùng chuỗi trần "fastboot" để tránh lỗi đường dẫn kép
		if err := a.RunCommandStreaming("", "fastboot", "reboot", "recovery"); err != nil {
			return err
		}
		return nil
	}

	return fmt.Errorf("không tìm thấy thiết bị")
}

// [UPDATED] Hàm RebootFastbootD Tiếng Việt & Logic chuẩn
func (a *App) RebootFastbootD() error {
	a.NotifyUI("info", "Đang chuyển sang FastbootD (Userspace)...")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Lệnh: Khởi động lại vào FastbootD")
	wailsRuntime.EventsEmit(a.ctx, "device_mode_switching", map[string]string{"target": "fastbootd"})

	adbs, _ := a.run.ListADBDevices()
	if len(adbs) > 0 {
		// Android 10+ chuẩn
		return a.RunCommandWithDir("", "adb", "reboot", "fastboot")
	}

	fbs, _ := a.run.ListFastbootDevices()
	if len(fbs) > 0 {
		d := fbs[0]
		isUserspace := a.getFastbootVar(d.Serial, "is-userspace")

		// Đã ở FastbootD rồi thì thôi
		if strings.TrimSpace(isUserspace) == "yes" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Thiết bị đã ở trong FastbootD")
			return nil
		}

		// Logic quan trọng cho OnePlus/Xiaomi
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đang chuyển từ Bootloader sang FastbootD...")
		if err := a.RunCommandWithDir("", "fastboot", "-s", d.Serial, "reboot", "fastboot"); err != nil {
			return err
		}
		// Đợi máy reboot và nhận lại driver
		return a.waitForFastboot()
	}

	return fmt.Errorf("không tìm thấy thiết bị")
}

func (a *App) UnlockBootloader() error {
	return a.withActiveDevice(func(d DeviceInfo) error {
		if err := a.ensureBootloader(d); err != nil {
			return err
		}
		return a.RunCommandWithDirUnlocked("", "fastboot", "-s", d.Serial, "flashing", "unlock")
	})
}

func (a *App) LockBootloader() error {
	return a.withActiveDevice(func(d DeviceInfo) error {
		if err := a.ensureBootloader(d); err != nil {
			return err
		}
		return a.RunCommandWithDirUnlocked("", "fastboot", "-s", d.Serial, "flashing", "lock")
	})
}
