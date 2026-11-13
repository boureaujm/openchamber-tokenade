export const REFRESH_INTERVAL_MS = 30_000;

export type ServiceStatus = "stopped" | "starting" | "ready" | "failed";

export function serviceStatusLabel(status: ServiceStatus): string {
  return status === "ready" ? "Service is running"
    : status === "starting" ? "Service is starting"
      : status === "failed" ? "Service failed"
        : "Service is stopped";
}

export type DashboardSnapshot = {
  operations: number;
  tokens_before: number;
  tokens_after: number;
  tokens_saved: number;
  savings_pct: number;
  cache_hits: number;
  cache_misses: number;
  hit_rate: number;
  by_layer?: Array<{ layer: string; before: number; after: number; saved: number; n: number; pct: number }>;
  per_op?: Array<{ op: string; before: number; after: number; n: number; pct: number }>;
};

export type DashboardErrorKind = "approval" | "disabled" | "cli-missing" | "invalid" | "unavailable" | "failed";

export type DashboardError = {
  kind: DashboardErrorKind;
  message: string;
};

export type DashboardState = {
  snapshot: DashboardSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: DashboardError | null;
  updatedAt: Date | null;
};

export type DashboardEvent =
  | { type: "start" }
  | { type: "success"; snapshot: DashboardSnapshot; at?: Date }
  | { type: "failure"; error: DashboardError };

export function isDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const snapshot = value as Record<string, unknown>;
  const required = [
    "operations", "tokens_before", "tokens_after", "tokens_saved", "savings_pct",
    "cache_hits", "cache_misses", "hit_rate",
  ];
  if (!required.every((key) => typeof snapshot[key] === "number" && Number.isFinite(snapshot[key]))) return false;
  if (snapshot.by_layer != null && (!Array.isArray(snapshot.by_layer) || !snapshot.by_layer.every((entry) =>
    typeof entry?.layer === "string" && ["before", "after", "saved", "n", "pct"].every((key) => Number.isFinite(entry[key]))))) return false;
  if (snapshot.per_op != null && (!Array.isArray(snapshot.per_op) || !snapshot.per_op.every((entry) =>
    typeof entry?.op === "string" && ["before", "after", "n", "pct"].every((key) => Number.isFinite(entry[key]))))) return false;
  return true;
}

export function initialDashboardState(): DashboardState {
  return { snapshot: null, loading: false, refreshing: false, stale: false, error: null, updatedAt: null };
}

export function snapshotNotices(snapshot: DashboardSnapshot): string[] {
  const notices: string[] = [];
  if (snapshot.operations === 0) notices.push("No operations have been recorded yet.");
  if (!snapshot.by_layer?.length && !snapshot.per_op?.length) {
    notices.push("No layer or operation details in this snapshot.");
  }
  return notices;
}

export function formatUpdateNotice(state: DashboardState, time = state.updatedAt?.toLocaleTimeString("en-US")): string | null {
  if (!time || !state.updatedAt) return null;
  return state.stale
    ? `Last valid snapshot: ${time}. Data may be stale.`
    : `Last refreshed: ${time}.`;
}

export function createDashboardPoller(
  refresh: () => Promise<void>,
  isActive: () => boolean,
  schedule: typeof setInterval = setInterval,
  cancel: typeof clearInterval = clearInterval,
) {
  let timer: ReturnType<typeof setInterval> | undefined;
  const sync = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
    if (isActive()) {
      timer = schedule(() => {
        if (isActive()) void refresh();
      }, REFRESH_INTERVAL_MS);
    }
  };
  const dispose = () => {
    if (timer !== undefined) cancel(timer);
    timer = undefined;
  };
  return { sync, dispose };
}

export function reduceDashboardState(state: DashboardState, event: DashboardEvent): DashboardState {
  if (event.type === "start") {
    return { ...state, loading: state.snapshot === null, refreshing: state.snapshot !== null, error: null, stale: false };
  }
  if (event.type === "success") {
    return { snapshot: event.snapshot, loading: false, refreshing: false, stale: false, error: null, updatedAt: event.at ?? new Date() };
  }
  return {
    ...state,
    loading: false,
    refreshing: false,
    stale: state.snapshot !== null,
    error: event.error,
  };
}

export function classifyDashboardError(error: unknown): DashboardError {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
  if (code === "NO_SERVICE") return { kind: "approval", message: "Allow the Tokenade service in Extensions to load dashboard data." };
  if (code === "DISABLED") return { kind: "disabled", message: "Enable the Tokenade extension in Extensions." };
  if (code === "CLI_NOT_FOUND") return { kind: "cli-missing", message: "Tokenade CLI not found. Install Tokenade or check the service PATH." };
  if (code === "INVALID_JSON" || code === "INVALID_SNAPSHOT") return { kind: "invalid", message: "The CLI returned invalid data. Check its version, then refresh." };
  if (["SERVICE_FAILED", "HOST_UNAVAILABLE", "HOST_TIMEOUT", "CLI_TIMEOUT"].includes(code)) {
    return { kind: "unavailable", message: "Tokenade service is unavailable. Try again shortly." };
  }
  return { kind: "failed", message: "Dashboard load failed." };
}

export class DashboardRequestError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DashboardRequestError";
  }
}

export function createDashboardClient(
  request: () => Promise<DashboardSnapshot>,
  onChange: (state: DashboardState) => void,
) {
  let state = initialDashboardState();
  let inFlight: Promise<void> | null = null;
  const refresh = (): Promise<void> => {
    if (inFlight) return inFlight;
    state = reduceDashboardState(state, { type: "start" });
    onChange(state);
    inFlight = (async () => {
      try {
        const snapshot = await request();
        if (!isDashboardSnapshot(snapshot)) throw new DashboardRequestError("INVALID_SNAPSHOT", "Invalid Tokenade snapshot.");
        state = reduceDashboardState(state, { type: "success", snapshot });
      } catch (error) {
        state = reduceDashboardState(state, { type: "failure", error: classifyDashboardError(error) });
      }
      onChange(state);
    })().finally(() => { inFlight = null; });
    return inFlight;
  };
  return { refresh, getState: () => state };
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function formatTokens(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 })
    .format(value)
    .replace("K", "k");
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value)}%`;
}
