# Design

## Context

The current panel only connects to OpenChamber and applies the host theme; its HTML contains an empty app root. The SDK keeps the panel iframe sandboxed and provides an approved, host-managed local service with an authenticated loopback proxy. Tokenade documents one-shot JSON output from `tokenade dashboard --json`; `--watch` is text-only and incompatible with JSON.

## Goals / Non-Goals

**Goals:**
- Keep process execution outside the panel and retrieve snapshots through the SDK service proxy.
- Render only documented summary and breakdown data, with clear refresh and error states.
- Build both package entry points into the JavaScript files OpenChamber loads.

**Non-Goals:**
- Stream CLI output, display undocumented time series, or infer metrics absent from the JSON response.
- Run arbitrary user-supplied commands, inspect Tokenade's raw registry, or modify Tokenade data.
- Support runtimes that do not support OpenChamber guest services.

## Decisions

1. **Use an OpenChamber local service for CLI access.** Declare a service entry with the `tokenade` executable permission and call it only through `serviceRequest`. The panel never spawns processes, opens sockets, or chooses command arguments. The host requires user approval, but its `exec` list is advisory: an approved service has the user's full rights. Keep this explicit in the approval-facing description and use a fixed command with no shell interpolation. A direct panel process or socket path is unavailable in the sandbox and would violate the SDK boundary.

2. **Run one fixed CLI snapshot per service request.** The service handles `GET /dashboard`, executes `tokenade dashboard --json`, validates the JSON, and returns a bounded response containing the documented fields. Bind only to `127.0.0.1` and authenticate every request, including `/health`, with `OPENCHAMBER_SERVICE_TOKEN`. Do not use `--watch`: it redraws text and cannot produce JSON. If execution, parsing, or response-size validation fails, return a typed error rather than partial metrics.

3. **Poll every 30 seconds and allow manual refresh.** Fetch on panel open, then poll while the panel is active; a refresh action triggers the same request. Permit only one in-flight request and retain the last valid snapshot if a later poll fails. Thirty seconds is the initial interval to avoid launching the CLI as frequently as the text watch mode; no interval setting is added in this change.

4. **Render the documented data with host theme tokens.** Present the summary fields (`operations`, `tokens_before`, `tokens_after`, `tokens_saved`, `savings_pct`, `cache_hits`, `cache_misses`, `hit_rate`) and the available `by_layer` / `per_op` entries. Use the host theme API and responsive native panel layout; do not add a chart or date selector without documented date-series data.

5. **Keep build outputs generated.** Extend the existing Bun build script to bundle the panel as a classic script and the service for the Node runtime. Preserve `panel/main.js` as generated output; package the built service entry required by the manifest. Avoid new runtime dependencies unless the SDK contract proves insufficient.

## Risks / Trade-offs

- **The service runs with the user's full rights despite its declared executable list** → request only the `tokenade` permission, use a fixed executable and arguments with shell disabled, and rely on explicit host approval with the advisory-permission warning.
- **Tokenade may be missing from the service PATH or its JSON schema may change** → distinguish command-not-found from invalid output, validate required documented fields, and retain the last valid snapshot after refresh failures.
- **CLI startup or output can exceed host limits** → bound execution time and captured output; reject oversized responses with an actionable error rather than silently truncating them.
- **Polling starts a short-lived CLI process periodically** → poll only while the panel is active, use a 30-second interval, and prevent overlapping executions.

## Migration Plan

Update the extension manifest and build script, add the service and panel implementation, then rebuild the generated JavaScript. On installation or update, OpenChamber requests approval for the local service; until granted, the panel shows the approval state. Rollback consists of disabling or removing the extension; no Tokenade data is migrated or changed.

## Open Questions

None. The first release uses the documented snapshot fields and a fixed 30-second polling interval.
