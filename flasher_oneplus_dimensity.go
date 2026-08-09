package main

import "strings"

type onePlusPlatformFamily string

const (
	onePlusPlatformUnknown  onePlusPlatformFamily = "unknown"
	onePlusPlatformQualcomm onePlusPlatformFamily = "qualcomm"
	onePlusPlatformMediaTek onePlusPlatformFamily = "mediatek"
)

type onePlusPlatformInfo struct {
	Family   onePlusPlatformFamily
	SoC      string
	Board    string
	Device   string
	Product  string
	Evidence string
}

// Level-1 Dimensity support preserves early MediaTek firmware. These images
// require an exact per-model profile and are not part of the generic Android
// boot/dynamic-partition flow.
var onePlusMTKProtectedPartitions = map[string]bool{
	"preloader": true,
	"lk":        true,
	"lk2":       true,
	"md1img":    true,
	"scp":       true,
	"scp1":      true,
	"scp2":      true,
	"sspm":      true,
	"sspm_1":    true,
	"sspm_2":    true,
	"spmfw":     true,
	"mcupm":     true,
	"dpm":       true,
	"gz":        true,
	"gz1":       true,
	"gz2":       true,
	"tee":       true,
	"tee1":      true,
	"tee2":      true,
	"pi_img":    true,
}

func isOnePlusMTKProtectedPartition(part string) bool {
	return onePlusMTKProtectedPartitions[normalizeOnePlusPartition(part)]
}

func shouldPreserveOnePlusMTKPartition(platform onePlusPlatformInfo, part string) bool {
	part = normalizeOnePlusPartition(part)
	if part == "preloader" {
		return true
	}
	return platform.Family == onePlusPlatformMediaTek && onePlusMTKProtectedPartitions[part]
}

func classifyOnePlusPlatform(socManufacturer, socModel, board, device string) onePlusPlatformInfo {
	joined := strings.ToLower(strings.Join([]string{socManufacturer, socModel, board}, " "))
	info := onePlusPlatformInfo{
		Family: onePlusPlatformUnknown,
		SoC:    strings.TrimSpace(socModel),
		Board:  strings.TrimSpace(board),
		Device: strings.TrimSpace(device),
	}
	switch {
	case strings.Contains(joined, "mediatek"), strings.Contains(joined, "dimensity"), strings.Contains(joined, "mt68"), strings.Contains(joined, "mt69"):
		info.Family = onePlusPlatformMediaTek
		info.Evidence = "adb_soc"
	case strings.Contains(joined, "qualcomm"), strings.Contains(joined, "qcom"), strings.Contains(joined, "sm8"), strings.Contains(joined, "sm7"):
		info.Family = onePlusPlatformQualcomm
		info.Evidence = "adb_soc"
	}
	return info
}

func inferOnePlusPlatformFromImages(images []imgFile) onePlusPlatformInfo {
	for _, image := range images {
		part := normalizeOnePlusPartition(image.Part)
		if onePlusMTKProtectedPartitions[part] {
			return onePlusPlatformInfo{Family: onePlusPlatformMediaTek, Evidence: "rom_partition:" + part}
		}
	}
	for _, image := range images {
		part := normalizeOnePlusPartition(image.Part)
		if part == "xbl" || part == "abl" || part == "xbl_config" {
			return onePlusPlatformInfo{Family: onePlusPlatformQualcomm, Evidence: "rom_partition:" + part}
		}
	}
	return onePlusPlatformInfo{Family: onePlusPlatformUnknown}
}

func mergeOnePlusPlatformInfo(primary, fallback onePlusPlatformInfo) onePlusPlatformInfo {
	if primary.Family == onePlusPlatformUnknown {
		primary.Family = fallback.Family
		primary.Evidence = fallback.Evidence
	}
	if primary.SoC == "" {
		primary.SoC = fallback.SoC
	}
	if primary.Board == "" {
		primary.Board = fallback.Board
	}
	if primary.Device == "" {
		primary.Device = fallback.Device
	}
	if primary.Product == "" {
		primary.Product = fallback.Product
	}
	return primary
}

func (a *App) captureOnePlusPlatformFromADB(serial string) {
	info := classifyOnePlusPlatform(
		a.getAdbProp(serial, "ro.soc.manufacturer"),
		a.getAdbProp(serial, "ro.soc.model"),
		a.getAdbProp(serial, "ro.board.platform"),
		a.getAdbProp(serial, "ro.product.device"),
	)
	a.onePlusPlatformMu.Lock()
	a.onePlusPlatform = info
	a.onePlusPlatformMu.Unlock()
}

func (a *App) resetOnePlusPlatform() {
	a.onePlusPlatformMu.Lock()
	a.onePlusPlatform = onePlusPlatformInfo{Family: onePlusPlatformUnknown}
	a.onePlusPlatformMu.Unlock()
}

func (a *App) currentOnePlusPlatform() onePlusPlatformInfo {
	a.onePlusPlatformMu.RLock()
	defer a.onePlusPlatformMu.RUnlock()
	return a.onePlusPlatform
}
