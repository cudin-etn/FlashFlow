package flasher

import "sync"

// adb/fastboot are not safe to call concurrently.
// This global lock serializes all tool invocations.
var toolsMu sync.Mutex

func ToolsLock()   { toolsMu.Lock() }
func ToolsUnlock() { toolsMu.Unlock() }
