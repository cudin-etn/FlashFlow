package main

import (
	"fmt"
	"os/exec"
	"strings"
	"time"

	"github.com/cudin-etn/FlashFlow/flasher"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) SwitchToFastbootD() error {

	// If already in fastbootD, do nothing
	if a.IsFastbootD() {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Already in fastbootD")
		return nil
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Switching to fastbootD (userspace)...")

	// [FIX]: Xóa dòng lấy fastbootBin, truyền trực tiếp chuỗi "fastboot"
	// Lệnh đúng là: fastboot reboot fastboot
	if err := a.RunCommandWithDir("", "fastboot", "reboot", "fastboot"); err != nil {
		return fmt.Errorf("failed to reboot fastbootD: %v", err)
	}

	return a.waitForFastbootD(ModeReconnectTimeout)
}

func (a *App) waitForFastbootD(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for time.Now().Before(deadline) {
		<-ticker.C

		fbs, _ := a.run.ListFastbootDevices()
		if len(fbs) == 0 {
			continue
		}
		serial := strings.TrimSpace(fbs[0].Serial)
		if serial == "" {
			continue
		}

		// verify userspace
		v := a.getFastbootVar(serial, "is-userspace")
		if strings.TrimSpace(strings.ToLower(v)) == "yes" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> FASTBOOTD: confirmed (is-userspace=yes)")
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> Chờ ổn định %v trước khi tiếp tục...", ModeStabilityDelay))
			time.Sleep(ModeStabilityDelay)
			return nil
		}
	}

	return fmt.Errorf("timeout: thiết bị không kết nối lại trong %v khi chờ fastbootd (is-userspace!=yes)", timeout)
}

func (a *App) SwitchToBootloader() error {
	// If not in fastbootD, assume already in bootloader
	if !a.IsFastbootD() {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Already in bootloader")
		return nil
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_log", "[INFO] Leaving fastbootD → bootloader")

	// [FIX]: Xóa dòng lấy fastbootBin, truyền trực tiếp chuỗi "fastboot"
	if err := a.RunCommandWithDir("", "fastboot", "reboot-bootloader"); err != nil {
		return err
	}

	return a.waitForFastboot()
}

// Hard safety: read current mode (best-effort)
func (a *App) IsFastbootD() bool {
	fbs, _ := a.run.ListFastbootDevices()
	if len(fbs) == 0 {
		return false
	}
	serial := strings.TrimSpace(fbs[0].Serial)
	if serial == "" {
		return false
	}

	// Query fastboot getvar is-userspace
	// Chỗ này dùng exec.Command trực tiếp thì giữ nguyên a.GetToolPath("fastboot") là ĐÚNG
	flasher.ToolsLock()
	defer flasher.ToolsUnlock()

	cmd := exec.Command(a.GetToolPath("fastboot"), "-s", serial, "getvar", "is-userspace")
	configureCmd(cmd)
	out, _ := cmd.CombinedOutput()

	s := strings.ToLower(string(out))
	return strings.Contains(s, "is-userspace: yes")
}
