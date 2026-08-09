//go:build !windows

package main

import "os/exec"

// Mac/Linux: không cần ẩn cửa sổ
func configureCmd(cmd *exec.Cmd) {}
