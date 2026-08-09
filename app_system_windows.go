//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func (a *App) GetDiskFreeSpace() float64 {
	h := syscall.MustLoadDLL("kernel32.dll")
	c := h.MustFindProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes int64

	// Kiểm tra ổ đĩa hiện tại (thư mục chạy tool)
	_, _, _ = c.Call(
		uintptr(unsafe.Pointer(nil)), // nil = current directory root
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)

	// Đổi ra GB
	return float64(freeBytesAvailable) / 1024 / 1024 / 1024
}
