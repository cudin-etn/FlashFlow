//go:build windows

package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

// getDiskFreeSpace returns the available free space in bytes for the filesystem
// containing the given path. Works on Windows.
func getDiskFreeSpace(path string) (int64, error) {
	h := syscall.MustLoadDLL("kernel32.dll")
	c := h.MustFindProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable, totalNumberOfBytes, totalNumberOfFreeBytes int64

	pathPtr, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, fmt.Errorf("invalid path %s: %w", path, err)
	}

	ret, _, callErr := c.Call(
		uintptr(unsafe.Pointer(pathPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if ret == 0 {
		return 0, fmt.Errorf("GetDiskFreeSpaceExW failed for %s: %v", path, callErr)
	}

	return freeBytesAvailable, nil
}
