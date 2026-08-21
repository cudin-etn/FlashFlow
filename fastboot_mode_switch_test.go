package main

import (
	"errors"
	"testing"
)

func TestIsFastbootRebootToFastbootTimeout(t *testing.T) {
	timeout := errors.New("lệnh timeout (60s): fastboot.exe -s SERIAL reboot fastboot")
	if !isFastbootRebootToFastbootTimeout(timeout) {
		t.Fatal("reboot fastboot timeout must be recoverable until FastbootD verification")
	}

	for _, err := range []error{
		nil,
		errors.New("lệnh timeout (60s): fastboot.exe -s SERIAL getvar product"),
		errors.New("exit status 1: FAILED (remote: command not allowed)"),
	} {
		if isFastbootRebootToFastbootTimeout(err) {
			t.Fatalf("unexpected recoverable mode-switch timeout for %v", err)
		}
	}
}
