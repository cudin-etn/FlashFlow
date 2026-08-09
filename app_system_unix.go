//go:build !windows

package main

import (
	"syscall"
)

func (a *App) GetDiskFreeSpace() float64 {
	var stat syscall.Statfs_t
	// Kiểm tra thư mục hiện tại "."
	err := syscall.Statfs(".", &stat)
	if err != nil {
		return 0
	}

	// Available blocks * Block size
	freeBytes := uint64(stat.Bavail) * uint64(stat.Bsize)

	// Đổi ra GB
	return float64(freeBytes) / 1024 / 1024 / 1024
}
