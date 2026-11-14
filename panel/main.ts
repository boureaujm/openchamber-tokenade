import { connectHost } from "@openchamber/sdk";
import { applyHostReady } from "@openchamber/sdk/ui";
import {
  createDashboardClient,
  createDashboardPoller,
  DashboardRequestError,
  formatTokens,
  formatUpdateNotice,
  isDashboardSnapshot,
  serviceStatusLabel,
  type DashboardSnapshot,
  type DashboardState,
} from "./dashboard";
import { loadPreferences, normalizeAccent, parseRefreshSeconds, savePreferences } from "./settings";

const host = connectHost();
const root = document.querySelector<HTMLElement>("#app");
let mounted = false;

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (!mounted && root) {
    mounted = true;
    void mountDashboard(root);
  }
});

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function loadSnapshot(): Promise<DashboardSnapshot> {
  const response = await host.serviceRequest({ method: "GET", path: "/dashboard" });
  const body = typeof response.body === "string" ? parseBody(response.body) : response.body;
  if (!body || typeof body !== "object") throw new DashboardRequestError("INVALID_SNAPSHOT", "Service response was invalid.");
  const payload = body as { ok?: unknown; data?: unknown; error?: { code?: unknown; message?: unknown } };
  if (response.status < 200 || response.status >= 300 || payload.ok !== true) {
    const code = typeof payload.error?.code === "string" ? payload.error.code : "SERVICE_FAILED";
    const message = typeof payload.error?.message === "string" ? payload.error.message : "Dashboard request failed.";
    throw new DashboardRequestError(code, message);
  }
  if (!isDashboardSnapshot(payload.data)) throw new DashboardRequestError("INVALID_SNAPSHOT", "Service returned an invalid snapshot.");
  return payload.data;
}

function parseBody(value: string): unknown {
  try { return JSON.parse(value); } catch { throw new DashboardRequestError("INVALID_JSON", "Service returned malformed JSON."); }
}

async function mountDashboard(container: HTMLElement): Promise<void> {
  let preferences = await loadPreferences(host.storage);
  applyAccentOverride(preferences.accent);
  const layout = element("div", "dashboard");
  const header = element("header", "dashboard-header");
  const brand = element("div", "brand");
  const mark = element("span", "brand-mark");
  mark.append(markIcon());
  const heading = element("div", "heading");
  heading.append(element("h1", undefined, "Tokenade"), element("p", "subtitle", "Locally recorded savings"));
  brand.append(mark, heading);
  const actions = element("div", "header-actions");
  const refresh = element("button", "refresh");
  const refreshLabel = element("span", undefined, "Refresh");
  refresh.type = "button";
  refresh.setAttribute("aria-label", "Refresh dashboard");
  refresh.append(refreshIcon(), refreshLabel);
  const settingsButton = element("button", "refresh settings-toggle");
  settingsButton.type = "button";
  settingsButton.setAttribute("aria-label", "Settings");
  settingsButton.setAttribute("aria-expanded", "false");
  settingsButton.setAttribute("aria-controls", "tokenade-settings");
  settingsButton.append(settingsIcon());
  const settingsPanel = element("section", "settings-panel");
  settingsPanel.id = "tokenade-settings";
  settingsPanel.hidden = true;
  settingsPanel.setAttribute("aria-labelledby", "settings-heading");
  const settingsHeading = element("h2", undefined, "Settings");
  settingsHeading.id = "settings-heading";
  const settingsFields = element("div", "settings-fields");
  const intervalInput = element("input");
  intervalInput.type = "number";
  intervalInput.min = "3";
  intervalInput.max = "60";
  intervalInput.step = "1";
  intervalInput.inputMode = "numeric";
  const intervalLabel = element("label", "settings-field");
  intervalLabel.append(element("span", undefined, "Refresh interval (seconds)"), intervalInput);
  const accentInput = element("input", "color-picker-input");
  accentInput.type = "color";
  accentInput.setAttribute("aria-label", "Choose accent color");
  const colorPicker = element("div", "color-picker");
  colorPicker.id = "tokenade-color-picker";
  colorPicker.hidden = true;
  colorPicker.setAttribute("role", "dialog");
  colorPicker.setAttribute("aria-labelledby", "color-picker-heading");
  const colorPickerHeading = element("h3", undefined, "Choose accent color");
  colorPickerHeading.id = "color-picker-heading";
  const colorPickerActions = element("div", "color-picker-actions");
  const cancelColor = element("button", undefined, "Cancel");
  cancelColor.type = "button";
  const acceptColor = element("button", "accept-color", "OK");
  acceptColor.type = "button";
  colorPickerActions.append(cancelColor, acceptColor);
  colorPicker.append(colorPickerHeading, accentInput, colorPickerActions);
  const accentSwatch = element("button", "color-swatch");
  accentSwatch.type = "button";
  accentSwatch.setAttribute("aria-label", "Choose accent color");
  accentSwatch.setAttribute("aria-labelledby", "accent-field-label");
  accentSwatch.setAttribute("aria-haspopup", "dialog");
  accentSwatch.setAttribute("aria-expanded", "false");
  accentSwatch.setAttribute("aria-controls", colorPicker.id);
  const accentControl = element("div", "color-control");
  accentControl.append(accentSwatch, colorPicker);
  const accentField = element("div", "settings-field");
  const accentFieldLabel = element("span", undefined, "Click to choose color");
  accentFieldLabel.id = "accent-field-label";
  accentField.append(accentFieldLabel, accentControl);
  settingsFields.append(intervalLabel, accentField);
  const settingsMessage = element("p", "settings-message");
  settingsMessage.setAttribute("role", "alert");
  const settingsActions = element("div", "settings-actions");
  const restoreAccent = element("button", undefined, "Restore default");
  restoreAccent.type = "button";
  const cancelSettings = element("button", undefined, "Cancel");
  cancelSettings.type = "button";
  const saveSettings = element("button", "save-settings", "Save");
  saveSettings.type = "button";
  settingsActions.append(restoreAccent, cancelSettings, saveSettings);
  settingsPanel.append(settingsHeading, settingsFields, settingsMessage, settingsActions);
  const serviceStatus = element("div", "service-status");
  const serviceStatusDot = element("span", "service-status-dot");
  const serviceStatusText = element("span", undefined, "Checking service…");
  serviceStatus.setAttribute("role", "status");
  serviceStatus.setAttribute("aria-live", "polite");
  serviceStatus.append(serviceStatusDot, serviceStatusText);
  actions.append(serviceStatus, settingsButton, refresh);
  header.append(brand, actions);
  const privilege = element("aside", "privilege", "The local service runs with your account permissions. Its “tokenade” permission is informational, not a system sandbox.");
  const status = element("div", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const loadingNotice = element("p", "notice", "Loading the Tokenade snapshot…");
  loadingNotice.dataset.status = "loading";
  loadingNotice.hidden = true;
  const errorNotice = element("p", "notice");
  errorNotice.dataset.status = "error";
  errorNotice.hidden = true;
  const updateNotice = element("p", "updated");
  updateNotice.dataset.status = "updated";
  updateNotice.hidden = true;
  const activityNotice = element("p", "notice", "No operations have been recorded yet.");
  activityNotice.dataset.status = "activity";
  activityNotice.hidden = true;
  const breakdownNotice = element("p", "notice", "No layer or operation details in this snapshot.");
  breakdownNotice.dataset.status = "breakdown";
  breakdownNotice.hidden = true;
  status.hidden = true;
  status.append(loadingNotice, errorNotice, updateNotice, activityNotice, breakdownNotice);
  const overview = element("section", "overview");
  overview.setAttribute("aria-label", "Tokenade savings");
  const summary = element("section", "summary");
  summary.setAttribute("aria-label", "Indicateurs Tokenade");
  const breakdowns = element("section", "breakdowns");
  layout.append(header, settingsPanel, status, overview, summary, breakdowns, privilege);
  container.replaceChildren(layout);

  let lastSnapshot: DashboardSnapshot | null = null;
  const client = createDashboardClient(loadSnapshot, (state) => {
    const snapshotChanged = state.snapshot !== lastSnapshot;
    renderState(state, status, overview, summary, breakdowns, snapshotChanged);
    lastSnapshot = state.snapshot;
  });
  const updateServiceStatus = async () => {
  try {
    const { status } = await host.serviceStatus();
    if (serviceStatus.dataset.state !== status) serviceStatus.dataset.state = status;
    const label = serviceStatusLabel(status);
    if (serviceStatusText.textContent !== label) serviceStatusText.textContent = label;
  } catch {
    if (serviceStatus.dataset.state !== "failed") serviceStatus.dataset.state = "failed";
    if (serviceStatusText.textContent !== "Service status unavailable") serviceStatusText.textContent = "Service status unavailable";
    }
  };
  const refreshDashboard = async () => {
    await client.refresh();
    await updateServiceStatus();
  };
  const createPoller = () => createDashboardPoller(
    refreshDashboard,
    () => document.visibilityState === "visible",
    preferences.refreshSeconds * 1_000,
  );
  let poller = createPoller();
  let draftAccent = preferences.accent;
  let pickerDirty = false;
  const syncAccentColor = (syncPicker = true) => {
    const color = draftAccent ?? resolveThemeAccent();
    accentSwatch.style.backgroundColor = color;
    if (syncPicker) accentInput.value = color;
  };
  const closeColorPicker = (accept: boolean, returnFocus = true) => {
    if (accept) draftAccent = normalizeAccent(accentInput.value);
    pickerDirty = false;
    colorPicker.hidden = true;
    accentSwatch.setAttribute("aria-expanded", "false");
    syncAccentColor();
    if (returnFocus) accentSwatch.focus();
  };
  const openColorPicker = () => {
    syncAccentColor();
    pickerDirty = false;
    colorPicker.hidden = false;
    accentSwatch.setAttribute("aria-expanded", "true");
    accentInput.focus();
  };
  const closeSettings = () => {
    if (!colorPicker.hidden) closeColorPicker(false, false);
    settingsPanel.hidden = true;
    settingsButton.setAttribute("aria-expanded", "false");
    settingsButton.focus();
  };
  const openSettings = () => {
    intervalInput.value = String(preferences.refreshSeconds);
    draftAccent = preferences.accent;
    syncAccentColor();
    settingsMessage.textContent = "";
    intervalInput.removeAttribute("aria-invalid");
    settingsPanel.hidden = false;
    settingsButton.setAttribute("aria-expanded", "true");
    intervalInput.focus();
  };
  settingsButton.addEventListener("click", () => {
    if (settingsPanel.hidden) openSettings();
    else closeSettings();
  });
  accentInput.addEventListener("input", () => { pickerDirty = true; });
  accentSwatch.addEventListener("click", () => {
    if (colorPicker.hidden) openColorPicker();
    else closeColorPicker(false);
  });
  cancelColor.addEventListener("click", () => closeColorPicker(false));
  acceptColor.addEventListener("click", () => closeColorPicker(true));
  colorPicker.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeColorPicker(false);
    }
  });
  const dismissColorPickerOutside = (event: PointerEvent) => {
    const target = event.target;
    if (!colorPicker.hidden && target instanceof Node &&
      !colorPicker.contains(target) && !accentSwatch.contains(target)) closeColorPicker(false, false);
  };
  document.addEventListener("pointerdown", dismissColorPickerOutside);
  restoreAccent.addEventListener("click", () => {
    draftAccent = undefined;
    syncAccentColor();
  });
  const discardSettings = () => {
    settingsMessage.textContent = "";
    intervalInput.removeAttribute("aria-invalid");
    closeSettings();
  };
  cancelSettings.addEventListener("click", discardSettings);
  settingsPanel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") discardSettings();
  });
  saveSettings.addEventListener("click", async () => {
    const refreshSeconds = parseRefreshSeconds(intervalInput.value);
    if (refreshSeconds === null) {
      intervalInput.setAttribute("aria-invalid", "true");
      settingsMessage.textContent = "Enter a whole number from 3 to 60 seconds.";
      intervalInput.focus();
      return;
    }
    const next = draftAccent ? { refreshSeconds, accent: draftAccent } : { refreshSeconds };
    try {
      await savePreferences(host.storage, next);
    } catch {
      settingsMessage.textContent = "Settings could not be saved. Your previous preferences are unchanged.";
      return;
    }
    const intervalChanged = refreshSeconds !== preferences.refreshSeconds;
    preferences = next;
    applyAccentOverride(preferences.accent);
    if (intervalChanged) {
      poller.dispose();
      poller = createPoller();
      poller.sync();
    }
    closeSettings();
  });
  const themeObserver = new MutationObserver(() => {
    if (settingsPanel.hidden || draftAccent !== undefined) return;
    syncAccentColor(colorPicker.hidden || !pickerDirty);
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-oc-theme", "style"],
  });
  refresh.addEventListener("click", () => { void refreshDashboard(); });
  const syncPolling = () => {
    poller.sync();
    if (document.visibilityState === "visible") void refreshDashboard();
  };
  const disposePolling = () => {
    poller.dispose();
    document.removeEventListener("visibilitychange", syncPolling);
    document.removeEventListener("pointerdown", dismissColorPickerOutside);
    themeObserver.disconnect();
  };
  document.addEventListener("visibilitychange", syncPolling);
  window.addEventListener("pagehide", disposePolling, { once: true });
  syncPolling();
}

function markIcon(): SVGSVGElement {
  return svgIcon("M2.5 12c0-4.23 0-6.345 1.198-7.747q.256-.3.555-.555C5.655 2.5 7.77 2.5 12 2.5s6.345 0 7.747 1.198q.3.256.555.555C21.5 5.655 21.5 7.77 21.5 12s0 6.345-1.198 7.747q-.256.3-.555.555C18.345 21.5 16.23 21.5 12 21.5s-6.345 0-7.747-1.198q-.3-.256-.555-.555C2.5 18.345 2.5 16.23 2.5 12Z M11.538 7.253a.547.547 0 0 1 .924 0l.622.978a8.8 8.8 0 0 0 2.685 2.685l.978.622a.547.547 0 0 1 0 .924l-.978.622a8.8 8.8 0 0 0-2.685 2.685l-.622.978a.547.547 0 0 1-.924 0l-.622-.978a8.8 8.8 0 0 0-2.685-2.685l-.978-.622a.547.547 0 0 1 0-.924l.978-.622a8.8 8.8 0 0 0 2.685-2.685z");
}

function refreshIcon(): SVGSVGElement {
  return svgIcon("M21 12a9 9 0 1 1-2.64-6.36 M21 3v6h-6");
}

function settingsIcon(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill-rule", "evenodd");
  path.setAttribute("clip-rule", "evenodd");
  path.setAttribute("d", "M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 0 0-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 0 0-2.282.819l-.922 1.597a1.875 1.875 0 0 0 .432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 0 0 0 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 0 0-.432 2.385l.922 1.597a1.875 1.875 0 0 0 2.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 0 0 2.28-.819l.923-1.597a1.875 1.875 0 0 0-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 0 0 0-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 0 0-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 0 0-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 0 0-1.85-1.567h-1.843ZM12 15.75a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z");
  svg.append(path);
  return svg;
}

function applyAccentOverride(accent?: string): void {
  if (accent) document.documentElement.style.setProperty("--tk-accent", accent);
  else document.documentElement.style.removeProperty("--tk-accent");
}

function resolveThemeAccent(): string {
  const probe = document.createElement("span");
  probe.style.color = "var(--tk-theme-accent)";
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return "#3ddc97";
  context.fillStyle = color;
  return normalizeAccent(context.fillStyle) ?? "#3ddc97";
}

function svgIcon(d: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.append(path);
  return svg;
}

function savingsRing(value: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, value));
  svg.setAttribute("viewBox", "0 0 96 96");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const track = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  track.setAttribute("class", "ring-track");
  track.setAttribute("cx", "48");
  track.setAttribute("cy", "48");
  track.setAttribute("r", String(radius));
  const arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  arc.setAttribute("class", "ring-value");
  arc.setAttribute("cx", "48");
  arc.setAttribute("cy", "48");
  arc.setAttribute("r", String(radius));
  arc.setAttribute("stroke-dasharray", `${circumference * progress / 100} ${circumference}`);
  arc.setAttribute("transform", "rotate(-90 48 48)");
  svg.append(track, arc);
  return svg;
}

function metric(key: string, label: string, value: string): HTMLElement {
  const card = element("article", "metric");
  const number = element("strong", "metric-value", value);
  number.dataset.value = key;
  card.append(element("span", "metric-label", label), number);
  return card;
}

function renderState(
  state: DashboardState,
  status: HTMLElement,
  overview: HTMLElement,
  summary: HTMLElement,
  breakdowns: HTMLElement,
  snapshotChanged: boolean,
): void {
  const loadingNotice = status.querySelector<HTMLElement>('[data-status="loading"]');
  if (loadingNotice) loadingNotice.hidden = !state.loading;
  const errorNotice = status.querySelector<HTMLElement>('[data-status="error"]');
  if (errorNotice) {
    errorNotice.hidden = !state.error;
    if (state.error) {
      const className = `notice ${state.stale ? "warning" : "error"}`;
      if (errorNotice.className !== className) errorNotice.className = className;
      if (errorNotice.textContent !== state.error.message) errorNotice.textContent = state.error.message;
    }
  }
  const updateNotice = formatUpdateNotice(state);
  const updateNoticeNode = status.querySelector<HTMLElement>('[data-status="updated"]');
  if (updateNoticeNode) {
    updateNoticeNode.hidden = !updateNotice;
    const className = state.stale ? "stale" : "updated";
    if (updateNoticeNode.className !== className) updateNoticeNode.className = className;
    if (updateNotice && updateNoticeNode.textContent !== updateNotice) updateNoticeNode.textContent = updateNotice;
  }
  const activityNotice = status.querySelector<HTMLElement>('[data-status="activity"]');
  if (activityNotice) activityNotice.hidden = !state.snapshot || state.snapshot.operations !== 0;
  const hasBreakdown = Boolean(state.snapshot?.by_layer?.length || state.snapshot?.per_op?.length);
  const breakdownNotice = status.querySelector<HTMLElement>('[data-status="breakdown"]');
  if (breakdownNotice) breakdownNotice.hidden = !state.snapshot || hasBreakdown;
  status.hidden = !(state.loading || state.error || updateNotice ||
    (state.snapshot !== null && (state.snapshot.operations === 0 || !hasBreakdown)));
  const data = state.snapshot;
  if (!data) return;
  if (!overview.childElementCount) {
    const savings = element("article", "hero-card hero-savings");
    const savingsCopy = element("div", "hero-copy");
    const savedValue = element("strong", "hero-value", formatTokens(data.tokens_saved));
    savedValue.dataset.value = "tokens_saved";
    savingsCopy.append(element("span", "eyebrow", "Tokens saved"), savedValue);
    const comparison = element("p", "hero-comparison");
    const before = element("span", "comparison-value", formatTokens(data.tokens_before));
    before.dataset.value = "tokens_before";
    const after = element("span", "comparison-value", formatTokens(data.tokens_after));
    after.dataset.value = "tokens_after";
    comparison.append(before, element("span", "comparison-arrow", "→"), after, element("span", "comparison-caption", "tokens before / after compaction"));
    savings.append(savingsCopy, comparison);

    const rate = element("article", "hero-card hero-rate");
    const ring = element("div", "savings-ring");
    ring.setAttribute("role", "img");
    ring.append(savingsRing(data.savings_pct), element("span", "ring-label", `${format(data.savings_pct)}%`));
    const rateCopy = element("div", "hero-copy");
    rateCopy.append(element("span", "eyebrow", "Savings rate"), element("p", "rate-caption", "of measured tokens"));
    rate.append(ring, rateCopy);
    overview.append(savings, rate);

    summary.append(
    metric("operations", "Operations", format(data.operations)),
    metric("tokens_before", "Tokens before", formatTokens(data.tokens_before)),
    metric("tokens_after", "Tokens after", formatTokens(data.tokens_after)),
    metric("cache_hits", "Cache hits", format(data.cache_hits)),
    metric("cache_misses", "Cache misses", format(data.cache_misses)),
    metric("hit_rate", "Hit rate", `${format(data.hit_rate)}%`),
    );
  }
  updateValue(overview, "tokens_saved", formatTokens(data.tokens_saved));
  updateValue(overview, "tokens_before", formatTokens(data.tokens_before));
  updateValue(overview, "tokens_after", formatTokens(data.tokens_after));
  updateSavingsRing(overview.querySelector<HTMLElement>(".savings-ring"), data.savings_pct);
  updateValue(summary, "operations", format(data.operations));
  updateValue(summary, "tokens_before", formatTokens(data.tokens_before));
  updateValue(summary, "tokens_after", formatTokens(data.tokens_after));
  updateValue(summary, "cache_hits", format(data.cache_hits));
  updateValue(summary, "cache_misses", format(data.cache_misses));
  updateValue(summary, "hit_rate", `${format(data.hit_rate)}%`);
  if (snapshotChanged) {
    breakdowns.replaceChildren();
    if (data.by_layer?.length) breakdowns.append(renderBreakdown("By layer", data.by_layer.map((row) => ({ name: row.layer, detail: `${format(row.n)} · ${formatTokens(row.saved)} tokens · ${format(row.pct)}%`, pct: row.pct }))));
    if (data.per_op?.length) breakdowns.append(renderBreakdown("By operation", data.per_op.map((row) => ({ name: row.op, detail: `${format(row.n)} · ${formatTokens(row.before)} → ${formatTokens(row.after)} tokens · ${format(row.pct)}%`, pct: row.pct }))));
  }
}

function updateValue(root: HTMLElement, key: string, value: string): void {
  const node = root.querySelector<HTMLElement>(`[data-value="${key}"]`);
  if (node && node.textContent !== value) node.textContent = value;
}

function updateSavingsRing(ring: HTMLElement | null, value: number): void {
  if (!ring) return;
  const ariaLabel = `${format(value)}% of tokens saved`;
  if (ring.getAttribute("aria-label") !== ariaLabel) ring.setAttribute("aria-label", ariaLabel);
  const label = ring.querySelector<HTMLElement>(".ring-label");
  const labelText = `${format(value)}%`;
  if (label && label.textContent !== labelText) label.textContent = labelText;
  const arc = ring.querySelector<SVGCircleElement>(".ring-value");
  if (arc) {
    const circumference = 2 * Math.PI * 40;
    const progress = Math.max(0, Math.min(100, value));
    const dasharray = `${circumference * progress / 100} ${circumference}`;
    if (arc.getAttribute("stroke-dasharray") !== dasharray) arc.setAttribute("stroke-dasharray", dasharray);
  }
}

function renderBreakdown(title: string, rows: Array<{ name: string; detail: string; pct: number }>): HTMLElement {
  const section = element("section", "breakdown");
  const heading = element("header", "breakdown-header");
  heading.append(element("h2", undefined, title), element("span", "breakdown-count", format(rows.length)));
  const list = element("ul", "breakdown-list");
  for (const row of rows) {
    const item = element("li", "breakdown-row");
    const top = element("div", "breakdown-meta");
    top.append(element("span", "breakdown-name", row.name), element("span", "breakdown-values", row.detail));
    const track = element("span", "breakdown-track");
    track.setAttribute("aria-hidden", "true");
    const fill = element("span", "breakdown-fill");
    fill.style.width = `${Math.max(0, Math.min(100, row.pct))}%`;
    track.append(fill);
    item.append(top, track);
    list.append(item);
  }
  section.append(heading, list);
  return section;
}

function format(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}
