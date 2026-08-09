# Implementation Plan: FlashFlow v2 Polish

## Overview

This plan implements thread-safety fixes, graceful shutdown, deferred mutex releases, nil-pointer guards, auth server timeout, batched device queries, frontend performance fixes, and a new Flash History Dashboard. Tasks are ordered so foundational backend fixes come first, followed by the new feature, then frontend fixes, with integration wiring at the end.

## Tasks

- [x] 1. License state thread safety
  - [x] 1.1 Add RWMutex and accessor functions to app_license.go
    - Declare `licenseMu sync.RWMutex` alongside `globalLicenseStatus`
    - Implement `getLicenseStatus()`, `setLicenseStatus()`, and `updateLicenseField()` as defined in the design
    - _Requirements: 1.1, 1.2_

  - [x] 1.2 Refactor all direct reads/writes of globalLicenseStatus to use accessors
    - Replace all direct reads of `globalLicenseStatus` with `getLicenseStatus()` in `IsLicenseValid`, `checkLicenseExpiredAfterFlash`, and any other call sites
    - Replace all direct writes with `setLicenseStatus()` or `updateLicenseField()` in `CheckLicenseOnInit`, `ActivateLicense`, `HandleRE4HExpiry`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.3 Write property test for license concurrent access safety
    - **Property 1: License state concurrent access safety**
    - Run concurrent goroutines reading/writing license state with `-race` flag
    - **Validates: Requirements 1.1, 1.2, 1.3**

  - [ ]* 1.4 Write property test for IsLicenseValid behavioral preservation
    - **Property 2: IsLicenseValid behavioral preservation**
    - Generate random LicenseResponse structs and verify output matches specification logic
    - **Validates: Requirements 1.4**

- [x] 2. Device watcher graceful shutdown and batch getprop
  - [x] 2.1 Refactor deviceWatcher to use ticker with context cancellation
    - Replace `time.Sleep` with `time.NewTicker` and `select` on `ticker.C` and `ctx.Done()`
    - Ensure goroutine exits within one tick interval when context is cancelled
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 2.2 Implement batch getprop with ParseGetpropOutput
    - Add `PropMap` type alias and `ParseGetpropOutput` function to parse `[key]: [value]` format
    - Add `getAdbPropsAll(serial string) (PropMap, error)` method that runs single `adb shell getprop`
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 2.3 Integrate batch getprop into device watcher with fallback
    - Modify device detection path to call `getAdbPropsAll` first
    - If batch call fails, fall back to individual `getAdbProp` calls for each property
    - _Requirements: 7.3_

  - [ ]* 2.4 Write property test for ParseGetpropOutput round-trip
    - **Property 6: Batch getprop parsing round-trip**
    - Generate random property maps, format as `[key]: [value]` lines, parse and verify recovery
    - **Validates: Requirements 7.1, 7.2, 7.4**

- [x] 3. Deferred tools unlock fixes
  - [x] 3.1 Add defer ToolsUnlock in dumpPayloadToImages
    - In `flasher_oneplus.go`, move `flasher.ToolsUnlock()` to a `defer` immediately after `flasher.ToolsLock()`
    - Remove the manual `flasher.ToolsUnlock()` call that currently exists after command execution
    - _Requirements: 3.1, 3.2_

  - [x] 3.2 Add defer ToolsUnlock in IsFastbootD
    - In `fastbootd.go`, move `flasher.ToolsUnlock()` to a `defer` immediately after `flasher.ToolsLock()`
    - Remove the manual `flasher.ToolsUnlock()` call that currently exists after command execution
    - _Requirements: 4.1, 4.2_

- [x] 4. Nil pointer guard in GetLibraryList
  - [x] 4.1 Add error and nil checks in filepath.Walk callback
    - In `GetLibraryList` in `app.go`, check `err != nil` before accessing `info` methods
    - Add `info == nil` guard and return nil to skip problematic entries
    - Also guard `entry.Info()` calls in the outer entries loop
    - _Requirements: 5.1, 5.2, 5.3_

  - [ ]* 4.2 Write unit test for GetLibraryList nil-safety
    - **Property 5: GetLibraryList nil-safety**
    - Test with mock filesystem containing permission errors, broken symlinks, and corrupted metadata
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 5. Checkpoint - Ensure all backend fixes pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Auth server auto-shutdown timer
  - [x] 6.1 Add 120-second auto-shutdown timer to StartTelegramLogin
    - Use `time.AfterFunc(120*time.Second, ...)` to schedule `srv.Shutdown`
    - Emit `telegram_login_timeout` event when timer fires
    - Stop the timer when OAuth callback is received
    - Shut down server immediately after processing callback
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 7. Flash History Dashboard backend
  - [x] 7.1 Create app_history.go with FlashReportSummary type and GetFlashReports method
    - Define `FlashReportSummary` struct
    - Implement `GetFlashReports` that reads Reports directory, parses JSON files, returns sorted summaries
    - Handle non-existent directory by returning empty slice
    - _Requirements: 10.1, 10.5_

  - [x] 7.2 Implement GetFlashReportDetail and DeleteFlashReport methods
    - `GetFlashReportDetail(sessionID)` reads and returns full report
    - `DeleteFlashReport(sessionID)` validates input, checks existence, removes file
    - _Requirements: 10.3, 10.4, 10.6_

  - [ ]* 7.3 Write property test for flash reports sorted by date descending
    - **Property 9: Flash reports sorted by date descending**
    - Generate random report sets with varying timestamps, verify descending order
    - **Validates: Requirements 10.1**

  - [ ]* 7.4 Write property test for flash report deletion consistency
    - **Property 10: Flash report deletion consistency**
    - Generate random report sets and deletion targets, verify set minus deleted report
    - **Validates: Requirements 10.4, 10.6**

- [x] 8. Checkpoint - Ensure backend feature tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend log accumulation fix
  - [x] 9.1 Implement useFlashLogs hook with useRef-based buffer
    - Create a `useFlashLogs` hook (or refactor inline in DashboardPage.tsx)
    - Use `useRef<string[]>` for mutable log buffer with 500-entry cap
    - Throttle re-renders via `requestAnimationFrame`
    - Clean up animation frame on unmount
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.2 Integrate useFlashLogs into DashboardPage replacing current log state
    - Replace existing `useState`-based log accumulation with the new hook
    - Wire Wails event listener to call `appendLog` from the hook
    - _Requirements: 8.1, 8.3_

  - [ ]* 9.3 Write property test for log buffer size invariant
    - **Property 7: Log buffer size invariant**
    - Generate random append sequences, verify length never exceeds 500 and contains most recent entries
    - **Validates: Requirements 8.2**

- [x] 10. Style tag injection fix
  - [x] 10.1 Move style injection into useEffect with cleanup
    - Move the `DASHBOARD_STYLES` constant and style tag creation into a `useEffect` hook
    - Add `data-dashboard-styles` attribute for identification
    - Return cleanup function that removes the style element on unmount
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 10.2 Write unit test for style tag lifecycle
    - **Property 8: Style tag count invariant**
    - Test mount/unmount/remount cycles, verify no duplicate style tags
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 11. Flash History Dashboard frontend
  - [x] 11.1 Create FlashHistoryModal component with report list view
    - Create `frontend/src/components/dashboard/FlashHistoryModal.tsx`
    - Implement scrollable list showing date, device name, ROM, result status badge
    - Call `GetFlashReports` on mount to load summaries
    - Display empty state message when no reports exist
    - _Requirements: 10.2, 10.5_

  - [x] 11.2 Add report detail view and delete functionality
    - Implement click-to-expand detail view showing partitions, failures, duration
    - Call `GetFlashReportDetail` when a report is selected
    - Add delete button with confirmation that calls `DeleteFlashReport`
    - Update list after successful deletion
    - _Requirements: 10.3, 10.4_

  - [x] 11.3 Wire FlashHistoryModal into DashboardPage
    - Add a trigger button/menu item in DashboardPage to open the Flash History modal
    - Import and render `FlashHistoryModal` with open/close state management
    - _Requirements: 10.2_

- [x] 12. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The project uses Go (backend) and React/TypeScript (frontend) with Wails v2 framework
- Backend fixes (tasks 1-4) are independent and can be parallelized
- Frontend fixes (tasks 9-10) are independent of each other but depend on backend being stable

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "3.2", "4.1", "6.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.3", "2.4", "7.1"] },
    { "id": 3, "tasks": ["7.2", "9.1", "10.1"] },
    { "id": 4, "tasks": ["7.3", "7.4", "9.2", "10.2"] },
    { "id": 5, "tasks": ["9.3", "11.1"] },
    { "id": 6, "tasks": ["11.2"] },
    { "id": 7, "tasks": ["11.3"] }
  ]
}
```
