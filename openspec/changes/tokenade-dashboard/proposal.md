# Proposal

## Why

The package currently provides only a minimal OpenChamber panel shell; it does not show Tokenade dashboard data. Users need an in-app view of their locally recorded savings without leaving OpenChamber.

## What Changes

- Add a themed dashboard panel for the documented Tokenade summary and breakdown metrics.
- Add a host-managed local service that reads structured snapshots from `tokenade dashboard --json` and exposes them to the sandboxed panel.
- Provide loading, empty, unavailable-CLI, and error states, plus refresh by polling one-shot snapshots.
- Request the service capability explicitly and explain that its `exec` permission is advisory and the service runs with the user's full rights.

## Capabilities

### New Capabilities
- `tokenade-dashboard`: display and refresh local Tokenade dashboard metrics in OpenChamber.

### Modified Capabilities

## Impact

- Panel: `panel/main.ts`, `panel/index.html`, and generated `panel/main.js`.
- Local service: new service source and generated JavaScript, declared in `package.json`.
- OpenChamber SDK: use the guest local-service and `serviceRequest` proxy; no panel-side process spawning or socket access.
- Tokenade CLI: consume `tokenade dashboard --json` snapshots. Do not rely on `--watch` (text-only) or undocumented time-series/screenshot metrics.
- Build: bundle both panel and service JavaScript; the host does not compile TypeScript.
