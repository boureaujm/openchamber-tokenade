# Spec Delta

## MODIFIED Requirements

### Requirement: Refresh snapshots and communicate state

The dashboard SHALL load a snapshot when opened, refresh it periodically at the user-configured interval, defaulting to 5 seconds, and on user request, and communicate loading and failure states.

#### Scenario: Initial load and periodic refresh

- **WHEN** the panel opens or the configured refresh interval elapses
- **THEN** the extension requests a one-shot JSON snapshot and updates the displayed data when the response is valid

#### Scenario: Changed interval takes effect

- **WHEN** the user saves a different refresh interval
- **THEN** subsequent periodic refreshes use the new interval without reloading the panel, and refresh requests still never overlap

#### Scenario: User requests refresh

- **WHEN** the user activates refresh
- **THEN** the extension requests a new snapshot and prevents overlapping refresh requests

#### Scenario: CLI is unavailable or returns invalid data

- **WHEN** the service cannot run the Tokenade CLI or cannot parse its response
- **THEN** the dashboard shows a specific actionable error instead of fabricated or partially parsed metrics

#### Scenario: Refresh fails after a successful load

- **WHEN** a later refresh fails
- **THEN** the last valid snapshot remains visible with a notice that it may be stale

### Requirement: Follow the OpenChamber theme and viewport

The dashboard SHALL use the host-provided theme and remain usable within narrow panel widths, and a configured accent SHALL affect only decorative elements.

#### Scenario: Host theme changes

- **WHEN** OpenChamber provides an updated theme
- **THEN** the dashboard updates its colors and surfaces to match the host

#### Scenario: Panel is narrow

- **WHEN** the panel viewport is too narrow for side-by-side content
- **THEN** summary metrics and breakdowns reflow without horizontal page scrolling

#### Scenario: Custom accent is active

- **WHEN** a saved accent override exists
- **THEN** decorative accents use it while semantic status indicators keep the host success, warning, and error colors

## ADDED Requirements

### Requirement: Provide panel preferences

The panel header SHALL provide a settings control that shows and hides a form for the refresh interval and accent color, in English, and the panel SHALL validate and persist saved values.

#### Scenario: Settings control toggles the form

- **WHEN** the user activates the settings control
- **THEN** the settings form appears, and activating the control again hides it
- **AND** the control exposes its expanded state to assistive technology

#### Scenario: Defaults without stored preferences

- **WHEN** no stored preference exists
- **THEN** the interval field shows 5 seconds and the color field shows the current theme-resolved accent

#### Scenario: Theme changes while choosing the default accent

- **WHEN** the host theme changes while the settings form is open and no saved or draft accent override exists
- **THEN** the color swatch updates to the new theme-resolved accent

#### Scenario: Color choice requires confirmation

- **WHEN** the user changes the candidate color in the picker and activates **OK**
- **THEN** the selected color becomes the settings draft but is not persisted until the main form is saved

#### Scenario: Color choice is canceled

- **WHEN** the user activates picker **Cancel**, presses Escape, or clicks outside the picker
- **THEN** the candidate color is discarded and the settings draft remains unchanged

#### Scenario: Interval is validated

- **WHEN** the user saves an interval that is not a whole number of seconds between 3 and 60
- **THEN** the panel shows a validation message and keeps the previously saved interval

#### Scenario: Accent is applied and persisted

- **WHEN** the user saves a different accent color
- **THEN** the panel uses that accent and the override is restored after the panel reloads

#### Scenario: Restore the default accent

- **WHEN** the user activates Restore default and saves
- **THEN** the stored accent override is removed and the panel uses the theme-resolved accent again

#### Scenario: Cancel discards the draft

- **WHEN** the user changes values and then cancels
- **THEN** the form closes without saving and the panel keeps the previous values

#### Scenario: Storage failure does not break the dashboard

- **WHEN** reading or writing a preference fails
- **THEN** the dashboard keeps working with defaults and reports that the preference was not saved
