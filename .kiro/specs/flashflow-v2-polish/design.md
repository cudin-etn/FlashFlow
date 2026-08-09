# Design Document

## Overview

This document describes the architecture and implementation design for the FlashFlow v2 Polish feature set. It covers thread-safety fixes for the license module, graceful shutdown for the device watcher, deferred mutex releases, nil-pointer guards, auth server timeout, batched device property queries, frontend performance fixes, and a new Flash History Dashboard.

The project uses Go (backend) with the Wails v2 framework and React/TypeScript (frontend).

---

## Architecture

The changes span three layers:

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React/TypeScript)                            │
│  ├── DashboardPage.tsx (log fix, style fix)             │
│  └── FlashHistoryModal.tsx (new component)              │
├─────────────────────────────────────────────────────────┤
│  Wails Bridge (auto-generated bindings)                 │
├─────────────────────────────────────────────────────────┤
│  Backend (Go)                                           │
│  ├── app_license.go (RWMutex protection)                │
│  ├── app.go (deviceWatcher graceful shutdown, batch)    │
│  ├── fastbootd.go (defer ToolsUnlock)                   │
│  ├── flasher_oneplus.go (defer ToolsUnlock)             │
│  ├── auth_server.go (auto-shutdown timer)               │
│  └── app_history.go (new: GetFlashReports, Delete)      │
└─────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### 1. License State Thread Safety (Requirement 1)

**Current Problem:** `globalLicenseStatus` is a package-level variable accessed by multiple goroutines (CheckLicenseOnInit runs in a goroutine, HandleRE4HExpiry spawns a goroutine, and IsLicenseValid is called from the main thread) without synchronization.

**Solution:** Introduce a `sync.RWMutex` to protect all access to `globalLicenseStatus`.

```go
// app_license.go

var (
    licenseMu           sync.RWMutex
    globalLicenseStatus = LicenseResponse{
        Result:   "UNKNOWN",
        Type:     "TRIAL",
        DaysLeft: 0,
        ExpiryTS: 0,
        IsPro:    false,
    }
)

// getLicenseStatus returns a copy of the current license state (read-locked).
func getLicenseStatus() LicenseResponse {
    licenseMu.RLock()
    defer licenseMu.RUnlock()
    return globalLicenseStatus
}

// setLicenseStatus overwrites the global license state (write-locked).
func setLicenseStatus(status LicenseResponse) {
    licenseMu.Lock()
    defer licenseMu.Unlock()
    globalLicenseStatus = status
}

// updateLicenseField applies a mutation function under write lock.
func updateLicenseField(fn func(s *LicenseResponse)) {
    licenseMu.Lock()
    defer licenseMu.Unlock()
    fn(&globalLicenseStatus)
}
```

All existing call sites (`IsLicenseValid`, `CheckLicenseOnInit`, `ActivateLicense`, `HandleRE4HExpiry`, `checkLicenseExpiredAfterFlash`) will be refactored to use these accessor functions instead of directly reading/writing `globalLicenseStatus`.

---

### 2. Device Watcher Graceful Shutdown (Requirement 2)

**Current Problem:** The `deviceWatcher` goroutine uses `time.Sleep` which cannot be interrupted by context cancellation.

**Solution:** Replace `time.Sleep` with a `select` on a ticker and `ctx.Done()`.

```go
// app.go

func (a *App) deviceWatcher() {
    interval := 900 * time.Millisecond
    if runtime.GOOS == "windows" {
        interval = 1500 * time.Millisecond
    }

    ticker := time.NewTicker(interval)
    defer ticker.Stop()

    for {
        select {
        case <-a.ctx.Done():
            return // Graceful exit
        case <-ticker.C:
            // existing polling logic
        }

        if a.isFlashActive() || a.isCmdInFlight() || a.isWatcherPaused() {
            continue
        }
        // ... rest of device detection logic
    }
}
```

This ensures the goroutine exits within one tick interval when the app context is cancelled, even if it was waiting for the next tick.

---

### 3. Deferred Tools Unlock in dumpPayloadToImages (Requirement 3)

**Current Problem:** `flasher.ToolsLock()` is acquired, then `flasher.ToolsUnlock()` is called manually after `cmd.CombinedOutput()`. If a panic occurs between lock and unlock, the mutex is never released.

**Solution:** Use `defer` immediately after acquisition.

```go
// flasher_oneplus.go

func (a *App) dumpPayloadToImages(dumperPath, payloadPath, outDir string) error {
    if err := os.MkdirAll(outDir, 0755); err != nil {
        return err
    }
    flasher.ToolsLock()
    defer flasher.ToolsUnlock() // Always released, even on panic

    cmd := exec.Command(dumperPath, "-o", outDir, payloadPath)
    cmd.Dir = filepath.Dir(dumperPath)
    out, err := cmd.CombinedOutput()
    // ... rest of error handling
}
```

---

### 4. Deferred Tools Unlock in IsFastbootD (Requirement 4)

**Current Problem:** Same pattern as Requirement 3 — manual unlock after command execution.

**Solution:**

```go
// fastbootd.go

func (a *App) IsFastbootD() bool {
    fbs, _ := a.run.ListFastbootDevices()
    if len(fbs) == 0 {
        return false
    }
    serial := strings.TrimSpace(fbs[0].Serial)
    if serial == "" {
        return false
    }

    flasher.ToolsLock()
    defer flasher.ToolsUnlock() // Always released

    cmd := exec.Command(a.GetToolPath("fastboot"), "-s", serial, "getvar", "is-userspace")
    configureCmd(cmd)
    out, _ := cmd.CombinedOutput()

    s := strings.ToLower(string(out))
    return strings.Contains(s, "is-userspace: yes")
}
```

---

### 5. Nil Pointer Guard in GetLibraryList (Requirement 5)

**Current Problem:** The `filepath.Walk` callback in `GetLibraryList` calls `info.IsDir()` without checking if `info` is nil or if `err` is non-nil.

**Solution:** Check `err` first and guard against nil `info`.

```go
// app.go (inside GetLibraryList)

filepath.Walk(fullPath, func(_ string, info os.FileInfo, err error) error {
    if err != nil {
        return nil // Skip entries with errors
    }
    if info == nil {
        return nil // Guard against nil FileInfo
    }
    if !info.IsDir() {
        size += info.Size()
    }
    return nil
})
```

Additionally, the outer `entries` loop should guard against `entry.Info()` returning an error:

```go
info, err := entry.Info()
if err != nil || info == nil {
    continue // Skip corrupted entries
}
```

---

### 6. Auth Server Auto-Shutdown Timer (Requirement 6)

**Current Problem:** `StartTelegramLogin` starts an HTTP server that only shuts down when the callback is received. If the user abandons the login flow, port 8123 remains occupied.

**Solution:** Add a 120-second timeout with a cancellable timer.

```go
// auth_server.go

func (a *App) StartTelegramLogin() {
    mux := http.NewServeMux()
    var srv *http.Server

    // Timer for auto-shutdown
    shutdownTimer := time.AfterFunc(120*time.Second, func() {
        wailsRuntime.EventsEmit(a.ctx, "telegram_login_timeout", map[string]string{
            "message": "Login timeout after 120s",
        })
        srv.Shutdown(context.Background())
    })

    mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
        // Cancel the auto-shutdown timer
        shutdownTimer.Stop()

        // ... existing callback logic ...

        go func() {
            srv.Shutdown(context.Background())
        }()
    })

    srv = &http.Server{Addr: "127.0.0.1:8123", Handler: mux}
    go func() {
        _ = srv.ListenAndServe()
    }()

    wailsRuntime.BrowserOpenURL(a.ctx, "https://tdev.site/auth")
}
```

---

### 7. Device Watcher Batch Getprop (Requirement 7)

**Current Problem:** The device watcher calls `getAdbProp` multiple times (model, OS, bootloader), each acquiring the tools lock and spawning a separate `adb shell getprop <key>` process.

**Solution:** Introduce a `getAdbPropsAll` function that runs a single `adb shell getprop` command and parses the output.

```go
// app.go

// PropMap holds parsed Android system properties.
type PropMap map[string]string

// getAdbPropsAll runs a single "adb shell getprop" and returns all properties.
func (a *App) getAdbPropsAll(serial string) (PropMap, error) {
    flasher.ToolsLock()
    defer flasher.ToolsUnlock()

    cmd := exec.Command(a.GetToolPath("adb"), "-s", serial, "shell", "getprop")
    configureCmd(cmd)
    out, err := cmd.CombinedOutput()
    if err != nil {
        return nil, err
    }

    return ParseGetpropOutput(string(out)), nil
}

// ParseGetpropOutput parses the output of "adb shell getprop" into a map.
// Each line has format: [property.name]: [value]
func ParseGetpropOutput(output string) PropMap {
    props := make(PropMap)
    lines := strings.Split(output, "\n")
    for _, line := range lines {
        line = strings.TrimSpace(line)
        if !strings.HasPrefix(line, "[") {
            continue
        }
        // Format: [key]: [value]
        closeBracket := strings.Index(line, "]")
        if closeBracket < 2 {
            continue
        }
        key := line[1:closeBracket]

        valueStart := strings.Index(line[closeBracket:], "[")
        if valueStart < 0 {
            continue
        }
        valueStart += closeBracket + 1
        valueEnd := strings.LastIndex(line, "]")
        if valueEnd <= valueStart {
            continue
        }
        value := line[valueStart:valueEnd]
        props[key] = value
    }
    return props
}
```

The device watcher's `CheckDevice` path will first attempt `getAdbPropsAll`, and if it fails, fall back to individual `getAdbProp` calls.

---

### 8. Frontend Log Accumulation Fix (Requirement 8)

**Current Problem:** Each log event triggers a state update that spreads the entire log array into a new array, causing O(n) copies and excessive re-renders.

**Solution:** Use a `useRef` for the mutable log buffer and a throttled state update for rendering.

```typescript
// DashboardPage.tsx (or a dedicated useFlashLogs hook)

const MAX_LOG_ENTRIES = 500;

function useFlashLogs() {
    const logsRef = useRef<string[]>([]);
    const [visibleLogs, setVisibleLogs] = useState<string[]>([]);
    const rafRef = useRef<number | null>(null);

    const appendLog = useCallback((entry: string) => {
        const logs = logsRef.current;
        logs.push(entry);
        // Trim oldest entries if over limit
        if (logs.length > MAX_LOG_ENTRIES) {
            logsRef.current = logs.slice(logs.length - MAX_LOG_ENTRIES);
        }
        // Throttle re-renders via requestAnimationFrame
        if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(() => {
                setVisibleLogs([...logsRef.current]);
                rafRef.current = null;
            });
        }
    }, []);

    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, []);

    return { visibleLogs, appendLog, logsRef };
}
```

---

### 9. Style Tag Injection Fix (Requirement 9)

**Current Problem:** The style tag is created and appended to `document.head` at module load time (outside any component lifecycle). It is never removed on unmount, and re-mounting creates duplicates.

**Solution:** Move style injection into a `useEffect` with cleanup.

```typescript
// DashboardPage.tsx

const DASHBOARD_STYLES = `
  .app-drag-region { ... }
  .creative-card { ... }
  @keyframes orbit { ... }
  /* ... all existing styles ... */
`;

export default function Dashboard({ onStartAIMode, brandSelected = false }: any) {
    useEffect(() => {
        const styleEl = document.createElement("style");
        styleEl.setAttribute("data-dashboard-styles", "true");
        styleEl.textContent = DASHBOARD_STYLES;
        document.head.appendChild(styleEl);

        return () => {
            document.head.removeChild(styleEl);
        };
    }, []);

    // ... rest of component
}
```

---

### 10. Flash History Dashboard (Requirement 10)

#### Backend

New file `app_history.go`:

```go
package main

import (
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "sort"
    "strings"
)

// FlashReportSummary is a lightweight view of a FlashReport for list display.
type FlashReportSummary struct {
    SessionID  string `json:"sessionId"`
    StartedAt  string `json:"startedAt"`
    EndedAt    string `json:"endedAt"`
    DeviceName string `json:"deviceName"`
    ROM        string `json:"rom"`
    Result     string `json:"result"`
    Vendor     string `json:"vendor"`
}

// GetFlashReports reads all report JSON files and returns summaries sorted by date descending.
func (a *App) GetFlashReports() ([]FlashReportSummary, error) {
    reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
    entries, err := os.ReadDir(reportsDir)
    if err != nil {
        if os.IsNotExist(err) {
            return []FlashReportSummary{}, nil
        }
        return nil, fmt.Errorf("cannot read reports directory: %w", err)
    }

    var summaries []FlashReportSummary
    for _, entry := range entries {
        if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
            continue
        }
        data, err := os.ReadFile(filepath.Join(reportsDir, entry.Name()))
        if err != nil {
            continue
        }
        var report FlashReport
        if err := json.Unmarshal(data, &report); err != nil {
            continue
        }
        summaries = append(summaries, FlashReportSummary{
            SessionID:  report.SessionID,
            StartedAt:  report.StartedAt,
            EndedAt:    report.EndedAt,
            DeviceName: report.DeviceName,
            ROM:        report.ROM,
            Result:     report.Result,
            Vendor:     report.Vendor,
        })
    }

    // Sort by StartedAt descending
    sort.Slice(summaries, func(i, j int) bool {
        return summaries[i].StartedAt > summaries[j].StartedAt
    })

    return summaries, nil
}

// GetFlashReportDetail returns the full report for a given session ID.
func (a *App) GetFlashReportDetail(sessionID string) (*FlashReport, error) {
    reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
    filename := fmt.Sprintf("flash_report_%s.json", sessionID)
    data, err := os.ReadFile(filepath.Join(reportsDir, filename))
    if err != nil {
        return nil, fmt.Errorf("report not found: %w", err)
    }
    var report FlashReport
    if err := json.Unmarshal(data, &report); err != nil {
        return nil, fmt.Errorf("invalid report format: %w", err)
    }
    return &report, nil
}

// DeleteFlashReport removes a report file by session ID.
func (a *App) DeleteFlashReport(sessionID string) error {
    if sessionID == "" {
        return fmt.Errorf("session ID is required")
    }
    reportsDir := filepath.Join(a.getLibraryDir(), "Reports")
    filename := fmt.Sprintf("flash_report_%s.json", sessionID)
    path := filepath.Join(reportsDir, filename)

    if _, err := os.Stat(path); os.IsNotExist(err) {
        return fmt.Errorf("report file does not exist: %s", sessionID)
    }
    return os.Remove(path)
}
```

#### Frontend

New component `FlashHistoryModal.tsx`:

```typescript
// frontend/src/components/dashboard/FlashHistoryModal.tsx

interface FlashReportSummary {
    sessionId: string;
    startedAt: string;
    endedAt: string;
    deviceName: string;
    rom: string;
    result: string;
    vendor: string;
}

interface FlashReportDetail {
    sessionId: string;
    startedAt: string;
    endedAt: string;
    deviceName: string;
    vendor: string;
    rom: string;
    wipe: boolean;
    arbMode: string;
    result: string;
    flashedPartitions: string[];
    skippedArbPartitions: string[];
    failures: string[];
    logs: string[];
}
```

The modal provides:
- A scrollable list of report summaries (date, device, ROM, status badge)
- Click-to-expand detail view showing partitions, failures, duration
- Delete button per report with confirmation
- Empty state when no reports exist

---

## Data Models

### LicenseResponse (existing, unchanged)

```go
type LicenseResponse struct {
    Result   string `json:"result"`
    Type     string `json:"type"`
    DaysLeft int    `json:"days_left"`
    ExpiryTS int64  `json:"expiry_ts"`
    Message  string `json:"message"`
    IsPro    bool   `json:"isPro"`
}
```

### FlashReport (existing, unchanged)

```go
type FlashReport struct {
    SessionID            string   `json:"sessionId"`
    StartedAt            string   `json:"startedAt"`
    EndedAt              string   `json:"endedAt"`
    DeviceName           string   `json:"deviceName"`
    Vendor               string   `json:"vendor"`
    ROM                  string   `json:"rom"`
    Wipe                 bool     `json:"wipe"`
    ARBMode              string   `json:"arbMode"`
    Result               string   `json:"result"`
    FlashedPartitions    []string `json:"flashedPartitions"`
    SkippedARBPartitions []string `json:"skippedArbPartitions"`
    Failures             []string `json:"failures"`
    Logs                 []string `json:"logs"`
}
```

### FlashReportSummary (new)

```go
type FlashReportSummary struct {
    SessionID  string `json:"sessionId"`
    StartedAt  string `json:"startedAt"`
    EndedAt    string `json:"endedAt"`
    DeviceName string `json:"deviceName"`
    ROM        string `json:"rom"`
    Result     string `json:"result"`
    Vendor     string `json:"vendor"`
}
```

### PropMap (new)

```go
type PropMap map[string]string
```

---

## Interfaces

### New Backend Methods (exposed to frontend via Wails)

| Method | Signature | Description |
|--------|-----------|-------------|
| `GetFlashReports` | `() ([]FlashReportSummary, error)` | List all reports sorted by date desc |
| `GetFlashReportDetail` | `(sessionID string) (*FlashReport, error)` | Get full report by session ID |
| `DeleteFlashReport` | `(sessionID string) error` | Delete a report by session ID |

### New Internal Functions

| Function | Signature | Description |
|----------|-----------|-------------|
| `getLicenseStatus` | `() LicenseResponse` | Thread-safe read of license state |
| `setLicenseStatus` | `(LicenseResponse)` | Thread-safe write of license state |
| `updateLicenseField` | `(func(*LicenseResponse))` | Thread-safe mutation of license state |
| `ParseGetpropOutput` | `(string) PropMap` | Parse `adb shell getprop` output |
| `getAdbPropsAll` | `(serial string) (PropMap, error)` | Batch property query |

### New Frontend Events

| Event | Payload | Description |
|-------|---------|-------------|
| `telegram_login_timeout` | `{message: string}` | Auth server auto-shutdown fired |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| License mutex deadlock | RWMutex with defer ensures no deadlock; accessor functions encapsulate lock/unlock |
| ToolsLock held after panic | `defer flasher.ToolsUnlock()` guarantees release on panic unwind |
| Nil FileInfo in Walk | Check `err != nil` and `info == nil` before any method call; skip entry |
| Auth server port conflict | `ListenAndServe` returns error immediately; timer still fires shutdown |
| Batch getprop failure | Fall back to individual `getAdbProp` calls |
| Report file corrupted JSON | Skip entry in `GetFlashReports`, return error in `GetFlashReportDetail` |
| Delete non-existent report | Return descriptive error with session ID |
| Log array overflow | Trim to 500 entries, discarding oldest |

---

## Testing Strategy

### Unit Tests (Go)
- License state: test `IsLicenseValid` with specific LicenseResponse values covering all branches
- `ParseGetpropOutput`: test with known input/output pairs including edge cases (empty lines, malformed entries)
- `GetFlashReports`: test with mock filesystem containing valid/invalid JSON files
- `DeleteFlashReport`: test deletion of existing and non-existing files

### Unit Tests (TypeScript)
- Log buffer hook: test append, trim at 500, and render throttling
- Style tag lifecycle: test mount/unmount/remount cycles

### Property-Based Tests
- License concurrent access: generate random read/write interleavings, run with race detector
- `IsLicenseValid` logic: generate random LicenseResponse structs, verify output matches specification
- `ParseGetpropOutput` round-trip: generate random property maps, format and parse
- Log buffer invariant: generate random append sequences, verify length <= 500
- Report sorting: generate random report sets, verify descending order
- Report deletion: generate random report sets and deletion targets, verify consistency
- License cache validity: generate random timestamps, verify TTL logic

### Integration Tests
- Device watcher shutdown: start watcher, cancel context, verify goroutine exits
- Auth server timeout: start server, wait for timeout, verify port released
- Batch getprop fallback: mock failed batch command, verify individual calls

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: License state concurrent access safety

*For any* interleaving of concurrent goroutines reading and writing the license state, the returned `LicenseResponse` SHALL always be a complete, valid struct (no partial field reads) and no data race SHALL be detected by the Go race detector.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: IsLicenseValid behavioral preservation

*For any* valid `LicenseResponse` value (with arbitrary `Result`, `Type`, `DaysLeft`, `ExpiryTS`, and `IsPro` fields), the `IsLicenseValid` function SHALL return `true` if and only if: (a) the type is a paid package AND result is not "EXPIRED", OR (b) the type is "TRIAL" AND result is not "EXPIRED" AND `DaysLeft > 0`.

**Validates: Requirements 1.4**

### Property 3: Tools lock release guarantee in dumpPayloadToImages

*For any* execution of `dumpPayloadToImages` that acquires the Tools_Lock — whether it completes normally, returns an error, or panics — the Tools_Lock SHALL be released before the function returns or unwinds.

**Validates: Requirements 3.1, 3.2**

### Property 4: Tools lock release guarantee in IsFastbootD

*For any* execution of `IsFastbootD` that acquires the Tools_Lock — whether it completes normally or panics — the Tools_Lock SHALL be released before the function returns or unwinds.

**Validates: Requirements 4.1, 4.2**

### Property 5: GetLibraryList nil-safety

*For any* filesystem state of the library directory (including entries with permission errors, broken symlinks, or corrupted metadata), `GetLibraryList` SHALL return a valid slice of `LibraryItem` without panicking, containing only entries that were successfully read.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 6: Batch getprop parsing round-trip

*For any* set of Android property key-value pairs (where keys match `[a-z0-9._]+` and values are arbitrary non-bracket strings), formatting them in the standard `[key]: [value]` getprop output format and parsing with `ParseGetpropOutput` SHALL recover all original key-value pairs.

**Validates: Requirements 7.1, 7.2, 7.4**

### Property 7: Log buffer size invariant

*For any* sequence of log entries appended to the flash log buffer, the buffer length SHALL never exceed 500 entries, and the buffer SHALL always contain the most recent entries (oldest discarded first).

**Validates: Requirements 8.2**

### Property 8: Style tag count invariant

*For any* sequence of Dashboard component mount and unmount operations, the number of dashboard style tags present in `document.head` SHALL equal the number of currently mounted Dashboard instances (at most 1).

**Validates: Requirements 9.1, 9.2, 9.3**

### Property 9: Flash reports sorted by date descending

*For any* set of flash report JSON files in the Reports directory with varying `startedAt` timestamps, `GetFlashReports` SHALL return summaries in strictly descending order by `startedAt`.

**Validates: Requirements 10.1**

### Property 10: Flash report deletion consistency

*For any* set of existing flash reports, deleting a report by session ID SHALL result in `GetFlashReports` returning the original set minus the deleted report. Deleting a non-existent session ID SHALL return an error.

**Validates: Requirements 10.4, 10.6**

### Property 11: License cache validity check

*For any* `LicenseCacheEntry` with a `CheckedAt` timestamp and the standard 86400-second TTL, `IsLicenseCacheEntryValid` SHALL return `true` if and only if `currentTimestamp < entry.ExpiresAt` (i.e., less than 24 hours have elapsed since the cache was written).

**Validates: Requirements 1.4**
