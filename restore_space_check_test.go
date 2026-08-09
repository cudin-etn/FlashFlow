package main

import (
	"testing"
)

// TestParseDfAvailableBytes tests the parsing of "adb shell df /data" output.
func TestParseDfAvailableBytes(t *testing.T) {
	tests := []struct {
		name      string
		output    string
		wantBytes int64
		wantErr   bool
	}{
		{
			name: "standard df output",
			output: `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/block/dm-8  123456789 98765432  24691357  80% /data`,
			wantBytes: 24691357 * 1024,
			wantErr:   false,
		},
		{
			name: "df output with extra spaces",
			output: `Filesystem           1K-blocks      Used Available Use% Mounted on
/dev/block/bootdevice/by-name/userdata  55742720  30123456  25619264  55% /data`,
			wantBytes: 25619264 * 1024,
			wantErr:   false,
		},
		{
			name: "df output with small available space",
			output: `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/block/dm-8  123456789 123000000    456789   1% /data`,
			wantBytes: 456789 * 1024,
			wantErr:   false,
		},
		{
			name:    "empty output",
			output:  "",
			wantErr: true,
		},
		{
			name:    "header only",
			output:  "Filesystem     1K-blocks    Used Available Use% Mounted on",
			wantErr: true,
		},
		{
			name: "no /data line",
			output: `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/block/dm-0  10000000  5000000   5000000  50% /system`,
			wantErr: true,
		},
		{
			name: "multiple lines with /data",
			output: `Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/block/dm-0  10000000  5000000   5000000  50% /system
/dev/block/dm-8  123456789 98765432  24691357  80% /data`,
			wantBytes: 24691357 * 1024,
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseDfAvailableBytes(tt.output)
			if tt.wantErr {
				if err == nil {
					t.Errorf("parseDfAvailableBytes() expected error, got nil (value=%d)", got)
				}
				return
			}
			if err != nil {
				t.Errorf("parseDfAvailableBytes() unexpected error: %v", err)
				return
			}
			if got != tt.wantBytes {
				t.Errorf("parseDfAvailableBytes() = %d, want %d", got, tt.wantBytes)
			}
		})
	}
}
