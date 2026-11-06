import { describe, expect, it } from "bun:test";
import { applyHostReady } from "@openchamber/sdk/ui";
import {
  createDashboardClient,
  createDashboardPoller,
  DashboardRequestError,
  formatUpdateNotice,
  formatCount,
  formatPercent,
  initialDashboardState,
  REFRESH_INTERVAL_MS,
  reduceDashboardState,
  snapshotNotices,
  type DashboardSnapshot,
} from "./dashboard";

const snapshot: DashboardSnapshot = {
  operations: 0,
  tokens_before: 0,
  tokens_after: 0,
  tokens_saved: 0,
  savings_pct: 0,
  cache_hits: 0,
  cache_misses: 0,
  hit_rate: 0,
};

describe("dashboard panel state", () => {
  it("formats counts and percentages", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(formatPercent(66.67)).toBe("66.7%");
  });

  it("keeps a valid snapshot and marks it stale after refresh failure", () => {
    const loaded = reduceDashboardState(initialDashboardState(), { type: "success", snapshot, at: new Date(0) });
    expect(formatUpdateNotice(loaded, "10:30")).toBe("Dernière actualisation : 10:30.");
    const failed = reduceDashboardState(loaded, {
      type: "failure",
      error: { kind: "unavailable", message: "offline" },
    });
    expect(failed.snapshot).toBe(snapshot);
    expect(failed.stale).toBe(true);
    expect(failed.error?.kind).toBe("unavailable");
    expect(formatUpdateNotice(failed, "10:30")).toBe("Dernier snapshot valide : 10:30. Les données peuvent être périmées.");
  });

  it("classifies approval denial without claiming data loaded", async () => {
    const client = createDashboardClient(async () => { throw new DashboardRequestError("NO_SERVICE", "not approved"); }, () => {});
    await client.refresh();
    expect(client.getState()).toMatchObject({ snapshot: null, loading: false, error: { kind: "approval" } });
  });

  it("retains the last snapshot when the next request fails", async () => {
    let calls = 0;
    const client = createDashboardClient(async () => {
      calls += 1;
      if (calls === 1) return snapshot;
      throw new DashboardRequestError("CLI_NOT_FOUND", "missing");
    }, () => {});
    await client.refresh();
    await client.refresh();
    expect(client.getState()).toMatchObject({ snapshot, stale: true, error: { kind: "cli-missing" } });
  });

  it("does not overlap concurrent refresh requests", async () => {
    let resolveRequest!: (value: DashboardSnapshot) => void;
    let calls = 0;
    const client = createDashboardClient(() => {
      calls += 1;
      return new Promise((resolve) => { resolveRequest = resolve; });
    }, () => {});
    const first = client.refresh();
    const second = client.refresh();
    expect(calls).toBe(1);
    resolveRequest(snapshot);
    await Promise.all([first, second]);
    expect(client.getState().snapshot).toBe(snapshot);
  });

  it("renders zero activity and omitted breakdowns as valid data", () => {
    expect(snapshot.operations).toBe(0);
    expect(snapshot.by_layer).toBeUndefined();
    expect(snapshot.per_op).toBeUndefined();
    expect(snapshotNotices(snapshot)).toEqual([
      "Aucune opération enregistrée pour l’instant.",
      "Aucun détail par couche ou opération dans ce snapshot.",
    ]);
  });

  it("uses the specified polling interval and classifies a disabled service", async () => {
    expect(REFRESH_INTERVAL_MS).toBe(30_000);
    const client = createDashboardClient(async () => { throw new DashboardRequestError("DISABLED", "disabled"); }, () => {});
    await client.refresh();
    expect(client.getState().error?.kind).toBe("disabled");
  });

  it("applies updated host theme tokens", () => {
    const values: Record<string, string> = {};
    const root = { style: { colorScheme: "", setProperty: (key: string, value: string) => { values[key] = value; } }, dataset: {} };
    const context = (mode: string, background: string) => ({
      surface: "panel",
      theme: {
        mode,
        tokens: new Proxy({ background, foreground: `${mode}-foreground` }, {
          get: (target, key: string | symbol) => target[String(key) as keyof typeof target] ?? `${mode}-${String(key)}`,
        }),
      },
    }) as Parameters<typeof applyHostReady>[0];
    applyHostReady(context("light", "#fff"), root);
    applyHostReady(context("dark", "#111"), root);
    expect(values["--surface-background"]).toBe("#111");
    expect(root.dataset.ocTheme).toBe("dark");
  });

  it("polls every 30 seconds only while the panel is active", async () => {
    let active = true;
    let ticks = 0;
    let clears = 0;
    let tick: (() => void) | undefined;
    const schedule = ((callback: TimerHandler, delay?: number) => {
      expect(delay).toBe(30_000);
      tick = callback as () => void;
      return 1;
    }) as typeof setInterval;
    const cancel = (() => { clears += 1; }) as typeof clearInterval;
    const poller = createDashboardPoller(async () => { ticks += 1; }, () => active, schedule, cancel);
    poller.sync();
    tick?.();
    await Promise.resolve();
    expect(ticks).toBe(1);
    active = false;
    poller.sync();
    tick?.();
    await Promise.resolve();
    expect(clears).toBe(1);
    expect(ticks).toBe(1);
    poller.dispose();
  });
});
