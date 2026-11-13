# Tokenade Dashboard

OpenChamber extension for viewing locally recorded Tokenade savings and cache statistics.

## Features

- View token savings, savings rate, operation counts, and cache hit metrics.
- Explore breakdowns by layer and operation when the CLI provides them.
- Refresh on demand or automatically while the panel is visible.

## Install in OpenChamber

1. Open **Settings → Extensions**.
2. Install this repository:

   `https://github.com/boureaujm/openchamber-tokenade`

   The repository is private, so your OpenChamber environment must have access to it.
3. Approve the Tokenade local service when prompted.

The Tokenade CLI must be installed and available on the service's `PATH`. The extension supports OpenChamber `1.24.0` and later.

## Permissions

The host service runs the fixed `tokenade dashboard --json` command with shell execution disabled. OpenChamber asks for approval before starting the service. Its declared `exec` permission is advisory, not a sandbox: the service runs with your user privileges.

## Development

```sh
bun install --frozen-lockfile
bun run build
```

The build regenerates `panel/main.js` and `service/main.js`; edit their TypeScript sources instead of the generated bundles.

## How it works

The panel requests one-shot JSON snapshots and polls every 30 seconds while visible. The service normalizes the CLI's `cache_hit_rate` field to `hit_rate` for the panel.
