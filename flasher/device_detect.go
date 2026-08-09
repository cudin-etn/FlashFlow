package flasher

import (
	"strings"
)

var deviceDetectADBPath = "adb"
var deviceDetectFastbootPath = "fastboot"

func SetDeviceDetectToolPaths(adbPath, fastbootPath string) {
	if strings.TrimSpace(adbPath) != "" {
		deviceDetectADBPath = adbPath
	}
	if strings.TrimSpace(fastbootPath) != "" {
		deviceDetectFastbootPath = fastbootPath
	}
}

func detectADBPath() string {
	if strings.TrimSpace(deviceDetectADBPath) == "" {
		return "adb"
	}
	return deviceDetectADBPath
}

func detectFastbootPath() string {
	if strings.TrimSpace(deviceDetectFastbootPath) == "" {
		return "fastboot"
	}
	return deviceDetectFastbootPath
}

type DeviceCaps struct {
	// Identity
	Vendor  string // google | oneplus | xiaomi | unknown
	Brand   string
	Product string
	Device  string

	// Connection state
	HasADB      bool
	HasFastboot bool
	IsFastbootD bool

	// Capabilities
	SupportsFastbootD   bool
	SupportsPayloadDump bool

	// Runtime info
	Slot     string // a / b / unknown
	Unlocked bool

	// System info (ADB only)
	AndroidVersion string
	BuildID        string
	BatteryLevel   string
}

// ================= PUBLIC ENTRY =================

func DetectDeviceCaps() (*DeviceCaps, error) {
	caps := &DeviceCaps{
		Vendor: "unknown",
		Slot:   "unknown",
	}

	// 1. Prefer ADB (system running)
	if adbAvailable() {
		fillFromADB(caps)
		return caps, nil
	}

	// 2. Fallback to fastboot / fastbootD
	if fastbootAvailable() {
		fillFromFastboot(caps)
		return caps, nil
	}

	return caps, nil
}

// ================= ADB =================

func fillFromADB(c *DeviceCaps) {
	c.HasADB = true

	c.Brand = adbGetProp("ro.product.brand")
	c.Vendor = adbGetProp("ro.product.manufacturer")
	c.Device = adbGetProp("ro.product.device")
	c.Product = adbGetProp("ro.product.model")

	c.AndroidVersion = adbGetProp("ro.build.version.release")
	c.BuildID = adbGetProp("ro.build.id")
	c.BatteryLevel = adbBatteryLevel()

	normalizeVendor(c)
	deriveCapabilities(c)
}

// ================= FASTBOOT =================

func fillFromFastboot(c *DeviceCaps) {
	c.HasFastboot = true

	c.Product = fastbootGetVar("product")
	c.Slot = normalizeSlot(fastbootGetVar("current-slot"))
	c.Unlocked = fastbootGetVar("unlocked") == "yes"

	if fastbootGetVar("is-userspace") == "yes" {
		c.IsFastbootD = true
	}

	// Vendor inference (best-effort)
	lower := strings.ToLower(c.Product)
	switch {
	case strings.Contains(lower, "pixel"):
		c.Vendor = "google"
	case strings.HasPrefix(lower, "op") || strings.Contains(lower, "oneplus"):
		c.Vendor = "oneplus"
	default:
		c.Vendor = "unknown"
	}

	deriveCapabilities(c)
}

// ================= CAPABILITY =================

func normalizeVendor(c *DeviceCaps) {
	v := strings.ToLower(c.Vendor)
	switch {
	case strings.Contains(v, "google"):
		c.Vendor = "google"
	case strings.Contains(v, "oneplus"):
		c.Vendor = "oneplus"
	case strings.Contains(v, "xiaomi"):
		c.Vendor = "xiaomi"
	default:
		c.Vendor = "unknown"
	}
}

func deriveCapabilities(c *DeviceCaps) {
	switch c.Vendor {
	case "oneplus":
		c.SupportsFastbootD = true
		c.SupportsPayloadDump = true
	case "google":
		c.SupportsFastbootD = false
		c.SupportsPayloadDump = false
	default:
		c.SupportsFastbootD = false
		c.SupportsPayloadDump = false
	}
}

func normalizeSlot(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "_")
	if s == "a" || s == "b" {
		return s
	}
	return "unknown"
}

// ================= LOW LEVEL =================

func adbAvailable() bool {
	out, err := runCommand(detectADBPath(), "get-state")
	if err != nil {
		return false
	}
	return strings.Contains(out, "device")
}

func fastbootAvailable() bool {
	out, err := runCommand(detectFastbootPath(), "devices")
	if err != nil {
		return false
	}
	return strings.TrimSpace(out) != ""
}

func adbGetProp(prop string) string {
	out, err := runCommand(detectADBPath(), "shell", "getprop", prop)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

func adbBatteryLevel() string {
	out, err := runCommand(detectADBPath(), "shell", "dumpsys", "battery")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(out, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "level:") {
			return strings.TrimSpace(strings.TrimPrefix(line, "level:"))
		}
	}
	return ""
}

func fastbootGetVar(name string) string {
	out, err := runCommand(detectFastbootPath(), "getvar", name)
	if err != nil {
		return ""
	}
	// fastboot format: "name: value"
	parts := strings.Split(out, ":")
	if len(parts) == 2 {
		return strings.TrimSpace(parts[1])
	}
	return ""
}
