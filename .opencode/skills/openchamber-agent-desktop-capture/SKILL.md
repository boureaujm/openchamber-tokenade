---
name: openchamber-agent-desktop-capture
description: Use whenever capturing OpenChamber itself or an OpenChamber extension with Agent Desktop in this repository. Documents the app's accessible control names for enabling extension panels and switching themes, plus safe screenshot and verification steps.
license: MIT
compatibility: Requires the Agent Desktop CLI, a Linux graphical session, and the OpenChamber desktop app.
---

# OpenChamber screenshots with Agent Desktop

Use this project skill together with the user-level `agent-desktop-linux-capture` skill. That skill covers Linux display and portal behavior; this one covers OpenChamber navigation.

## References are temporary

Agent Desktop refs such as `@s123:e4` belong to one snapshot. They are not stable OpenChamber element IDs. Never store them in instructions or reuse them after a UI change. The `base-ui-_r_*` native IDs are generated too.

Find controls by role and accessible name, then use the fresh ref returned by `find`:
In the examples below, replace `<fresh-ref-from-find>` with the exact `ref_id` printed by the immediately preceding `find`.

```sh
agent-desktop find --app openchamber --role button --name "Configure panels" --exact
agent-desktop click <fresh-ref-from-find>
```

After every click that changes the UI, take a fresh `find` or `snapshot` before the next action. These names were observed in the current English UI; if a name stops matching, inspect a fresh snapshot instead of guessing or using coordinates.

## Show an extension panel

1. Check that the OpenChamber window is running:

   ```sh
   agent-desktop list-windows
   ```

2. Find and click the **Configure panels** button:

   ```sh
   agent-desktop find --app openchamber --role button --name "Configure panels" --exact
   agent-desktop click <fresh-ref-from-find>
   ```

3. Find the panel switch by the extension's displayed name. For Tokenade:

   ```sh
   agent-desktop find --app openchamber --role switch --name "Tokenade" --exact
   agent-desktop is <fresh-ref-from-find> --property checked
   ```

   Click the switch only if it is off; don't toggle blindly. Run `find` again after clicking and verify the new ref is checked.

4. Confirm the requested extension is the visible panel before capturing. For Tokenade, look for its panel heading and inspect the screenshot; don't rely on the switch state alone.

## Switch OpenChamber theme

Use the **global** OpenChamber Settings button, not the extension's own gear button:

1. Find and click the unique global Settings button:

   ```sh
   agent-desktop find --app openchamber --role button --name "Settings" --exact
   agent-desktop click <fresh-ref-from-find>
   ```

2. In the **Color mode** group, find the requested radio option (`Dark` or `Light`):

   ```sh
   agent-desktop find --app openchamber --role radiobutton --name "Dark" --exact
   agent-desktop is <fresh-ref-from-find> --property checked
   ```

   Click the radio only when it is not already selected, then find it again and verify `checked`.

3. Close the dialog with **Close settings**:

   ```sh
   agent-desktop find --app openchamber --role button --name "Close settings" --exact
   agent-desktop click <fresh-ref-from-find>
   ```

Record the original theme and restore it after capturing all requested variants.

## Capture the correct display

Follow the user-level Linux screenshot skill for X11/Wayland and portal consent. On Wayland, Agent Desktop captures a display, not a window. Map OpenChamber's `list-windows` bounds to `list-displays`; screen `0` means the primary display, not necessarily the display containing OpenChamber.

```sh
agent-desktop list-displays
agent-desktop list-windows
agent-desktop screenshot --screen <display-index> /tmp/opencode/openchamber-dark.png
```

Inspect each image immediately. A reported focused window does not prove that the selected display contains it; one capture in this project showed Nautilus on screen `0` while OpenChamber was on screen `1`.

## Prepare README images

Crop each full-display capture to the extension panel using the current screenshot's visible bounds; do not reuse old pixel coordinates across layouts. Keep chat, sidebars, and other windows out of the final image.

Tokenade panels contain local usage metrics. Before publishing images for this project, mask the timestamp, counts, rates, and data-bearing charts. Preserve the UI's labels and disclose in the README that values are masked.

Use paired names such as `docs/panel.png` (dark) and `docs/panel-light.png` (light). Keep only the sanitized images in the repository, delete raw temporary captures, and restore the original theme and panel-enabled state.
