# Tasks

## 1. Preference module

- [x] 1.1 Create `panel/settings.ts` with interval constants (3–60 s, default 5), `parseRefreshSeconds`, `normalizeAccent`, and `loadPreferences` / `savePreferences` over the host storage shape; verify with `bun test panel/settings.test.ts`
- [x] 1.2 Add `panel/settings.test.ts` covering defaults, out-of-range and non-integer intervals, corrupt stored JSON, valid and invalid accent values, accent removal, and a failing store; verify `bun test panel/settings.test.ts` passes

## 2. Poller interval

- [x] 2.1 Replace `REFRESH_INTERVAL_MS` with `DEFAULT_REFRESH_INTERVAL_MS = 5_000` and let `createDashboardPoller` accept the interval; verify `bun test panel/dashboard.test.ts` passes with the updated expectations
- [x] 2.2 Add a poller test proving a non-default interval reaches the scheduler and that `dispose` clears it; verify `bun test panel/dashboard.test.ts` passes

## 3. Settings interface

- [ ] 3.1 Use `--tk-accent` for the ready dot and halo, keep warning/error indicators semantic, and add the settings form, gear, compact color swatch/popover, and narrow-width styles in `panel/index.html`; verify `bun run build` succeeds and the panel renders in light and dark themes at wide and narrow widths
- [ ] 3.2 Build the gear toggle, draft form, Save/Cancel/Escape, interval validation message, accent application, theme-accent updates, explicit color-picker OK/Cancel/outside cancellation, and Restore default in `panel/main.ts`; verify in OpenChamber that values survive a panel reload and that invalid interval and canceled color choices keep previous values
- [ ] 3.3 Load stored preferences before starting the poller and rebuild the poller when the saved interval changes; verify only one immediate refresh runs on open and a changed interval takes effect without reloading
- [x] 3.4 Document the panel settings, 5-second default, storage scope, and accent/status separation in `AGENTS.md`; verify the documented defaults match `panel/settings.ts`

## 4. Integration verification

- [x] 4.1 Run `bun run build` and `bun test` together; verify the generated `panel/main.js` contains the settings code and every test passes
- [x] 4.2 Run `openspec validate add-settings --strict`; verify the change and its delta spec pass
- [ ] 4.3 Check the running panel with the service approved: change the interval and accent, confirm picker Cancel/outside-click behavior, switch themes while settings is open, reload, restore the default accent, and confirm the ready dot still uses the host success colour
