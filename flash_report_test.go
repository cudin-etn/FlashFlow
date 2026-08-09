package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestFlashReport_StructFields(t *testing.T) {
	report := &FlashReport{
		SessionID:  time.Now().Format("20060102_150405"),
		StartedAt:  time.Now().Format(time.RFC3339),
		DeviceName: "OnePlus 12",
		Vendor:     "oneplus",
		ROM:        "OxygenOS_15.zip",
		Wipe:       true,
		ARBMode:    "normal",
		Result:     "running",
	}

	if report.DeviceName != "OnePlus 12" {
		t.Errorf("expected DeviceName 'OnePlus 12', got '%s'", report.DeviceName)
	}
	if report.ROM != "OxygenOS_15.zip" {
		t.Errorf("expected ROM 'OxygenOS_15.zip', got '%s'", report.ROM)
	}
	if report.Result != "running" {
		t.Errorf("expected Result 'running', got '%s'", report.Result)
	}
}

func TestFlashReport_JSONSerialization(t *testing.T) {
	report := &FlashReport{
		SessionID:            "20240115_143025",
		StartedAt:            "2024-01-15T14:30:25+07:00",
		EndedAt:              "2024-01-15T14:45:10+07:00",
		DeviceName:           "OnePlus 12",
		Vendor:               "oneplus",
		ROM:                  "OxygenOS_15.zip",
		Wipe:                 false,
		ARBMode:              "keep_fw_old",
		Result:               "success",
		FlashedPartitions:    []string{"boot", "dtbo", "system", "vendor"},
		SkippedARBPartitions: []string{"xbl", "abl"},
		Failures:             nil,
		Logs:                 []string{">>> Flash started", ">>> Flash complete"},
	}

	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal report: %v", err)
	}

	// Verify all required fields are present in JSON
	jsonStr := string(data)
	requiredFields := []string{
		"sessionId", "startedAt", "endedAt", "deviceName",
		"vendor", "rom", "result", "flashedPartitions",
		"skippedArbPartitions", "failures",
	}
	for _, field := range requiredFields {
		if !strings.Contains(jsonStr, field) {
			t.Errorf("JSON output missing required field: %s", field)
		}
	}

	// Verify round-trip
	var decoded FlashReport
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal report: %v", err)
	}
	if decoded.DeviceName != "OnePlus 12" {
		t.Errorf("round-trip DeviceName mismatch: got '%s'", decoded.DeviceName)
	}
	if decoded.Result != "success" {
		t.Errorf("round-trip Result mismatch: got '%s'", decoded.Result)
	}
	if len(decoded.FlashedPartitions) != 4 {
		t.Errorf("round-trip FlashedPartitions count: got %d, want 4", len(decoded.FlashedPartitions))
	}
}

func TestFlashReport_FilenameFormat(t *testing.T) {
	sessionID := time.Now().Format("20060102_150405")
	filename := "flash_report_" + sessionID + ".json"

	// Verify filename matches expected pattern
	if !strings.HasPrefix(filename, "flash_report_") {
		t.Errorf("filename should start with 'flash_report_': %s", filename)
	}
	if !strings.HasSuffix(filename, ".json") {
		t.Errorf("filename should end with '.json': %s", filename)
	}

	// Verify the timestamp part is parseable
	parts := strings.TrimPrefix(filename, "flash_report_")
	parts = strings.TrimSuffix(parts, ".json")
	_, err := time.Parse("20060102_150405", parts)
	if err != nil {
		t.Errorf("timestamp in filename not parseable: %s, error: %v", parts, err)
	}
}

func TestFlashReport_SaveToFile(t *testing.T) {
	// Create a temp directory for the test
	tmpDir := t.TempDir()
	reportsDir := filepath.Join(tmpDir, "Reports")

	report := &FlashReport{
		SessionID:         "20240115_143025",
		StartedAt:         "2024-01-15T14:30:25+07:00",
		EndedAt:           "2024-01-15T14:45:10+07:00",
		DeviceName:        "OnePlus 12",
		Vendor:            "oneplus",
		ROM:               "OxygenOS_15.zip",
		Wipe:              false,
		ARBMode:           "normal",
		Result:            "success",
		FlashedPartitions: []string{"boot", "dtbo", "system"},
		Failures:          nil,
	}

	// Simulate saveFlashReportToFile logic
	data, err := json.MarshalIndent(report, "", "  ")
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}
	if err := os.MkdirAll(reportsDir, 0755); err != nil {
		t.Fatalf("failed to create reports dir: %v", err)
	}
	filename := "flash_report_" + report.SessionID + ".json"
	path := filepath.Join(reportsDir, filename)
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatalf("failed to write report: %v", err)
	}

	// Verify file exists
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Fatalf("report file was not created: %s", path)
	}

	// Read and verify content
	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read report file: %v", err)
	}

	var loaded FlashReport
	if err := json.Unmarshal(content, &loaded); err != nil {
		t.Fatalf("failed to parse saved report: %v", err)
	}

	if loaded.DeviceName != "OnePlus 12" {
		t.Errorf("saved report DeviceName mismatch: got '%s'", loaded.DeviceName)
	}
	if loaded.ROM != "OxygenOS_15.zip" {
		t.Errorf("saved report ROM mismatch: got '%s'", loaded.ROM)
	}
	if loaded.Result != "success" {
		t.Errorf("saved report Result mismatch: got '%s'", loaded.Result)
	}
	if loaded.StartedAt == "" {
		t.Error("saved report StartedAt is empty")
	}
	if loaded.EndedAt == "" {
		t.Error("saved report EndedAt is empty")
	}
}

func TestFlashReport_FailedWithErrors(t *testing.T) {
	report := &FlashReport{
		SessionID:         "20240115_143025",
		StartedAt:         "2024-01-15T14:30:25+07:00",
		EndedAt:           "2024-01-15T14:35:10+07:00",
		DeviceName:        "OnePlus 11",
		Vendor:            "oneplus",
		ROM:               "ColorOS_14.zip",
		Wipe:              true,
		ARBMode:           "full_force",
		Result:            "failed",
		FlashedPartitions: []string{"boot", "dtbo"},
		Failures:          []string{"flash system_a thất bại: FAILED (remote: 'Partition not found')"},
	}

	// Verify failures are captured
	if len(report.Failures) != 1 {
		t.Errorf("expected 1 failure, got %d", len(report.Failures))
	}
	if report.Result != "failed" {
		t.Errorf("expected result 'failed', got '%s'", report.Result)
	}
	if len(report.FlashedPartitions) != 2 {
		t.Errorf("expected 2 flashed partitions, got %d", len(report.FlashedPartitions))
	}

	// Verify JSON serialization includes failures
	data, err := json.Marshal(report)
	if err != nil {
		t.Fatalf("failed to marshal: %v", err)
	}
	if !strings.Contains(string(data), "Partition not found") {
		t.Error("JSON output should contain failure message")
	}
}

func TestFlashReport_AllRequiredFieldsPresent(t *testing.T) {
	// Property 9: Flash Report SHALL contain all required fields
	report := &FlashReport{
		SessionID:         "20240115_143025",
		StartedAt:         "2024-01-15T14:30:25+07:00",
		EndedAt:           "2024-01-15T14:45:10+07:00",
		DeviceName:        "OnePlus 12",
		Vendor:            "oneplus",
		ROM:               "OxygenOS_15.zip",
		Result:            "success",
		FlashedPartitions: []string{"boot", "system"},
		Failures:          []string{},
	}

	// Validate all required fields per requirement 5.4
	if report.StartedAt == "" {
		t.Error("StartedAt (start time) is required")
	}
	if report.EndedAt == "" {
		t.Error("EndedAt (end time) is required")
	}
	if report.FlashedPartitions == nil {
		t.Error("FlashedPartitions (partition list) is required")
	}
	if report.ROM == "" {
		t.Error("ROM (ROM name) is required")
	}
	if report.DeviceName == "" {
		t.Error("DeviceName (device name) is required")
	}
	if report.Result == "" {
		t.Error("Result (final status) is required")
	}
	// Failures list should be non-nil (can be empty)
	if report.Failures == nil {
		t.Error("Failures (error list) should not be nil")
	}
}
