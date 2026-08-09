//go:build !windows

package main

import (
	"fmt"
	"syscall"
)

// getDiskFreeSpace returns the available free space in bytes for the filesystem
// containing the given path. Works on macOS and Linux.
func getDiskFreeSpace(path string) (int64, error) {
	var stat syscall.Statfs_t
	err := syscall.Statfs(path, &stat)
	if err != nil {
		return 0, fmt.Errorf("statfs failed for %s: %w", path, err)
	}

	// Available blocks * block size = free space in bytes
	freeBytes := int64(stat.Bavail) * int64(stat.Bsize)
	return freeBytes, nil
}
