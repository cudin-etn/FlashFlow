package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Cấu trúc dữ liệu dùng cho Flash IMG smart group
type PartitionItem struct {
	ID        int    `json:"id"`
	Partition string `json:"partition"`
	Path      string `json:"path"`
}

type flashPlanItem struct {
	PartitionItem
	Logical bool
}

// Danh sách các phân vùng VẬT LÝ an toàn nạp ở Bootloader
var physicalPartitions = map[string]bool{
	"boot": true, "init_boot": true, "vendor_boot": true,
	"dtbo": true, "dtb": true, "recovery": true, "modem": true,
	"vbmeta": true, "vbmeta_system": true, "vbmeta_vendor": true, "vbmeta_kernel": true,
	"super": true, "super_empty": true, "userdata": true, "metadata": true, "misc": true,
}

// ====================================================================================
// FLASH IMAGES SMART GROUP
// Query phân vùng ở FastbootD, sau đó flash nhóm Bootloader trước rồi FastbootD sau.
// ====================================================================================

func (a *App) FlashImagesSmartGroup(files []PartitionItem) error {
	if !a.IsLicenseValid() {
		return fmt.Errorf("HẾT HẠN")
	}
	fastbootBin := a.GetToolPath("fastboot")

	// Record license status at session start for graceful expiry detection.
	licenseAtStart := getLicenseStatus()

	// Set up flash context for cancel support.
	a.flashMutex.Lock()
	if a.isFlashing {
		a.flashMutex.Unlock()
		return fmt.Errorf("hệ thống đang bận flash")
	}
	a.isFlashing = true
	a.flashCtx, a.flashCancel = context.WithCancel(a.ctx)
	a.flashMutex.Unlock()
	defer func() {
		a.flashMutex.Lock()
		a.isFlashing = false
		if a.flashCancel != nil {
			a.flashCancel()
			a.flashCancel = nil
		}
		a.flashCtx = nil
		a.flashMutex.Unlock()

		// Graceful license expiry: if license was valid at start but expired during flash,
		// notify the frontend. The next flash attempt will be blocked by IsLicenseValid().
		a.checkLicenseExpiredAfterFlash(licenseAtStart)
	}()

	// Pause device watcher to avoid USB conflicts during flash.
	a.PauseDeviceWatcher()
	defer a.ResumeDeviceWatcher()

	// Initialize flash report for smart group flash
	romName := "Manual IMG Flash"
	if len(files) > 0 {
		romName = fmt.Sprintf("Manual IMG (%d files)", len(files))
	}
	a.startFlashReport(romName, a.selectedVendor, false, false, false)
	defer func() {
		a.reportMu.Lock()
		needFinalize := a.flashReport != nil && a.flashReport.Result == "running"
		a.reportMu.Unlock()
		if needFinalize {
			a.finishFlashReport("failed")
		}
	}()

	var listBL []PartitionItem
	var listFBD []flashPlanItem

	d := a.CheckDevice()

	if d.State == "fastbootd" {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Thiết bị đã ở FastbootD. Tiến hành query phân vùng...")
	} else {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> [BƯỚC 1] Chuyển sang FastbootD để phân tích cấu trúc máy...")
		if err := a.RebootFastbootD(); err != nil {
			return err
		}
		if err := a.waitForSpecificMode("fastbootd"); err != nil {
			return err
		}
		// Stability delay is now handled inside waitForSpecificMode (ModeStabilityDelay = 4s)
	}

	// Quan trọng: sau khi chuyển mode phải đọc lại serial/state.
	d = a.CheckDevice()
	if !d.Connected || strings.TrimSpace(d.Serial) == "" {
		return fmt.Errorf("không đọc được thiết bị sau khi vào FastbootD")
	}
	unlocked := strings.ToLower(strings.TrimSpace(a.getFastbootVar(d.Serial, "unlocked")))
	deviceState := strings.ToLower(strings.TrimSpace(a.getFastbootVar(d.Serial, "device-state")))
	if unlocked == "no" || deviceState == "locked" {
		return fmt.Errorf("Bootloader đang LOCKED. Không thể flash IMG cho tới khi unlock bootloader")
	}

	// Set device name in report
	if d.Model != "" && d.Model != "Fastboot Device" {
		a.setFlashReportDeviceName(d.Model)
	} else {
		product := a.getFastbootVar(d.Serial, "product")
		if product != "" && product != "--" {
			a.setFlashReportDeviceName(product)
		} else {
			a.setFlashReportDeviceName(d.Serial)
		}
	}

	// Phân loại file dựa trên query thực tế từ thiết bị.
	// Giữ nguyên chiến lược nhóm hiện tại:
	// - logical -> FastbootD
	// - physicalPartitions -> Bootloader
	// - file lạ / firmware OnePlus -> ưu tiên FastbootD theo logic hiện có
	for _, item := range files {
		if strings.TrimSpace(item.Path) == "" {
			continue
		}

		item.Partition = strings.ToLower(strings.TrimSpace(item.Partition))
		if item.Partition == "" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf("!!! Bỏ qua file không có partition: %s", item.Path))
			continue
		}

		baseName := item.Partition
		if strings.HasSuffix(baseName, "_a") || strings.HasSuffix(baseName, "_b") {
			baseName = baseName[:len(baseName)-2]
		}

		isLogical := false

		res := a.getFastbootVar(d.Serial, "is-logical:"+item.Partition)
		if strings.TrimSpace(strings.ToLower(res)) == "yes" {
			isLogical = true
		} else {
			resA := a.getFastbootVar(d.Serial, "is-logical:"+item.Partition+"_a")
			if strings.TrimSpace(strings.ToLower(resA)) == "yes" {
				isLogical = true
			}
		}

		if isLogical {
			listFBD = append(listFBD, flashPlanItem{PartitionItem: item, Logical: true})
		} else if physicalPartitions[baseName] {
			listBL = append(listBL, item)
		} else {
			// OnePlus firmware / file lạ: giữ nguyên logic hiện tại của anh -> ưu tiên FastbootD.
			listFBD = append(listFBD, flashPlanItem{PartitionItem: item, Logical: false})
		}
	}

	totalFiles := len(listBL) + len(listFBD)
	if totalFiles == 0 {
		return fmt.Errorf("không có file IMG hợp lệ để flash")
	}

	processed := 0

	// NẠP BOOTLOADER TRƯỚC — sau khi đã query/phân loại ở FastbootD.
	if len(listBL) > 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "----------------------------------------")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [NHÓM 1] Về Bootloader nạp %d file vật lý...", len(listBL)))

		if err := a.RebootBootloader(); err != nil {
			return err
		}
		if err := a.waitForSpecificMode("bootloader"); err != nil {
			return err
		}
		// Stability delay is now handled inside waitForSpecificMode (ModeStabilityDelay = 4s)

		d = a.CheckDevice()
		if strings.TrimSpace(d.Serial) == "" {
			return fmt.Errorf("không đọc được serial ở Bootloader")
		}

		for _, item := range listBL {
			// Check for cancel before each partition flash
			if a.isFlashCancelled() {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
				a.finishFlashReport("cancelled")
				return fmt.Errorf("flash đã bị hủy bởi người dùng")
			}

			processed++
			wailsRuntime.EventsEmit(a.ctx, "flash_progress", int((float64(processed)/float64(totalFiles))*100))
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [Bootloader] Nạp %s", item.Partition))

			if item.Partition == "super_empty" {
				if err := a.RunCommandStreaming("", fastbootBin, "-s", d.Serial, "wipe-super", item.Path); err != nil {
					a.logFlashError(item.Partition, "Bootloader", err)
					a.markFlashFailure(fmt.Sprintf("wipe-super thất bại với %s: %v", item.Path, err))
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("wipe-super thất bại với %s: %v", item.Path, err)
				}
			} else {
				if err := a.RunCommandStreaming("", fastbootBin, "-s", d.Serial, "flash", item.Partition, item.Path); err != nil {
					a.logFlashError(item.Partition, "Bootloader", err)
					a.markFlashFailure(fmt.Sprintf("flash %s thất bại ở Bootloader: %v", item.Partition, err))
					wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
					return fmt.Errorf("flash %s thất bại ở Bootloader: %v", item.Partition, err)
				}
			}
			a.markFlashPartition(item.Partition)

			time.Sleep(300 * time.Millisecond)
		}
	}

	// NẠP FASTBOOTD SAU — giữ nguyên logic phân loại nhóm hiện tại.
	if len(listFBD) > 0 {
		wailsRuntime.EventsEmit(a.ctx, "flash_log", "----------------------------------------")
		wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [NHÓM 2] Sang FastbootD nạp %d file logical/firmware...", len(listFBD)))

		d = a.CheckDevice()
		if d.State != "fastbootd" {
			wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Thiết bị chưa ở FastbootD. Đang chuyển sang FastbootD...")
			if err := a.RebootFastbootD(); err != nil {
				return err
			}
			if err := a.waitForSpecificMode("fastbootd"); err != nil {
				return err
			}
			// Stability delay is now handled inside waitForSpecificMode (ModeStabilityDelay = 4s)
			d = a.CheckDevice()
		}

		if strings.TrimSpace(d.Serial) == "" {
			return fmt.Errorf("không đọc được serial ở FastbootD")
		}

		// Sau khi máy báo FastbootD, chờ thêm một nhịp trước lệnh flash đầu tiên.
		// Một số máy/driver báo connected sớm hơn thời điểm fastbootd service sẵn sàng nhận flash.
		time.Sleep(2 * time.Second)

		for _, item := range listFBD {
			// Check for cancel before each partition flash
			if a.isFlashCancelled() {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> Đã dừng flash theo yêu cầu người dùng.")
				a.finishFlashReport("cancelled")
				return fmt.Errorf("flash đã bị hủy bởi người dùng")
			}

			processed++
			wailsRuntime.EventsEmit(a.ctx, "flash_progress", int((float64(processed)/float64(totalFiles))*100))
			wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf(">>> [FastbootD] Nạp %s", item.Partition))

			errDirect := a.RunCommandStreaming("", fastbootBin, "-s", d.Serial, "flash", item.Partition, item.Path)
			if errDirect != nil && !item.Logical {
				wailsRuntime.EventsEmit(a.ctx, "flash_log", fmt.Sprintf("!!! [FastbootD] flash trực tiếp thất bại với %s. Thử --slot=all cho non-logical/firmware...", item.Partition))
				errSlotAll := a.RunCommandStreaming("", fastbootBin, "-s", d.Serial, "flash", "--slot=all", item.Partition, item.Path)
				if errSlotAll == nil {
					errDirect = nil
				} else {
					errDirect = fmt.Errorf("direct: %v | slot=all: %v", errDirect, errSlotAll)
				}
			}
			if errDirect != nil {
				a.logFlashError(item.Partition, "FastbootD", errDirect)
				a.markFlashFailure(fmt.Sprintf("flash %s thất bại ở FastbootD: %v", item.Partition, errDirect))
				wailsRuntime.EventsEmit(a.ctx, "flash_complete", false)
				return fmt.Errorf("flash %s thất bại ở FastbootD: %v", item.Partition, errDirect)
			}
			a.markFlashPartition(item.Partition)

			time.Sleep(300 * time.Millisecond)
		}
	}

	wailsRuntime.EventsEmit(a.ctx, "flash_progress", 100)
	wailsRuntime.EventsEmit(a.ctx, "flash_log", "========================================")
	wailsRuntime.EventsEmit(a.ctx, "flash_log", ">>> TẤT CẢ QUY TRÌNH ĐÃ HOÀN TẤT!")
	a.NotifyUI("success", "Đã nạp xong toàn bộ an toàn!")
	a.finishFlashReport("success")
	wailsRuntime.EventsEmit(a.ctx, "flash_complete", true)
	return nil
}
