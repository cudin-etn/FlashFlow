//go:build !windows

package flasher

import "syscall"

// getSysProcAttr trả về nil cho Mac/Linux (không cần ẩn CMD)
func getSysProcAttr() *syscall.SysProcAttr {
	return nil
}
