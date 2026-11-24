# Proposal

## Why

The panel hard-codes a 30-second refresh interval and derives its accent colour from the host's semantic success colour, so users cannot choose how fresh the snapshot is or personalize the panel's accent. Both preferences are small, panel-local, and need no new host capability.

## What Changes

- Add a gear button in the panel header that shows and hides an English settings form, following the GitLab Pipelines extension pattern.
- Add an adjustable refresh interval, in seconds, defaulting to 5 seconds instead of the current fixed 30 seconds.
- Add an accent colour picker whose default swatch follows the current theme, with explicit **OK** / **Cancel** and click-away cancellation, plus **Restore default** to remove the override.
- Document the Tokenade CLI as a mandatory host dependency and explain the panel settings.
- Persist the accent override and refresh interval with the host's extension storage so they survive panel reloads.
- Color the ready-status dot and halo with the configured accent; keep the **Service is running** label neutral and warning/error indicators semantic.
- Validate interval input and report invalid values without saving them.

No service API, permission, or fixed CLI command changes. The OpenChamber SDK is a build-time dependency; the Tokenade CLI remains mandatory at runtime on the service host.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tokenade-dashboard`: refresh becomes user-configurable with a 5-second default, the panel gains a persisted accent override with a restore action, and the configured accent no longer alters semantic status colours.

## Impact

- `panel/main.ts`: header gear control, settings form, preference loading and applying.
- `panel/dashboard.ts`: replace the fixed `REFRESH_INTERVAL_MS` with a default constant and let the poller accept an interval.
- `panel/index.html`: settings form layout, accent override hook, status colour split.
- `panel/settings.ts` (new): interval and colour normalization, storage read/write, testable without the host.
- `panel/settings.test.ts` (new): validation and persistence tests.
- `panel/dashboard.test.ts`: interval expectations move from 30 seconds to the new default.
