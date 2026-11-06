import { afterEach, describe, expect, it } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { AddressInfo } from "node:net";
import type { ChildProcess } from "node:child_process";
import {
  createDashboardServer,
  runTokenadeDashboard,
  ServiceError,
  type DashboardSnapshot,
} from "./server";

const token = "test-service-token";
const snapshot: DashboardSnapshot = {
  operations: 1,
  tokens_before: 10,
  tokens_after: 2,
  tokens_saved: 8,
  savings_pct: 80,
  cache_hits: 2,
  cache_misses: 1,
  hit_rate: 66.7,
  by_layer: [{ layer: "shell", before: 10, after: 2, saved: 8, n: 1, pct: 80 }],
  per_op: [{ op: "compact", before: 10, after: 2, n: 1, pct: 80 }],
};

const servers: ReturnType<typeof createDashboardServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function startServer(loadSnapshot: () => Promise<DashboardSnapshot> = async () => snapshot) {
  const server = createDashboardServer({ token, loadSnapshot });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

function fakeSpawn(
  effect: (child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: () => boolean }) => void,
) {
  return (() => {
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
    });
    effect(child);
    return child as unknown as ChildProcess;
  }) as unknown as typeof import("node:child_process").spawn;
}

describe("Tokenade local service", () => {
  it("requires bearer authorization on health and dashboard", async () => {
    const base = await startServer();
    expect((await fetch(`${base}/health`)).status).toBe(401);
    expect((await fetch(`${base}/dashboard`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    expect((await fetch(`${base}/health`, { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
  });

  it("returns a validated snapshot", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/dashboard`, { headers: { authorization: `Bearer ${token}` } });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: snapshot });
  });

  it("uses the fixed command and rejects a missing CLI", async () => {
    let invocation: { command: string; args: string[]; options: { shell?: boolean } } | undefined;
    const spawnProcess = ((command, args, options) => {
      invocation = { command, args, options };
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => true,
      });
      queueMicrotask(() => child.emit("error", Object.assign(new Error("missing"), { code: "ENOENT" })));
      return child as unknown as ChildProcess;
    }) as unknown as typeof import("node:child_process").spawn;
    await expect(runTokenadeDashboard({ spawnProcess })).rejects.toMatchObject({ code: "CLI_NOT_FOUND" });
    expect(invocation).toMatchObject({ command: "tokenade", args: ["dashboard", "--json"], options: { shell: false } });
  });

  it("rejects malformed JSON", async () => {
    const spawnProcess = fakeSpawn((child) => {
      queueMicrotask(() => {
        child.stdout.end("not-json");
        child.emit("close", 0, null);
      });
    });
    await expect(runTokenadeDashboard({ spawnProcess })).rejects.toMatchObject({ code: "INVALID_JSON" });
  });

  it("normalizes the installed CLI cache_hit_rate alias", async () => {
    const { hit_rate, ...fields } = snapshot;
    const spawnProcess = fakeSpawn((child) => {
      queueMicrotask(() => {
        child.stdout.end(JSON.stringify({ ...fields, cache_hit_rate: hit_rate, ledger_path: "/private/tokenade/gain.jsonl" }));
        child.emit("close", 0, null);
      });
    });
    const result = await runTokenadeDashboard({ spawnProcess });
    expect(result.hit_rate).toBe(hit_rate);
    expect(result).not.toHaveProperty("ledger_path");
    expect(result).not.toHaveProperty("cache_hit_rate");
  });

  it("bounds command runtime", async () => {
    const spawnProcess = fakeSpawn(() => {});
    await expect(runTokenadeDashboard({ spawnProcess, timeoutMs: 5 })).rejects.toMatchObject({ code: "CLI_TIMEOUT" });
  });

  it("bounds captured output", async () => {
    const spawnProcess = fakeSpawn((child) => {
      queueMicrotask(() => child.stdout.write("x".repeat(64)));
    });
    await expect(runTokenadeDashboard({ spawnProcess, maxOutputBytes: 8 })).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
  });

  it("rejects a snapshot missing documented summary fields", async () => {
    const spawnProcess = fakeSpawn((child) => {
      queueMicrotask(() => {
        child.stdout.end(JSON.stringify({ operations: 1 }));
        child.emit("close", 0, null);
      });
    });
    await expect(runTokenadeDashboard({ spawnProcess })).rejects.toBeInstanceOf(ServiceError);
  });
});
