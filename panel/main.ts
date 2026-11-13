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

const host = connectHost();
const root = document.querySelector<HTMLElement>("#app");
let mounted = false;

host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (!mounted && root) {
    mounted = true;
    mountDashboard(root);
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

function mountDashboard(container: HTMLElement): void {
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
  const serviceStatus = element("div", "service-status");
  const serviceStatusDot = element("span", "service-status-dot");
  const serviceStatusText = element("span", undefined, "Checking service…");
  serviceStatus.setAttribute("role", "status");
  serviceStatus.setAttribute("aria-live", "polite");
  serviceStatus.append(serviceStatusDot, serviceStatusText);
  actions.append(serviceStatus, refresh);
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
  layout.append(header, status, overview, summary, breakdowns, privilege);
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
  refresh.addEventListener("click", () => { void refreshDashboard(); });
  const poller = createDashboardPoller(refreshDashboard, () => document.visibilityState === "visible");
  const syncPolling = () => {
    poller.sync();
    if (document.visibilityState === "visible") void refreshDashboard();
  };
  const disposePolling = () => {
    poller.dispose();
    document.removeEventListener("visibilitychange", syncPolling);
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
