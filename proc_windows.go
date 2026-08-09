//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// Windows: ẩn cửa sổ console khi chạy adb/fastboot/script
func configureCmd(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
}
