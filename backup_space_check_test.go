package main

import (
	"testing"

	"pgregory.net/rapid"
)

// Feature: flashflow-v2-upgrade, Property 1: Space Sufficiency
// **Validates: Requirements 1.4**
//
// For any pair (freeSpace, dataSize) with freeSpace > 0 and dataSize > 0,
// the space check SHALL return true when and only when freeSpace >= 1.5 * dataSize.
func TestProperty_SpaceSufficiency(t *testing.T) {
	rapid.Check(t, func(t *rapid.T) {
		freeSpace := rapid.Int64Range(1, 1<<40).Draw(t, "freeSpace")
		dataSize := rapid.Int64Range(1, 1<<39).Draw(t, "dataSize")

		result := isSpaceSufficient(freeSpace, dataSize)
		// Expected: freeSpace >= 1.5 * dataSize
		// Using integer arithmetic: 2*freeSpace >= 3*dataSize
		expected := 2*freeSpace >= 3*dataSize

		if result != expected {
			t.Fatalf("isSpaceSufficient(%d, %d) = %v, want %v",
				freeSpace, dataSize, result, expected)
		}
	})
}

// TestIsSpaceSufficient_EdgeCases tests specific edge cases for the space check.
func TestIsSpaceSufficient_EdgeCases(t *testing.T) {
	tests := []struct {
		name      string
		freeSpace int64
		dataSize  int64
		want      bool
	}{
		{
			name:      "exactly 1.5x - should pass",
			freeSpace: 150,
			dataSize:  100,
			want:      true,
		},
		{
			name:      "just below 1.5x - should fail",
			freeSpace: 149,
			dataSize:  100,
			want:      false,
		},
		{
			name:      "double the data - should pass",
			freeSpace: 200,
			dataSize:  100,
			want:      true,
		},
		{
			name:      "equal to data - should fail",
			freeSpace: 100,
			dataSize:  100,
			want:      false,
		},
		{
			name:      "minimum values",
			freeSpace: 1,
			dataSize:  1,
			want:      false,
		},
		{
			name:      "freeSpace=3, dataSize=2 - exactly 1.5x",
			freeSpace: 3,
			dataSize:  2,
			want:      true,
		},
		{
			name:      "large values - sufficient",
			freeSpace: 15 * 1024 * 1024 * 1024, // 15 GB
			dataSize:  10 * 1024 * 1024 * 1024,  // 10 GB
			want:      true,
		},
		{
			name:      "large values - insufficient",
			freeSpace: 14 * 1024 * 1024 * 1024, // 14 GB
			dataSize:  10 * 1024 * 1024 * 1024,  // 10 GB
			want:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isSpaceSufficient(tt.freeSpace, tt.dataSize)
			if got != tt.want {
				t.Errorf("isSpaceSufficient(%d, %d) = %v, want %v",
					tt.freeSpace, tt.dataSize, got, tt.want)
			}
		})
	}
}
