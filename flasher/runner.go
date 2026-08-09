package flasher

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"os/exec"
	"strings"
	"sync"
	"time"
)

type Runner struct {
	mu           sync.Mutex
	busy         bool
	paused       bool
	ADBPath      string
	FastbootPath string
}

func NewRunner() *Runner {
	return &Runner{
		ADBPath:      "adb",
		FastbootPath: "fastboot",
	}
}

func (r *Runner) SetToolPaths(adbPath, fastbootPath string) {
	if strings.TrimSpace(adbPath) != "" {
		r.ADBPath = adbPath
	}
	if strings.TrimSpace(fastbootPath) != "" {
		r.FastbootPath = fastbootPath
	}
}

func (r *Runner) adbPath() string {
	if strings.TrimSpace(r.ADBPath) == "" {
		return "adb"
	}
	return r.ADBPath
}

func (r *Runner) fastbootPath() string {
	if strings.TrimSpace(r.FastbootPath) == "" {
		return "fastboot"
	}
	return r.FastbootPath
}

func (r *Runner) ResetADB(onLog func(string)) {
	// Kill adb server to clear zombie state after reboot
	cmd := exec.Command(r.adbPath(), "kill-server")
	_ = cmd.Run()
	if onLog != nil {
		onLog(">>> ADB server reset.")
	}
}

type Step struct {
	Name    string
	Command string
	Args    []string
	Dir     string
}

func isBenignFastbootMessage(text string) bool {
	msg := strings.ToLower(strings.TrimSpace(text))
	if msg == "" {
		return false
	}

	benignSnippets := []string{
		"does not exist",
		"not found",
		"unknown partition",
		"cannot delete",
		"delete-logical-partition",
	}
	for _, snippet := range benignSnippets {
		if strings.Contains(msg, snippet) {
			return true
		}
	}
	return false
}

// Runner chỉ chịu trách nhiệm chạy step + stream log
// Không chứa logic adb/fastboot device listing

func (r *Runner) RunSteps(
	steps []Step,
	onLog func(string),
	onProgress func(int),
) error {
	r.mu.Lock()
	if r.busy {
		r.mu.Unlock()
		return fmt.Errorf("runner is busy")
	}
	r.busy = true
	r.mu.Unlock()
	defer func() {
		r.mu.Lock()
		r.busy = false
		r.mu.Unlock()
	}()

	total := len(steps)
	if total == 0 {
		if onProgress != nil {
			onProgress(100)
		}
		return nil
	}

	for i, s := range steps {
		if onProgress != nil {
			percent := (i * 100) / total
			onProgress(percent)
		}

		if onLog != nil {
			onLog(fmt.Sprintf("==> [%d/%d] %s", i+1, total, s.Name))
		}

		if err := r.runCommandStreaming(
			s.Dir,
			s.Command,
			s.Args,
			onLog,
		); err != nil {
			return err
		}
	}

	if onProgress != nil {
		onProgress(100)
	}
	return nil
}

func (r *Runner) runCommandStreaming(
	dir string,
	command string,
	args []string,
	onLog func(string),
) error {

	ToolsLock()
	defer ToolsUnlock()

	cmd := exec.Command(command, args...)
	cmd.SysProcAttr = getSysProcAttr()
	if dir != "" {
		cmd.Dir = dir
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}

	// Setup stderr to be written to both scanner and buffer
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	var stderrBuf bytes.Buffer
	var stdoutBuf bytes.Buffer
	stderrReader := io.TeeReader(stderrPipe, &stderrBuf)
	stdoutReader := io.TeeReader(stdout, &stdoutBuf)

	if err := cmd.Start(); err != nil {
		return err
	}

	scan := func(r io.Reader, prefix string) {
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
		for sc.Scan() {
			if onLog != nil {
				line := sc.Text()
				if prefix != "" {
					line = prefix + line
				}
				onLog(line)
			}
		}
	}

	go scan(stdoutReader, "")
	go scan(stderrReader, "[err] ")

	waitErr := cmd.Wait()
	if waitErr != nil {
		stderrStr := strings.TrimSpace(stderrBuf.String())
		stdoutStr := strings.TrimSpace(stdoutBuf.String())
		combined := strings.TrimSpace(strings.Join([]string{stderrStr, stdoutStr}, "\n"))

		if onLog != nil {
			if stderrStr != "" {
				onLog(stderrStr)
			}
			if stdoutStr != "" {
				onLog(stdoutStr)
			}
		}

		isDeleteLogical := false
		for _, arg := range args {
			if strings.EqualFold(arg, "delete-logical-partition") {
				isDeleteLogical = true
				break
			}
		}
		if isDeleteLogical && isBenignFastbootMessage(combined) {
			if onLog != nil {
				onLog(">>> Benign fastboot delete warning detected, continuing...")
			}
			return nil
		}

		if combined == "" {
			combined = waitErr.Error()
		}
		return fmt.Errorf("command failed: %s %s -> %w | output: %s", command, strings.Join(args, " "), waitErr, combined)
	}
	return nil
}

// WaitForADB polls adb until device state becomes "device" or timeout occurs.
// Used after rebooting from bootloader to ensure adb daemon is ready.
func (r *Runner) WaitForADB(timeout time.Duration, onLog func(string)) bool {
	r.ResetADB(onLog)

	deadline := time.Now().Add(timeout)

	if onLog != nil {
		onLog(">>> Waiting for ADB device...")
	}

	for time.Now().Before(deadline) {
		cmd := exec.Command(r.adbPath(), "get-state")
		out, err := cmd.CombinedOutput()
		state := string(out)

		if err == nil && state != "" {
			if state == "device\n" || state == "device\r\n" {
				if onLog != nil {
					onLog(">>> ADB device connected.")
				}
				return true
			}
		}

		time.Sleep(800 * time.Millisecond)
	}

	if onLog != nil {
		onLog("!!! ADB did not reconnect within timeout.")
	}
	return false
}
