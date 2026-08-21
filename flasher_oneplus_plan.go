package main

import "strings"

type onePlusSlotPolicy int

const (
	onePlusDirect onePlusSlotPolicy = iota
	onePlusTargetA
	onePlusBootAB
)

type onePlusLogicalProvisionStep struct {
	Label         string
	Args          []string
	IgnoreFailure bool
}

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

// shouldFlashOnePlusImageAfterSuper prevents loose logical images from being
// written on top of a super.img-defined layout. Physical firmware that was not
// already handled in bootloader remains eligible for the FastbootD phase.
func shouldFlashOnePlusImageAfterSuper(part string) bool {
	part = normalizeOnePlusPartition(part)
	return part != "super" && !BootloaderFiles[part] && !isOnePlusLogicalPartition(part)
}

// buildOnePlusLogicalProvisionPlan mirrors the reference OnePlus
// Regional/Universal flasher for loose-image packages (no super.img): remove
// stale A/B and snapshot-COW entries, create minimal A/B logical partitions,
// and flash the full image only once into slot A.
func buildOnePlusLogicalProvisionPlan(serial, part, imagePath string) []onePlusLogicalProvisionStep {
	part = normalizeOnePlusPartition(part)
	prefix := []string{"-s", serial}
	withPrefix := func(args ...string) []string {
		result := append([]string{}, prefix...)
		return append(result, args...)
	}

	steps := make([]onePlusLogicalProvisionStep, 0, 7)
	for _, target := range []string{part + "_a", part + "_b", part + "_a-cow", part + "_b-cow"} {
		steps = append(steps, onePlusLogicalProvisionStep{
			Label:         "delete",
			Args:          withPrefix("delete-logical-partition", target),
			IgnoreFailure: true,
		})
	}
	steps = append(steps,
		onePlusLogicalProvisionStep{Label: "create-a", Args: withPrefix("create-logical-partition", part+"_a", "1")},
		onePlusLogicalProvisionStep{Label: "create-b", Args: withPrefix("create-logical-partition", part+"_b", "1")},
		onePlusLogicalProvisionStep{Label: "flash-a", Args: withPrefix("flash", part+"_a", imagePath)},
	)
	return steps
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
