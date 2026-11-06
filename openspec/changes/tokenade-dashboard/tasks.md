# Tasks

## 1. Local Tokenade service

- [x] 1.1 Add the host service with authenticated `/health` and `GET /dashboard` routes; run only `tokenade dashboard --json` without a shell, validate the documented snapshot, and bound runtime/output. Verify with Bun tests for authorization, valid output, missing CLI, malformed JSON, timeout, and oversized output.

## 2. Dashboard panel

- [x] 2.1 Add the panel data client and state handling for initial load, 30-second polling while active, manual refresh, no overlapping requests, service-disabled states, and stale-data retention. Verify with mocked service tests for success and failure transitions.
- [x] 2.2 Render documented summary metrics and available `by_layer` / `per_op` breakdowns using OpenChamber theme tokens and a narrow responsive layout. Verify metric formatting, zero-activity and missing-breakdown states, and theme updates with focused tests or a panel smoke check.

## 3. Package integration

- [x] 3.1 Declare the service and its `tokenade` executable permission in the manifest, and update the Bun build script to emit the panel and Node service bundles. Verify `bun run build` succeeds, both entry files exist, and the SDK accepts the manifest.
- [ ] 3.2 Install the built extension in a supported OpenChamber host and verify the approval warning, approval-denied state, successful snapshot, missing-CLI error, manual refresh, and narrow-panel layout; confirm the generated package contains all declared entries.
