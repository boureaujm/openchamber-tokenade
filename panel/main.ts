import { connectHost } from "@openchamber/sdk";
import { applyHostReady } from "@openchamber/sdk/ui";
import {
  createDashboardClient,
  createDashboardPoller,
  DashboardRequestError,
  formatUpdateNotice,
  isDashboardSnapshot,
  snapshotNotices,
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
  const heading = element("div", "heading");
  heading.append(element("h1", undefined, "Tokenade"), element("p", "subtitle", "Économies locales enregistrées"));
  const refresh = element("button", "refresh", "Actualiser");
  refresh.type = "button";
  header.append(heading, refresh);
  const privilege = element("p", "privilege", "Le service local utilise les droits de votre compte. Sa permission « tokenade » est indicative, pas une sandbox système.");
  const status = element("div", "status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const summary = element("section", "summary");
  summary.setAttribute("aria-label", "Résumé Tokenade");
  const breakdowns = element("section", "breakdowns");
  layout.append(header, privilege, status, summary, breakdowns);
  container.replaceChildren(layout);

  const client = createDashboardClient(loadSnapshot, (state) => renderState(state, status, summary, breakdowns, refresh));
  refresh.addEventListener("click", () => { void client.refresh(); });
  const poller = createDashboardPoller(() => client.refresh(), () => document.visibilityState === "visible");
  const syncPolling = () => poller.sync();
  const disposePolling = () => {
    poller.dispose();
    document.removeEventListener("visibilitychange", syncPolling);
  };
  document.addEventListener("visibilitychange", syncPolling);
  window.addEventListener("pagehide", disposePolling, { once: true });
  syncPolling();
  void client.refresh();
}

function metric(label: string, value: string): HTMLElement {
  const card = element("article", "metric");
  card.append(element("span", "metric-label", label), element("strong", "metric-value", value));
  return card;
}

function renderState(
  state: DashboardState,
  status: HTMLElement,
  summary: HTMLElement,
  breakdowns: HTMLElement,
  refresh: HTMLButtonElement,
): void {
  refresh.disabled = state.loading || state.refreshing;
  refresh.textContent = state.refreshing ? "Actualisation…" : "Actualiser";
  status.replaceChildren();
  if (state.loading) status.append(element("p", "notice", "Chargement du snapshot Tokenade…"));
  if (state.error) {
    const notice = element("p", `notice ${state.stale ? "warning" : "error"}`, state.error.message);
    status.append(notice);
  }
  const updateNotice = formatUpdateNotice(state);
  if (updateNotice) status.append(element("p", state.stale ? "stale" : "updated", updateNotice));
  summary.replaceChildren();
  breakdowns.replaceChildren();
  const data = state.snapshot;
  if (!data) return;
  summary.append(
    metric("Opérations", format(data.operations)),
    metric("Tokens avant", format(data.tokens_before)),
    metric("Tokens après", format(data.tokens_after)),
    metric("Tokens économisés", format(data.tokens_saved)),
    metric("Économies", `${format(data.savings_pct)}%`),
    metric("Cache hits", format(data.cache_hits)),
    metric("Cache misses", format(data.cache_misses)),
    metric("Hit rate", `${format(data.hit_rate)}%`),
  );
  for (const notice of snapshotNotices(data)) status.append(element("p", "notice", notice));
  if (data.by_layer?.length) breakdowns.append(renderBreakdown("Par couche", data.by_layer.map((row) => ({ name: row.layer, detail: `${format(row.n)} · ${format(row.saved)} tokens · ${format(row.pct)}%` }))));
  if (data.per_op?.length) breakdowns.append(renderBreakdown("Par opération", data.per_op.map((row) => ({ name: row.op, detail: `${format(row.n)} · ${format(row.before)} → ${format(row.after)} tokens · ${format(row.pct)}%` }))));
}

function renderBreakdown(title: string, rows: Array<{ name: string; detail: string }>): HTMLElement {
  const section = element("section", "breakdown");
  section.append(element("h2", undefined, title));
  const list = element("ul", "breakdown-list");
  for (const row of rows) {
    const item = element("li", "breakdown-row");
    const label = element("span", "breakdown-name", row.name);
    const values = element("span", "breakdown-values", row.detail);
    item.append(label, values);
    list.append(item);
  }
  section.append(list);
  return section;
}

function format(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}
