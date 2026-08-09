# Requirements Document

## Introduction

FlashFlow v2 Polish addresses critical bugs, performance improvements, and a new Flash History Dashboard feature for the FlashFlow ROM flashing tool. The tool is built with Go (backend) + React/TypeScript (frontend) using the Wails framework, targeting phone repair technicians who flash OnePlus devices.

## Glossary

- **FlashFlow**: The desktop ROM flashing application built with Go and Wails framework
- **License_Module**: The Go module responsible for managing license state via the `globalLicenseStatus` variable and related functions (`CheckLicenseOnInit`, `ActivateLicense`, `IsLicenseValid`, `HandleRE4HExpiry`)
- **Device_Watcher**: The background goroutine (`deviceWatcher`) that polls for connected Android devices via ADB and Fastboot at regular intervals
- **Tools_Lock**: The `flasher.ToolsLock()` / `flasher.ToolsUnlock()` mutex mechanism that serializes access to external CLI tools (adb, fastboot, payload-dumper-go)
- **Library_Manager**: The Go module responsible for listing ROM library items via `GetLibraryList`, which walks the library directory
- **Auth_Server**: The local HTTP server started by `StartTelegramLogin` on port 8123 to receive Telegram OAuth callbacks
- **Dashboard_Frontend**: The React component (`DashboardPage.tsx`) that renders the main UI including device status, logs, and action buttons
- **Flash_Report**: A JSON file stored in the `Reports/` directory containing session metadata (date, device, ROM, status, partitions flashed, errors)
- **Reports_Directory**: The `{library}/Reports/` folder where Flash Reports are saved after each flash session

---

## Requirements

### Requirement 1: License State Thread Safety

**User Story:** As a technician, I want the license check to be thread-safe, so that concurrent goroutines do not corrupt the license state causing unexpected flash blocks or crashes.

#### Acceptance Criteria

1. THE License_Module SHALL protect all reads of `globalLicenseStatus` with a `sync.RWMutex` read lock.
2. THE License_Module SHALL protect all writes to `globalLicenseStatus` with a `sync.RWMutex` write lock.
3. WHEN multiple goroutines access `globalLicenseStatus` concurrently, THE License_Module SHALL serialize access without data races detectable by `go run -race`.
4. THE License_Module SHALL maintain the existing behavior of `IsLicenseValid`, `CheckLicenseOnInit`, `ActivateLicense`, and `HandleRE4HExpiry` after adding mutex protection.

---

### Requirement 2: Device Watcher Graceful Shutdown

**User Story:** As a technician, I want the device watcher goroutine to stop cleanly when the application exits, so that no goroutine leaks or resource locks remain.

#### Acceptance Criteria

1. WHEN the application context is cancelled, THE Device_Watcher SHALL exit its polling loop within one polling interval.
2. THE Device_Watcher SHALL check `ctx.Done()` on each iteration of its `for` loop before performing device detection.
3. IF the application context is cancelled during a sleep interval, THEN THE Device_Watcher SHALL wake and exit without completing the current poll cycle.

---

### Requirement 3: Deferred Tools Unlock in dumpPayloadToImages

**User Story:** As a technician, I want the tools mutex to always be released after payload dumping, so that a panic or early return does not permanently lock the tool mutex and freeze the application.

#### Acceptance Criteria

1. WHEN `dumpPayloadToImages` acquires the Tools_Lock, THE FlashFlow SHALL release the Tools_Lock using a `defer` statement immediately after acquisition.
2. IF `dumpPayloadToImages` encounters an error or panic after acquiring the Tools_Lock, THEN THE FlashFlow SHALL still release the Tools_Lock before the function returns.

---

### Requirement 4: Deferred Tools Unlock in IsFastbootD

**User Story:** As a technician, I want the tools mutex to always be released after checking fastbootD mode, so that a panic does not permanently lock the tool mutex.

#### Acceptance Criteria

1. WHEN `IsFastbootD` acquires the Tools_Lock, THE FlashFlow SHALL release the Tools_Lock using a `defer` statement immediately after acquisition.
2. IF `IsFastbootD` encounters a panic after acquiring the Tools_Lock, THEN THE FlashFlow SHALL still release the Tools_Lock before the function unwinds.

---

### Requirement 5: Nil Pointer Guard in GetLibraryList

**User Story:** As a technician, I want the library listing to handle filesystem errors gracefully, so that a corrupted or inaccessible directory entry does not crash the application.

#### Acceptance Criteria

1. WHEN `filepath.Walk` invokes the callback in `GetLibraryList`, THE Library_Manager SHALL check the `err` parameter before accessing `info.IsDir()` or any other `os.FileInfo` method.
2. IF the `filepath.Walk` callback receives a non-nil error, THEN THE Library_Manager SHALL skip that entry and continue walking remaining entries.
3. THE Library_Manager SHALL not dereference a nil `os.FileInfo` pointer under any filesystem condition.

---

### Requirement 6: Auth Server Auto-Shutdown Timer

**User Story:** As a technician, I want the Telegram login server to automatically shut down after 2 minutes, so that an abandoned login flow does not leave a port occupied indefinitely.

#### Acceptance Criteria

1. WHEN `StartTelegramLogin` starts the local HTTP server, THE Auth_Server SHALL schedule an automatic shutdown after 120 seconds.
2. IF the OAuth callback is received before the 120-second timeout, THEN THE Auth_Server SHALL cancel the auto-shutdown timer and shut down immediately after processing the callback.
3. WHEN the 120-second timeout elapses without a callback, THE Auth_Server SHALL call `srv.Shutdown` to release port 8123.
4. WHEN the auto-shutdown timer fires, THE Auth_Server SHALL emit a `telegram_login_timeout` event to notify the frontend.

---

### Requirement 7: Device Watcher Batch Getprop

**User Story:** As a technician, I want device property queries to be batched into a single ADB command, so that device detection is faster and produces less USB traffic.

#### Acceptance Criteria

1. WHEN the Device_Watcher queries device properties via ADB, THE Device_Watcher SHALL combine multiple `getprop` calls into a single `adb shell getprop` command that returns all properties.
2. THE Device_Watcher SHALL parse the combined output to extract individual property values (model, OS version, battery, bootloader status).
3. WHEN the batched getprop command fails, THE Device_Watcher SHALL fall back to individual `getprop` calls for each property.
4. THE Device_Watcher SHALL complete a full device property query in one ADB shell invocation instead of multiple sequential invocations.

---

### Requirement 8: Frontend Log Accumulation Fix

**User Story:** As a technician, I want the flash log display to remain performant during long flash sessions, so that the UI does not freeze or consume excessive memory.

#### Acceptance Criteria

1. THE Dashboard_Frontend SHALL store log entries using a `useRef`-based mutable array instead of spreading the entire array into a new state on each log event.
2. THE Dashboard_Frontend SHALL limit the log array to a maximum of 500 entries, discarding the oldest entries when the limit is exceeded.
3. WHEN a new log entry arrives, THE Dashboard_Frontend SHALL append the entry in O(1) amortized time without copying the entire existing array.
4. THE Dashboard_Frontend SHALL trigger a re-render only when the visible log portion changes, not on every log append.

---

### Requirement 9: Style Tag Injection Fix

**User Story:** As a technician, I want the application styles to be managed properly, so that style tags are not leaked into the DOM on component re-mounts.

#### Acceptance Criteria

1. THE Dashboard_Frontend SHALL inject the custom style tag inside a `useEffect` hook with a cleanup function that removes the style tag on unmount.
2. WHEN the Dashboard component unmounts, THE Dashboard_Frontend SHALL remove the injected `<style>` element from `document.head`.
3. THE Dashboard_Frontend SHALL not create duplicate style tags when the component re-mounts.

---

### Requirement 10: Flash History Dashboard

**User Story:** As a technician, I want to browse my past flash reports in a modal UI, so that I can review previous sessions, check which devices were flashed, and clean up old reports.

#### Acceptance Criteria

1. THE FlashFlow SHALL provide a backend method `GetFlashReports` that reads all JSON files from the Reports_Directory and returns a list of report summaries sorted by date descending.
2. WHEN the user opens the Flash History modal, THE Dashboard_Frontend SHALL display a list of past flash reports showing date, device name, ROM name, and result status for each entry.
3. WHEN the user selects a report entry, THE Dashboard_Frontend SHALL display the full report details including flashed partitions, skipped partitions, failures, and session duration.
4. WHEN the user requests deletion of a report, THE FlashFlow SHALL remove the corresponding JSON file from the Reports_Directory and update the displayed list.
5. IF the Reports_Directory is empty or does not exist, THEN THE Dashboard_Frontend SHALL display an empty state message indicating no flash history is available.
6. THE FlashFlow SHALL provide a backend method `DeleteFlashReport` that accepts a session ID and deletes the matching report file, returning an error if the file does not exist.
