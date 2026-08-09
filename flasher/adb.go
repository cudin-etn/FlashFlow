package flasher

import (
	"bytes"
	"errors"
	"os/exec"
	"strings"
)

// Device chứa thông tin thiết bị đầy đủ để khớp với Dashboard mới
type Device struct {
	Serial  string `json:"serial"`
	State   string `json:"state"` // device / recovery / fastboot / sideload
	Model   string `json:"model,omitempty"`
	OS      string `json:"os"`      // Phiên bản Android
	Build   string `json:"build"`   // Số bản dựng
	Battery string `json:"battery"` // Phần trăm pin
	Slot    string `json:"slot"`    // Slot A/B (Fastboot)
}

// runCommand chạy lệnh và lấy kết quả string (có ẩn cửa sổ)
// IMPORTANT: serialized to avoid adb/fastboot contention.
func runCommand(name string, args ...string) (string, error) {
	ToolsLock()
	defer ToolsUnlock()

	cmd := exec.Command(name, args...)
	cmd.SysProcAttr = getSysProcAttr() // Ẩn cửa sổ CMD trên Windows

	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out

	err := cmd.Run()
	if err != nil {
		output := strings.TrimSpace(out.String())
		if output != "" {
			return "", errors.New(output)
		}
		return "", err
	}
	return strings.TrimSpace(out.String()), nil
}

// CheckCommandExists kiểm tra tool path đang dùng bởi Runner.
func (r *Runner) CheckCommandExists(name string) bool {
	toolPath := name
	switch strings.ToLower(name) {
	case "adb", "adb.exe":
		toolPath = r.adbPath()
	case "fastboot", "fastboot.exe":
		toolPath = r.fastbootPath()
	}

	if strings.ContainsAny(toolPath, `/\`) {
		_, err := exec.LookPath(toolPath)
		return err == nil
	}

	_, err := exec.LookPath(toolPath)
	return err == nil
}

// ListADBDevices lấy danh sách thiết bị qua ADB
func (r *Runner) ListADBDevices() ([]Device, error) {
	adbPath := r.adbPath()
	if !r.CheckCommandExists("adb") {
		return nil, errors.New("adb not found: " + adbPath)
	}

	out, err := runCommand(adbPath, "devices", "-l")
	if err != nil {
		return nil, err
	}
	return parseADBOutput(out), nil
}

// ListFastbootDevices lấy danh sách thiết bị qua Fastboot
func (r *Runner) ListFastbootDevices() ([]Device, error) {
	fastbootPath := r.fastbootPath()
	if !r.CheckCommandExists("fastboot") {
		return nil, errors.New("fastboot not found: " + fastbootPath)
	}

	out, err := runCommand(fastbootPath, "devices")
	if err != nil {
		return nil, err
	}
	return parseFastbootOutput(out), nil
}

// --- Các hàm xử lý chuỗi (Parser) ---

func parseADBOutput(output string) []Device {
	var devs []Device
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if line == "" || strings.HasPrefix(line, "List of devices") {
			continue
		}

		fields := strings.Fields(line)
		if len(fields) >= 2 {
			d := Device{
				Serial: fields[0],
				State:  fields[1],
				Model:  "Android Device",
			}

			for _, f := range fields {
				if strings.HasPrefix(f, "model:") {
					modelName := strings.ReplaceAll(strings.TrimPrefix(f, "model:"), "_", " ")
					d.Model = modelName
				}
			}
			devs = append(devs, d)
		}
	}
	return devs
}

func parseFastbootOutput(output string) []Device {
	var devs []Device
	lines := strings.Split(output, "\n")
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) >= 2 {
			devs = append(devs, Device{
				Serial: fields[0],
				State:  "fastboot",
				Model:  "Fastboot Device",
			})
		}
	}
	return devs
}
