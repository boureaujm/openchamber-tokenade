# Spec Delta

## Purpose

Shows locally recorded Tokenade savings and dashboard breakdowns inside the OpenChamber extension panel, using structured CLI snapshots.

## ADDED Requirements

### Requirement: Show Tokenade summary metrics
The dashboard SHALL display the summary metrics returned by `tokenade dashboard --json` without deriving undocumented values.

#### Scenario: Snapshot contains summary metrics
- **WHEN** a valid snapshot includes summary fields
- **THEN** the dashboard displays operations, tokens before and after, tokens saved, savings percentage, cache hits, cache misses, and hit rate

#### Scenario: Snapshot has no recorded operations
- **WHEN** a valid snapshot reports zero operations
- **THEN** the dashboard displays zero-valued summary metrics and an explanatory empty-activity message

### Requirement: Show available breakdowns
The dashboard SHALL render the layer and operation breakdowns present in the snapshot and SHALL NOT present undocumented time-series or screenshot-derived metrics.

#### Scenario: Snapshot contains breakdowns
- **WHEN** a valid snapshot includes `by_layer` or `per_op` entries
- **THEN** the dashboard displays the corresponding breakdowns using values supplied by the snapshot

#### Scenario: Snapshot omits a breakdown
- **WHEN** either breakdown is empty or absent
- **THEN** the dashboard omits that breakdown or shows a clear no-data state without inventing values

### Requirement: Refresh snapshots and communicate state
The dashboard SHALL load a snapshot when opened, refresh it periodically and on user request, and communicate loading and failure states.

#### Scenario: Initial load and periodic refresh
- **WHEN** the panel opens or its refresh interval elapses
- **THEN** the extension requests a one-shot JSON snapshot and updates the displayed data when the response is valid

#### Scenario: User requests refresh
- **WHEN** the user activates refresh
- **THEN** the extension requests a new snapshot and prevents overlapping refresh requests

#### Scenario: CLI is unavailable or returns invalid data
- **WHEN** the service cannot run the Tokenade CLI or cannot parse its response
- **THEN** the dashboard shows a specific actionable error instead of fabricated or partially parsed metrics

#### Scenario: Refresh fails after a successful load
- **WHEN** a later refresh fails
- **THEN** the last valid snapshot remains visible with a notice that it may be stale

### Requirement: Keep local CLI access host-mediated
The extension SHALL access the Tokenade CLI only through an approved OpenChamber local service and its service proxy, and SHALL disclose the service's execution privilege before relying on it.

#### Scenario: Service permission is not granted
- **WHEN** the host has not approved or has disabled the local service
- **THEN** the panel shows that local service approval or re-enabling is required and does not claim that data was loaded

#### Scenario: Approved service retrieves a snapshot
- **WHEN** the panel requests dashboard data through the host service proxy
- **THEN** the service runs the fixed `tokenade dashboard --json` command and returns a validated snapshot without exposing process or socket access to the panel

### Requirement: Follow the OpenChamber theme and viewport
The dashboard SHALL use the host-provided theme and remain usable within narrow panel widths.

#### Scenario: Host theme changes
- **WHEN** OpenChamber provides an updated theme
- **THEN** the dashboard updates its colors and surfaces to match the host

#### Scenario: Panel is narrow
- **WHEN** the panel viewport is too narrow for side-by-side content
- **THEN** summary metrics and breakdowns reflow without horizontal page scrolling
