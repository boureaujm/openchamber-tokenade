# Repository instructions

- This is an OpenChamber extension. `package.json` is its manifest; the panel entry is `panel/index.html`, with TypeScript source in `panel/main.ts`.
- `panel/main.js` is a generated classic bundle. After editing TypeScript, run `bun run build`; do not edit the bundle by hand. OpenChamber does not compile extension code.
- Setup/build: `bun install --frozen-lockfile`, then `bun run build`. No test or lint script is currently defined.
- The extension currently has no local service or Tokenade CLI integration. Do not assume the dashboard UI or data polling is implemented.
- Tokenade docs: `dashboard --watch` redraws text and cannot be combined with `--json`. For structured snapshots, poll one-shot `tokenade dashboard --json`; verify actual fields before relying on date-series or screenshot-only metrics. See https://tokenade.net/fr/docs/gain-dashboard-receipt.
- The panel iframe cannot spawn processes. If adding CLI execution, use the OpenChamber SDK local service and its loopback `serviceRequest` proxy; do not add arbitrary panel-side spawn or socket access.
- A declared SDK service requires user approval, but its `exec` permissions are advisory: the service runs with the user's full rights. Keep this risk explicit when changing the manifest. The service API has no streaming support; use polling for snapshots.
