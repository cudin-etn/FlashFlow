package main

import "strings"

type onePlusSlotPolicy int

const (
	onePlusDirect onePlusSlotPolicy = iota
	onePlusTargetA
	onePlusBootAB
)

// normalizeOnePlusPartition accepts images named either boot.img or boot_a.img
// and returns the partition base name used by fastboot getvar/slot selection.
func normalizeOnePlusPartition(part string) string {
	part = strings.ToLower(strings.TrimSpace(part))
	part = strings.TrimSuffix(part, ".img")
	part = strings.TrimSuffix(strings.TrimSuffix(part, "_a"), "_b")
	return part
}

// buildOnePlusFlashArgs is deliberately pure so slot behaviour can be tested
// without an Android device. All commands are pinned to the selected serial.
func buildOnePlusFlashArgs(serial, part, imagePath string, policy onePlusSlotPolicy, hasSlot bool) [][]string {
	part = normalizeOnePlusPartition(part)
	prefix := []string{"-s", serial}
	direct := func(target string) []string {
		args := append([]string{}, prefix...)
		return append(args, "flash", target, imagePath)
	}

	if !hasSlot || policy == onePlusDirect {
		return [][]string{direct(part)}
	}

	if policy == onePlusBootAB {
		return [][]string{direct(part + "_a"), direct(part + "_b")}
	}

	args := append([]string{}, prefix...)
	args = append(args, "--slot=a", "flash", part, imagePath)
	return [][]string{args}
}

// onePlusFastbootDSlotPolicy keeps logical partitions on their real FastbootD
// names.  A/B applies to boot and selected physical firmware partitions, not
// blindly to every logical image extracted from a payload.
func onePlusFastbootDSlotPolicy(part string, logical bool) onePlusSlotPolicy {
	if logical || isOnePlusLogicalPartition(part) {
		return onePlusDirect
	}
	return onePlusTargetA
}

func onePlusFastbootArgs(serial string, args ...string) []string {
	result := []string{"-s", serial}
	return append(result, args...)
}

func (a *App) queryOnePlusHasSlot(serial, part string) (hasSlot bool, known bool) {
	value := strings.ToLower(strings.TrimSpace(a.getFastbootVar(serial, "has-slot:"+normalizeOnePlusPartition(part))))
	switch value {
	case "yes":
		return true, true
	case "no":
		return false, true
	default:
		return false, false
	}
}
