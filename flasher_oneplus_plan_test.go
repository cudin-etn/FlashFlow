package main

import (
	"reflect"
	"testing"
)

func TestNormalizeOnePlusPartition(t *testing.T) {
	cases := map[string]string{
		"boot":            "boot",
		"BOOT_A":          "boot",
		"xbl_config_b":    "xbl_config",
		"vendor_boot.img": "vendor_boot",
	}
	for input, want := range cases {
		if got := normalizeOnePlusPartition(input); got != want {
			t.Fatalf("normalize %q = %q, want %q", input, got, want)
		}
	}
}

func TestBuildOnePlusFlashArgs(t *testing.T) {
	tests := []struct {
		name    string
		policy  onePlusSlotPolicy
		hasSlot bool
		want    [][]string
	}{
		{
			name: "boot both slots", policy: onePlusBootAB, hasSlot: true,
			want: [][]string{{"-s", "SERIAL", "flash", "boot_a", "/rom/boot.img"}, {"-s", "SERIAL", "flash", "boot_b", "/rom/boot.img"}},
		},
		{
			name: "slotless boot direct", policy: onePlusBootAB, hasSlot: false,
			want: [][]string{{"-s", "SERIAL", "flash", "boot", "/rom/boot.img"}},
		},
		{
			name: "target A", policy: onePlusTargetA, hasSlot: true,
			want: [][]string{{"-s", "SERIAL", "--slot=a", "flash", "system", "/rom/boot.img"}},
		},
		{
			name: "target A slotless becomes direct", policy: onePlusTargetA, hasSlot: false,
			want: [][]string{{"-s", "SERIAL", "flash", "system", "/rom/boot.img"}},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := buildOnePlusFlashArgs("SERIAL", "system", "/rom/boot.img", test.policy, test.hasSlot)
			if test.policy == onePlusBootAB {
				got = buildOnePlusFlashArgs("SERIAL", "boot", "/rom/boot.img", test.policy, test.hasSlot)
			}
			if !reflect.DeepEqual(got, test.want) {
				t.Fatalf("got %#v, want %#v", got, test.want)
			}
		})
	}
}

func TestOnePlusFastbootDSlotPolicy(t *testing.T) {
	tests := []struct {
		name    string
		part    string
		logical bool
		want    onePlusSlotPolicy
	}{
		{name: "declared logical partition", part: "system", logical: true, want: onePlusDirect},
		{name: "OnePlus logical partition", part: "my_bigball", logical: false, want: onePlusDirect},
		{name: "firmware remains target A", part: "abl", logical: false, want: onePlusTargetA},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := onePlusFastbootDSlotPolicy(test.part, test.logical); got != test.want {
				t.Fatalf("onePlusFastbootDSlotPolicy(%q, %t) = %v, want %v", test.part, test.logical, got, test.want)
			}
		})
	}
}

func TestDimensitySafeModeClassification(t *testing.T) {
	info := classifyOnePlusPlatform("MediaTek", "Dimensity 9000", "mt6983", "device")
	if info.Family != onePlusPlatformMediaTek {
		t.Fatalf("expected MediaTek, got %s", info.Family)
	}
	romInfo := inferOnePlusPlatformFromImages([]imgFile{{Part: "preloader"}})
	if romInfo.Family != onePlusPlatformMediaTek {
		t.Fatalf("preloader should select MediaTek safe mode")
	}
	if !isOnePlusMTKProtectedPartition("lk_a") || !isOnePlusMTKProtectedPartition("preloader") {
		t.Fatalf("MTK early firmware must be protected")
	}
	if !shouldPreserveOnePlusMTKPartition(info, "md1img") {
		t.Fatalf("Dimensity safe mode must preserve md1img")
	}
	if !shouldPreserveOnePlusMTKPartition(onePlusPlatformInfo{Family: onePlusPlatformUnknown}, "preloader") {
		t.Fatalf("preloader must be preserved even when platform detection is unavailable")
	}
}

func TestOnePlusARBPartitionNormalizesSlotSuffix(t *testing.T) {
	for _, part := range []string{"xbl", "xbl_a", "ABL_B", "xbl_config.img", "xbl_ramdump_b"} {
		if !isOnePlusARBPartition(part) {
			t.Fatalf("expected %q to be recognized as ARB partition", part)
		}
	}
}

func TestParseFastbootVarOutputWithBootloaderPrefix(t *testing.T) {
	cases := []string{
		"has-slot:boot: yes\nFinished. Total time: 0.001s",
		"(bootloader) has-slot:boot: yes\nOKAY",
	}
	for _, output := range cases {
		if got := parseFastbootVarOutput(output, "has-slot:boot"); got != "yes" {
			t.Fatalf("parseFastbootVarOutput() = %q, want yes", got)
		}
	}
}
