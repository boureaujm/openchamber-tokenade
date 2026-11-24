# Design

## Context

See `proposal.md` - Why.

The panel is plain DOM built in `panel/main.ts`; `panel/dashboard.ts` holds the testable state machine, snapshot validation, and the poller, and is covered by `panel/dashboard.test.ts` with `bun:test`. `panel/index.html` defines the `--tk-*` tokens, where `--tk-accent` currently resolves from the host's semantic `--status-success` and feeds both decorative accents and the "service ready" dot.

The panel runs in a sandboxed iframe with no settings contribution in the SDK. `connectHost()` exposes `storage.get/set/delete/keys`, described by the SDK as device-scoped extension preference data partitioned by host identity and installation. The SDK UI kit has no colour picker, so the form uses native form controls. The Tokenade CLI is a mandatory runtime dependency on the service host; the OpenChamber SDK is used at build time and bundled into the panel/service output.

## Goals / Non-Goals

**Goals:**

- Panel-local settings with a gear toggle, English copy, and no host API or service changes.
- Refresh interval configurable between 3 and 60 whole seconds, default 5, applied without reload.
- Accent override initialized from the theme-resolved accent, persisted, and resettable.
- The ready dot follows the configured accent; warning and error indicators keep semantic host colours.
- Preference parsing and persistence testable without a DOM or a live host.

**Non-Goals:**

- OpenChamber **Settings → Extensions** integration.
- Per-project preferences.
- Alpha or gradient accents; `input type="color"` yields opaque `#rrggbb` only.
- Live preview while typing; the form commits on Save.
- Changing the service contribution, permissions, or fixed CLI command.

### Build dependency boundary

Keep the OpenChamber SDK in `devDependencies`: the build bundles it into the panel and Node service outputs. The Tokenade CLI is not bundled and remains a required executable on the service host's `PATH`.

## Decisions

### Pure preference module

Add `panel/settings.ts` with the interval constants (`MIN_REFRESH_SECONDS = 3`, `MAX_REFRESH_SECONDS = 60`, `DEFAULT_REFRESH_SECONDS = 5`), `parseRefreshSeconds`, `normalizeAccent`, and `loadPreferences` / `savePreferences` over a structural `{ get, set, delete }` store. `main.ts` keeps only DOM work and host calls, mirroring the existing `dashboard.ts` / `main.ts` split. Tests for the module run without a DOM.

*Alternative:* put everything in `main.ts`. Rejected because the project has no DOM test harness and validation/persistence would stay untested.

### One versioned storage key

Persist `{ accent?: string, refreshSeconds?: number }` under `tokenade:preferences:v1`. A single read and a single write per save keep the two fields consistent; removing the accent restores the theme default. Corrupt or unknown content is ignored and replaced by defaults on the next save.

*Alternative:* one key per field, as the GitLab extension does. Rejected because the fields are saved together and a single record is simpler to validate.

### Poller takes the interval as a parameter

Rename `REFRESH_INTERVAL_MS` to `DEFAULT_REFRESH_INTERVAL_MS = 5_000` and change the poller to `createDashboardPoller(refresh, isActive, intervalMs = DEFAULT_REFRESH_INTERVAL_MS, schedule, cancel)`. Saving a new interval disposes the current poller, creates a new one, and syncs it, so no stale timer survives. This keeps one scheduling path and no mutable timer state.

*Alternative:* a `setInterval(ms)` method on the poller. Rejected as extra state for the same result.

### Preferences load before the first poll

The panel renders with defaults, then reads storage once and applies the stored accent and interval before starting the poller. This avoids an initial fetch at the default interval followed immediately by a resync at the stored one. If the read fails, defaults are used and the dashboard still loads.

### Separate theme accent from saved override

CSS keeps `--tk-theme-accent` tied to the current host success token (with the light theme's existing override) and makes `--tk-accent` reference it. A saved accent sets `--tk-accent` inline; `main.ts` resolves the default from `--tk-theme-accent` through a probe element and canvas normalization, without removing the saved override. A root attribute observer refreshes the open swatch when host theme tokens or mode change, but leaves saved and in-progress custom colors alone. If normalization fails, the picker falls back to `#3ddc97`.

### Accent the ready indicator

`--tk-accent` colors the ready dot and halo along with the brand mark, hero value, savings ring, breakdown bars, and focus ring. The **Service is running** label stays neutral; starting, stopped, and failed indicators retain host warning/error colors.

### Settings form interaction

The gear sits in `header-actions` next to Refresh, uses the solid Heroicons `cog-6-tooth` path, and exposes `aria-expanded` and `aria-controls`. The form is inserted below the header as a labelled group with:

- a number input (min 3, max 60, step 1) for seconds;
- a compact swatch labelled **Click to choose color** that opens a color-picker popover with a native color input and explicit **OK** / **Cancel** buttons;
- **Restore default** (draft only), **Cancel**, and **Save**.

Changes stay as a draft. Picker **OK** accepts a candidate into the form draft; picker **Cancel**, Escape, and clicking outside discard only that candidate. Main-form Save validates, persists, applies the accent, rebuilds the poller, and closes the form. An invalid interval shows a `role="alert"` message and keeps the previous saved value. Main-form Cancel and Escape discard the draft. The form is English like the rest of the panel.

## Risks / Trade-offs

- **A 5-second default launches the CLI six times more often than 30 seconds** (12 vs 2 per visible minute) → the client's in-flight guard prevents overlap, polling runs only while the panel is visible, and 3 seconds is the hard floor. Users who care can raise the interval.
- **A low-contrast accent can make the large savings figure hard to read** → the accent stays on large text and decorations, body copy keeps theme colours, and Restore default is always available.
- **Theme tokens may be wide-gamut colours that the picker cannot show** → normalization falls back to the documented accent; the user can still pick any standard colour.
- **Device-scoped storage means another device starts from defaults** → accepted; settings are cosmetic and local.
- **Rebuilding the poller could leave two timers if disposal is skipped** → the save path always calls `dispose()` before creating the replacement.

## Migration Plan

No data migration. With no stored record the panel behaves as before except for the new 5-second default. Rollback: revert the panel files and remove `panel/settings.ts`; an orphaned `tokenade:preferences:v1` entry is ignored by the old build.
