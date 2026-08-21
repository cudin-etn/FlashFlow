package flasher

import "testing"

func TestParseADBOutputIgnoresDaemonStartupMessages(t *testing.T) {
	output := `* daemon not running; starting now at tcp:5037
* daemon started successfully
List of devices attached
`

	if got := parseADBOutput(output); len(got) != 0 {
		t.Fatalf("parseADBOutput returned %d false devices: %#v", len(got), got)
	}
}

func TestParseADBOutputKeepsValidDeviceStates(t *testing.T) {
	output := `List of devices attached
R58N1234567 device product:foo model:Pixel_8 device:shiba transport_id:1
R58N7654321 unauthorized transport_id:2
`

	got := parseADBOutput(output)
	if len(got) != 2 {
		t.Fatalf("parseADBOutput returned %d devices, want 2: %#v", len(got), got)
	}
	if got[0].Serial != "R58N1234567" || got[0].State != "device" || got[0].Model != "Pixel 8" {
		t.Fatalf("first device = %#v", got[0])
	}
	if got[1].State != "unauthorized" {
		t.Fatalf("second device state = %q, want unauthorized", got[1].State)
	}
}
