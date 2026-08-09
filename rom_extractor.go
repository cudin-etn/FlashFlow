package main

import (
	"archive/zip"
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// PartitionInfo describes a single partition found inside a ROM file.
type PartitionInfo struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	Type string `json:"type"` // "img", "bin", "other"
}

// ExtractRequest holds parameters for a selective partition extraction.
type ExtractRequest struct {
	RomPath    string   `json:"romPath"`
	Partitions []string `json:"partitions"` // Tên partition cần extract
	OutputDir  string   `json:"outputDir"`
}

// ExtractProgress reports the current state of an extraction operation.
type ExtractProgress struct {
	Current    string `json:"current"`    // Partition đang extract
	Percent    int    `json:"percent"`
	TotalFiles int    `json:"totalFiles"`
	DoneFiles  int    `json:"doneFiles"`
}

// Package-level cancel context for extract operations.
var (
	extractMu     sync.Mutex
	extractCtx    context.Context
	extractCancel context.CancelFunc
)

// ListRomPartitions scans a ROM file and returns the list of partitions it contains.
// Supports ZIP files containing .img files directly, or ZIP files containing payload.bin.
func (a *App) ListRomPartitions(romPath string) ([]PartitionInfo, error) {
	// Check if file exists
	info, err := os.Stat(romPath)
	if err != nil {
		return nil, fmt.Errorf("không tìm thấy file ROM: %w", err)
	}
	if info.IsDir() {
		return nil, fmt.Errorf("đường dẫn là thư mục, không phải file ROM")
	}

	// Determine if it's a ZIP file by checking extension and magic bytes
	isZip := false
	if strings.EqualFold(filepath.Ext(romPath), ".zip") {
		isZip = true
	} else {
		// Check magic bytes (PK\x03\x04)
		f, err := os.Open(romPath)
		if err != nil {
			return nil, fmt.Errorf("không thể mở file ROM: %w", err)
		}
		magic := make([]byte, 4)
		n, _ := f.Read(magic)
		f.Close()
		if n == 4 && magic[0] == 0x50 && magic[1] == 0x4B && magic[2] == 0x03 && magic[3] == 0x04 {
			isZip = true
		}
	}

	if !isZip {
		// Check if it's a payload.bin file directly
		base := strings.ToLower(filepath.Base(romPath))
		if base == "payload.bin" {
			return a.ListPayloadPartitions(romPath)
		}
		return []PartitionInfo{}, nil
	}

	// ZIP file: check if it contains payload.bin
	r, err := zip.OpenReader(romPath)
	if err != nil {
		return nil, fmt.Errorf("không thể đọc file ZIP: %w", err)
	}
	defer r.Close()

	hasPayload := false
	var imgPartitions []PartitionInfo

	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		base := filepath.Base(f.Name)
		baseLower := strings.ToLower(base)

		// Check for payload.bin
		if baseLower == "payload.bin" {
			hasPayload = true
			continue
		}

		ext := strings.ToLower(filepath.Ext(base))
		var pType string
		switch ext {
		case ".img":
			pType = "img"
		case ".bin":
			// Skip payload.bin already handled above
			if baseLower != "payload.bin" {
				pType = "bin"
			} else {
				continue
			}
		default:
			continue
		}
		name := strings.TrimSuffix(base, ext)
		imgPartitions = append(imgPartitions, PartitionInfo{
			Name: name,
			Size: int64(f.UncompressedSize64),
			Type: pType,
		})
	}

	// If ZIP contains payload.bin and no .img files, extract payload.bin temporarily
	// and list partitions from it
	if hasPayload && len(imgPartitions) == 0 {
		return a.listPayloadFromZip(romPath)
	}

	// If ZIP has .img files, return those directly
	if len(imgPartitions) > 0 {
		return imgPartitions, nil
	}

	return []PartitionInfo{}, nil
}

// listPayloadFromZip extracts payload.bin from a ZIP to a temp location and lists its partitions.
func (a *App) listPayloadFromZip(zipPath string) ([]PartitionInfo, error) {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return nil, fmt.Errorf("không thể đọc file ZIP: %w", err)
	}
	defer r.Close()

	// Find payload.bin entry
	var payloadEntry *zip.File
	for _, f := range r.File {
		if strings.ToLower(filepath.Base(f.Name)) == "payload.bin" {
			payloadEntry = f
			break
		}
	}
	if payloadEntry == nil {
		return nil, fmt.Errorf("không tìm thấy payload.bin trong ZIP")
	}

	// Extract payload.bin to temp dir
	tmpDir, err := os.MkdirTemp("", "flashflow_payload_*")
	if err != nil {
		return nil, fmt.Errorf("không thể tạo thư mục tạm: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	payloadPath := filepath.Join(tmpDir, "payload.bin")
	rc, err := payloadEntry.Open()
	if err != nil {
		return nil, fmt.Errorf("không thể mở payload.bin từ ZIP: %w", err)
	}
	defer rc.Close()

	outFile, err := os.Create(payloadPath)
	if err != nil {
		return nil, fmt.Errorf("không thể tạo file tạm payload.bin: %w", err)
	}
	if _, err := io.Copy(outFile, rc); err != nil {
		outFile.Close()
		return nil, fmt.Errorf("không thể extract payload.bin: %w", err)
	}
	outFile.Close()

	return a.ListPayloadPartitions(payloadPath)
}

// ListPayloadPartitions runs payload-dumper-go -l to list available partitions in a payload.bin file.
func (a *App) ListPayloadPartitions(payloadPath string) ([]PartitionInfo, error) {
	dumperPath := a.GetToolPath("payload-dumper-go")

	cmd := exec.Command(dumperPath, "-l", payloadPath)
	configureCmd(cmd)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("payload-dumper-go lỗi: %s — %w", strings.TrimSpace(string(out)), err)
	}

	// Parse output: payload-dumper-go -l typically outputs partition names one per line
	var partitions []PartitionInfo
	scanner := bufio.NewScanner(strings.NewReader(string(out)))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		// Skip header/info lines (usually start with special chars or contain ":")
		if strings.HasPrefix(line, "payload") || strings.HasPrefix(line, "Number") ||
			strings.HasPrefix(line, "=") || strings.HasPrefix(line, "-") ||
			strings.Contains(line, "Partition") && strings.Contains(line, "Size") {
			continue
		}
		// Some versions output "partition_name  size" format
		fields := strings.Fields(line)
		if len(fields) == 0 {
			continue
		}
		name := fields[0]
		// Validate it looks like a partition name (alphanumeric + underscore)
		if !isValidPartitionName(name) {
			continue
		}
		partitions = append(partitions, PartitionInfo{
			Name: name,
			Size: 0, // payload-dumper-go doesn't always show sizes with -l
			Type: "img",
		})
	}

	return partitions, nil
}

// isValidPartitionName checks if a string looks like a valid Android partition name.
func isValidPartitionName(name string) bool {
	if len(name) == 0 || len(name) > 64 {
		return false
	}
	for _, c := range name {
		if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
			return false
		}
	}
	return true
}

// ExtractPartitions extracts selected partitions from a ROM to the output directory.
// Handles both ZIP files with .img entries and ZIP files with payload.bin.
func (a *App) ExtractPartitions(req ExtractRequest) error {
	if req.RomPath == "" {
		return fmt.Errorf("romPath không được để trống")
	}
	if len(req.Partitions) == 0 {
		return fmt.Errorf("chưa chọn partition nào để extract")
	}
	if req.OutputDir == "" {
		return fmt.Errorf("outputDir không được để trống")
	}

	// Initialize cancel context for this extraction
	extractMu.Lock()
	extractCtx, extractCancel = context.WithCancel(context.Background())
	extractMu.Unlock()

	// Ensure output directory exists
	if err := os.MkdirAll(req.OutputDir, 0755); err != nil {
		return fmt.Errorf("không thể tạo thư mục output: %w", err)
	}

	// Determine ROM type
	isZip := strings.EqualFold(filepath.Ext(req.RomPath), ".zip")
	if !isZip {
		// Check magic bytes
		f, err := os.Open(req.RomPath)
		if err != nil {
			return fmt.Errorf("không thể mở file ROM: %w", err)
		}
		magic := make([]byte, 4)
		n, _ := f.Read(magic)
		f.Close()
		if n == 4 && magic[0] == 0x50 && magic[1] == 0x4B && magic[2] == 0x03 && magic[3] == 0x04 {
			isZip = true
		}
	}

	// If it's a payload.bin file directly
	if !isZip && strings.ToLower(filepath.Base(req.RomPath)) == "payload.bin" {
		return a.ExtractFromPayload(req.RomPath, req.Partitions, req.OutputDir)
	}

	if !isZip {
		return fmt.Errorf("file ROM không được hỗ trợ (không phải ZIP hoặc payload.bin)")
	}

	// Open ZIP and check if it has payload.bin or .img files
	r, err := zip.OpenReader(req.RomPath)
	if err != nil {
		return fmt.Errorf("không thể đọc file ZIP: %w", err)
	}
	defer r.Close()

	hasPayload := false
	hasImgFiles := false
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		baseLower := strings.ToLower(filepath.Base(f.Name))
		if baseLower == "payload.bin" {
			hasPayload = true
		}
		if strings.HasSuffix(baseLower, ".img") {
			hasImgFiles = true
		}
	}

	// If ZIP has .img files, extract them directly
	if hasImgFiles {
		return a.extractImgFromZip(req.RomPath, req.Partitions, req.OutputDir)
	}

	// If ZIP has payload.bin, extract payload.bin first then dump partitions
	if hasPayload {
		return a.extractViaPayloadFromZip(req.RomPath, req.Partitions, req.OutputDir)
	}

	return fmt.Errorf("ZIP không chứa file .img hoặc payload.bin")
}

// extractImgFromZip extracts only selected .img files from a ZIP archive.
func (a *App) extractImgFromZip(zipPath string, partitions []string, outputDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("không thể đọc file ZIP: %w", err)
	}
	defer r.Close()

	// Build a set of requested partition names (case-insensitive)
	requested := make(map[string]bool)
	for _, p := range partitions {
		requested[strings.ToLower(p)] = true
	}

	// Find matching entries
	type matchEntry struct {
		file *zip.File
		name string
	}
	var matches []matchEntry
	for _, f := range r.File {
		if f.FileInfo().IsDir() {
			continue
		}
		base := filepath.Base(f.Name)
		ext := strings.ToLower(filepath.Ext(base))
		if ext != ".img" && ext != ".bin" {
			continue
		}
		name := strings.TrimSuffix(base, ext)
		if requested[strings.ToLower(name)] {
			matches = append(matches, matchEntry{file: f, name: name})
		}
	}

	totalFiles := len(matches)
	if totalFiles == 0 {
		return fmt.Errorf("không tìm thấy partition nào khớp trong ZIP")
	}

	for i, m := range matches {
		// Check cancellation
		if isExtractCancelled() {
			wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
				Current:    "Đã hủy",
				Percent:    (i * 100) / totalFiles,
				TotalFiles: totalFiles,
				DoneFiles:  i,
			})
			return fmt.Errorf("extract đã bị hủy bởi người dùng")
		}

		// Emit progress
		percent := (i * 100) / totalFiles
		wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
			Current:    m.name,
			Percent:    percent,
			TotalFiles: totalFiles,
			DoneFiles:  i,
		})

		// Extract file
		outPath := filepath.Join(outputDir, filepath.Base(m.file.Name))
		if err := a.extractZipEntry(m.file, outPath); err != nil {
			return fmt.Errorf("lỗi extract %s: %w", m.name, err)
		}
	}

	// Final progress
	wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
		Current:    "Hoàn tất",
		Percent:    100,
		TotalFiles: totalFiles,
		DoneFiles:  totalFiles,
	})

	return nil
}

// extractZipEntry extracts a single ZIP entry to the specified output path.
func (a *App) extractZipEntry(f *zip.File, outPath string) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()

	outFile, err := os.Create(outPath)
	if err != nil {
		return err
	}
	defer outFile.Close()

	_, err = io.Copy(outFile, rc)
	return err
}

// extractViaPayloadFromZip extracts payload.bin from ZIP, then dumps selected partitions.
func (a *App) extractViaPayloadFromZip(zipPath string, partitions []string, outputDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("không thể đọc file ZIP: %w", err)
	}
	defer r.Close()

	// Find payload.bin
	var payloadEntry *zip.File
	for _, f := range r.File {
		if strings.ToLower(filepath.Base(f.Name)) == "payload.bin" {
			payloadEntry = f
			break
		}
	}
	if payloadEntry == nil {
		return fmt.Errorf("không tìm thấy payload.bin trong ZIP")
	}

	// Emit progress for payload extraction
	wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
		Current:    "Đang giải nén payload.bin...",
		Percent:    0,
		TotalFiles: len(partitions) + 1,
		DoneFiles:  0,
	})

	if isExtractCancelled() {
		return fmt.Errorf("extract đã bị hủy bởi người dùng")
	}

	// Extract payload.bin to temp dir
	tmpDir, err := os.MkdirTemp("", "flashflow_payload_extract_*")
	if err != nil {
		return fmt.Errorf("không thể tạo thư mục tạm: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	payloadPath := filepath.Join(tmpDir, "payload.bin")
	if err := a.extractZipEntry(payloadEntry, payloadPath); err != nil {
		return fmt.Errorf("không thể extract payload.bin: %w", err)
	}

	// Now dump selected partitions from payload.bin
	return a.ExtractFromPayload(payloadPath, partitions, outputDir)
}

// ExtractFromPayload dumps individual partitions from a payload.bin file using payload-dumper-go.
func (a *App) ExtractFromPayload(payloadPath string, partitions []string, outputDir string) error {
	dumperPath := a.GetToolPath("payload-dumper-go")
	totalFiles := len(partitions)

	for i, partition := range partitions {
		// Check cancellation
		if isExtractCancelled() {
			wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
				Current:    "Đã hủy",
				Percent:    (i * 100) / totalFiles,
				TotalFiles: totalFiles,
				DoneFiles:  i,
			})
			return fmt.Errorf("extract đã bị hủy bởi người dùng")
		}

		// Emit progress
		percent := (i * 100) / totalFiles
		wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
			Current:    partition,
			Percent:    percent,
			TotalFiles: totalFiles,
			DoneFiles:  i,
		})

		// Run payload-dumper-go -o <outputDir> -p <partition> <payloadPath>
		cmd := exec.Command(dumperPath, "-o", outputDir, "-p", partition, payloadPath)
		configureCmd(cmd)
		out, err := cmd.CombinedOutput()
		if err != nil {
			outStr := strings.TrimSpace(string(out))
			return fmt.Errorf("payload-dumper-go lỗi khi dump %s: %s — %w", partition, outStr, err)
		}
	}

	// Final progress
	wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
		Current:    "Hoàn tất",
		Percent:    100,
		TotalFiles: totalFiles,
		DoneFiles:  totalFiles,
	})

	return nil
}

// CancelExtract cancels the currently running extraction operation.
func (a *App) CancelExtract() {
	extractMu.Lock()
	defer extractMu.Unlock()
	if extractCancel != nil {
		extractCancel()
	}
}

// CopyFromCache copies partition .img files from the Library cache to the output directory.
// If the ROM has already been extracted and cached in the Library, this copies files directly.
func (a *App) CopyFromCache(romId string, partitions []string, outputDir string) error {
	if romId == "" {
		return fmt.Errorf("romId không được để trống")
	}
	if len(partitions) == 0 {
		return fmt.Errorf("chưa chọn partition nào để copy")
	}
	if outputDir == "" {
		return fmt.Errorf("outputDir không được để trống")
	}

	// Look in Library cache directory
	libDir := a.getLibraryDir()
	cacheDir := filepath.Join(libDir, romId)

	// Check if cache directory exists
	if _, err := os.Stat(cacheDir); os.IsNotExist(err) {
		return fmt.Errorf("ROM chưa được cache trong Library: %s", romId)
	}

	// Ensure output directory exists
	if err := os.MkdirAll(outputDir, 0755); err != nil {
		return fmt.Errorf("không thể tạo thư mục output: %w", err)
	}

	// Build set of requested partitions
	requested := make(map[string]bool)
	for _, p := range partitions {
		requested[strings.ToLower(p)] = true
	}

	// Walk cache directory to find matching .img files
	copied := 0
	err := filepath.WalkDir(cacheDir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		base := filepath.Base(path)
		ext := strings.ToLower(filepath.Ext(base))
		if ext != ".img" {
			return nil
		}
		name := strings.ToLower(strings.TrimSuffix(base, ext))
		if !requested[name] {
			return nil
		}

		// Copy file to output directory
		destPath := filepath.Join(outputDir, base)
		if err := copyFile(path, destPath); err != nil {
			return fmt.Errorf("không thể copy %s: %w", base, err)
		}
		copied++

		// Emit progress
		percent := (copied * 100) / len(partitions)
		wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
			Current:    name,
			Percent:    percent,
			TotalFiles: len(partitions),
			DoneFiles:  copied,
		})

		return nil
	})

	if err != nil {
		return err
	}

	if copied == 0 {
		return fmt.Errorf("không tìm thấy file .img nào khớp trong cache")
	}

	// Final progress
	wailsRuntime.EventsEmit(a.ctx, "extract_progress", ExtractProgress{
		Current:    "Hoàn tất",
		Percent:    100,
		TotalFiles: len(partitions),
		DoneFiles:  copied,
	})

	return nil
}

// copyFile copies a file from src to dst.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

// SelectOutputDirectory opens a directory picker dialog for the user to choose an output directory.
func (a *App) SelectOutputDirectory() string {
	path, _ := wailsRuntime.OpenDirectoryDialog(a.ctx, wailsRuntime.OpenDialogOptions{
		Title: "Chọn thư mục lưu file extract",
	})
	return path
}

// isExtractCancelled checks if the current extraction has been cancelled.
func isExtractCancelled() bool {
	extractMu.Lock()
	ctx := extractCtx
	extractMu.Unlock()
	if ctx == nil {
		return false
	}
	select {
	case <-ctx.Done():
		return true
	default:
		return false
	}
}
