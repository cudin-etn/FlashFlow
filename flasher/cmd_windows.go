//go:build windows

package flasher

import "syscall"

// getSysProcAttr trả về thuộc tính ẩn cửa sổ cho Windows
func getSysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{HideWindow: true}
}
