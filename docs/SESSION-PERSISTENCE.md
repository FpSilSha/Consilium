# Session persistence work — 2026-09-28

Scope: versioned session saves, budget and existing summary persistence, autosave coverage, validation before restore, and session-switch races. Spending ledgers, compaction algorithms, and subscription integrations remain separate work.

## Delivered

- New saves use version 2 and include the session budget, loop count, and each advisor's existing compacted summary. Version 1 remains readable; absent budget and loop count default to zero and absent summaries to null. Summaries already omitted by old saves cannot be recovered from those files. Older application builds that only accept version 1 cannot open new version 2 saves.
- One persisted-state projection drives serialization and autosave change detection. Instructions, advisor configuration, existing message edits, queue changes, budgets, summaries, document references, and compile spending trigger a debounced save. Stream chunks and unrelated UI changes do not restart the timer.
- An existing session can be saved after its last advisor/message is removed, and the close-time flush persists its latest settings. Autosave subscriptions survive the setup/cleanup cycle used by React StrictMode.
- Restore suppression covers the synchronous state replacement, replacing the previous arbitrary 100 ms delay. The next user edit can save immediately after restoration.
- Session loads validate nested data before clearing state, flush the outgoing session, retain it on a save failure, and discard stale load results. Edits made during an outgoing disk write are flushed before the switch completes.
- Document IDs are restored before asynchronous document reads finish, so autosave and closing cannot write the previous session's IDs. Hydration respects additions/removals during loading and discards results from an earlier restoration, including when the same session is reopened.
- New sessions reset their budget and loop count and apply the global auto-compaction default.

## Verification

On 2026-09-28, the initial 841-test baseline passed. Regression tests reproduced missing persistence, stale loads, malformed-file partial restoration, and the unsaved-session ID edge case before fixes. Final verification: **881 tests passed across 45 files**, both TypeScript projects passed, production build passed, and `git diff --check` passed. The 40 new tests use the real Zustand store, fake timers, and mocked persistence IPC. Existing dynamic/static import build warnings remain.

## Remaining boundaries

This pass preserves existing summaries; it does not implement the proposed complete-transcript compaction design or make normal advisor dispatch consume summaries. Spending lost when advisors are removed, summarization usage, request reservations, and session-scoped cancellation still need a separate accounting/lifecycle pass. OS-level interrupted-write recovery and packaged Electron restart/close tests were not exercised; the main-process file writer is unchanged. No paid model calls were made.
