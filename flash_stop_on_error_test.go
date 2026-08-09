package main

import (
	"testing"
)

// TestFlashErrorSuggestion_PartitionNotFound verifies suggestion for "partition not found" errors.
func TestFlashErrorSuggestion_PartitionNotFound(t *testing.T) {
	cases := []string{
		"FAILED (remote: 'Partition not found')",
		"error: no such partition",
		"partition not found: system_ext",
	}
	for _, errMsg := range cases {
		suggestion := flashErrorSuggestion(errMsg)
		if suggestion == "" {
			t.Errorf("expected suggestion for error %q, got empty string", errMsg)
		}
		if suggestion == "" {
			continue
		}
		// Should mention checking partition name
		if !containsAny(suggestion, "partition", "tên partition") {
			t.Errorf("suggestion for %q should mention partition name check, got: %s", errMsg, suggestion)
		}
	}
}

// TestFlashErrorSuggestion_FailedRemote verifies suggestion for "FAILED (remote)" errors.
func TestFlashErrorSuggestion_FailedRemote(t *testing.T) {
	cases := []string{
		"FAILED (remote: 'unknown command')",
		"remote failure: device locked",
		"FAILED (remote)",
	}
	for _, errMsg := range cases {
		suggestion := flashErrorSuggestion(errMsg)
		if suggestion == "" {
			t.Errorf("expected suggestion for error %q, got empty string", errMsg)
		}
		if suggestion == "" {
			continue
		}
		// Should mention USB
		if !containsAny(suggestion, "USB", "usb") {
			t.Errorf("suggestion for %q should mention USB, got: %s", errMsg, suggestion)
		}
	}
}

// TestFlashErrorSuggestion_SparseNotAllowed verifies suggestion for sparse errors.
func TestFlashErrorSuggestion_SparseNotAllowed(t *testing.T) {
	cases := []string{
		"sparse not allowed on this partition",
		"error: cannot flash sparse image",
	}
	for _, errMsg := range cases {
		suggestion := flashErrorSuggestion(errMsg)
		if suggestion == "" {
			t.Errorf("expected suggestion for error %q, got empty string", errMsg)
		}
		if suggestion == "" {
			continue
		}
		// Should mention sparse/non-sparse
		if !containsAny(suggestion, "sparse", "non-sparse") {
			t.Errorf("suggestion for %q should mention sparse, got: %s", errMsg, suggestion)
		}
	}
}

// TestFlashErrorSuggestion_UnknownError verifies no suggestion for unknown errors.
func TestFlashErrorSuggestion_UnknownError(t *testing.T) {
	cases := []string{
		"some random error",
		"exit status 1",
		"",
	}
	for _, errMsg := range cases {
		suggestion := flashErrorSuggestion(errMsg)
		if suggestion != "" {
			t.Errorf("expected empty suggestion for unknown error %q, got: %s", errMsg, suggestion)
		}
	}
}

// TestFlashErrorSuggestion_Timeout verifies suggestion for timeout errors.
func TestFlashErrorSuggestion_Timeout(t *testing.T) {
	errMsg := "lệnh timeout (60s): fastboot flash boot_a"
	suggestion := flashErrorSuggestion(errMsg)
	if suggestion == "" {
		t.Errorf("expected suggestion for timeout error, got empty string")
	}
}

// containsAny checks if s contains any of the substrings.
func containsAny(s string, subs ...string) bool {
	for _, sub := range subs {
		if len(sub) > 0 && len(s) >= len(sub) {
			for i := 0; i <= len(s)-len(sub); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
		}
	}
	return false
}
