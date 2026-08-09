package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// FlashReportSummary is a lightweight view of a FlashReport for list display.
type FlashReportSummary struct {
	SessionID  string `json:"sessionId"`
	StartedAt  string `json:"startedAt"`
	EndedAt    string `json:"endedAt"`
	DeviceName string `json:"deviceName"`
	ROM        string `json:"rom"`
	Result     string `json:"result"`
	Vendor     string `json:"vendor"`
}

// GetFlashReports reads all report JSON files and returns summaries sorted by date descending.
func (a *App) GetFlashReports() []FlashReportSummary {
	reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
	entries, err := os.ReadDir(reportsDir)
	if err != nil {
		return []FlashReportSummary{}
	}

	var summaries []FlashReportSummary
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(reportsDir, entry.Name()))
		if err != nil {
			continue
		}
		var report FlashReport
		if err := json.Unmarshal(data, &report); err != nil {
			continue
		}
		summaries = append(summaries, FlashReportSummary{
			SessionID:  report.SessionID,
			StartedAt:  report.StartedAt,
			EndedAt:    report.EndedAt,
			DeviceName: report.DeviceName,
			ROM:        report.ROM,
			Result:     report.Result,
			Vendor:     report.Vendor,
		})
	}

	// Sort by StartedAt descending
	sort.Slice(summaries, func(i, j int) bool {
		return summaries[i].StartedAt > summaries[j].StartedAt
	})

	if summaries == nil {
		return []FlashReportSummary{}
	}
	return summaries
}

// GetFlashReportDetail returns the full report for a given session ID.
func (a *App) GetFlashReportDetail(sessionID string) (*FlashReport, error) {
	if sessionID == "" {
		return nil, fmt.Errorf("session ID is required")
	}
	// Validate: no path traversal
	if strings.Contains(sessionID, "/") || strings.Contains(sessionID, "\\") || strings.Contains(sessionID, "..") {
		return nil, fmt.Errorf("invalid session ID")
	}

	reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
	filename := fmt.Sprintf("flash_report_%s.json", sessionID)
	data, err := os.ReadFile(filepath.Join(reportsDir, filename))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("report not found: %s", sessionID)
		}
		return nil, fmt.Errorf("cannot read report: %w", err)
	}
	var report FlashReport
	if err := json.Unmarshal(data, &report); err != nil {
		return nil, fmt.Errorf("invalid report format: %w", err)
	}
	return &report, nil
}

// DeleteFlashReport removes a report file by session ID.
func (a *App) DeleteFlashReport(sessionID string) error {
	if sessionID == "" {
		return fmt.Errorf("session ID is required")
	}
	// Validate: no path traversal
	if strings.Contains(sessionID, "/") || strings.Contains(sessionID, "\\") || strings.Contains(sessionID, "..") {
		return fmt.Errorf("invalid session ID")
	}

	reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
	filename := fmt.Sprintf("flash_report_%s.json", sessionID)
	path := filepath.Join(reportsDir, filename)

	if _, err := os.Stat(path); os.IsNotExist(err) {
		return fmt.Errorf("report file does not exist: %s", sessionID)
	}
	return os.Remove(path)
}
