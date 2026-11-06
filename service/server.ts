import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { SpawnOptions } from "node:child_process";
import type { ChildProcess } from "node:child_process";

export const COMMAND_TIMEOUT_MS = 10_000;
export const MAX_COMMAND_OUTPUT_BYTES = 512 * 1024;
const MAX_BREAKDOWN_ITEMS = 2_000;

type SummaryField =
  | "operations"
  | "tokens_before"
  | "tokens_after"
  | "tokens_saved"
  | "savings_pct"
  | "cache_hits"
  | "cache_misses"
  | "hit_rate";

const SUMMARY_FIELDS: SummaryField[] = [
  "operations",
  "tokens_before",
  "tokens_after",
  "tokens_saved",
  "savings_pct",
  "cache_hits",
  "cache_misses",
  "hit_rate",
];

export type DashboardSnapshot = Record<string, unknown> & Record<SummaryField, number>;

export class ServiceError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validateBreakdown(
  value: unknown,
  label: "layer" | "op",
  numericFields: string[],
): boolean {
  if (value === undefined || value === null) return true;
  if (!Array.isArray(value) || value.length > MAX_BREAKDOWN_ITEMS) return false;
  return value.every((entry) => {
    if (!isRecord(entry) || typeof entry[label] !== "string") return false;
    return numericFields.every((field) => isFiniteNumber(entry[field]));
  });
}

export function validateDashboardSnapshot(value: unknown): value is DashboardSnapshot {
  if (!isRecord(value) || !SUMMARY_FIELDS.every((field) => isFiniteNumber(value[field]))) {
    return false;
  }
  return (
    validateBreakdown(value.by_layer, "layer", ["before", "after", "saved", "n", "pct"]) &&
    validateBreakdown(value.per_op, "op", ["before", "after", "n", "pct"])
  );
}

function normalizeDashboardSnapshot(value: unknown): DashboardSnapshot | null {
  if (!isRecord(value)) return null;
  const normalized: Record<string, unknown> = {};
  for (const field of SUMMARY_FIELDS) {
    // Current CLI releases use cache_hit_rate; the public dashboard field is hit_rate.
    normalized[field] = field === "hit_rate" ? value.hit_rate ?? value.cache_hit_rate : value[field];
  }
  if ("by_layer" in value) normalized.by_layer = value.by_layer;
  if ("per_op" in value) normalized.per_op = value.per_op;
  return validateDashboardSnapshot(normalized) ? normalized as DashboardSnapshot : null;
}

type SpawnProcess = (
  command: string,
  args: string[],
  options: SpawnOptions,
) => ChildProcess;

export async function runTokenadeDashboard(options: {
  spawnProcess?: SpawnProcess;
  timeoutMs?: number;
  maxOutputBytes?: number;
} = {}): Promise<DashboardSnapshot> {
  const spawnProcess = options.spawnProcess ?? spawn;
  const timeoutMs = options.timeoutMs ?? COMMAND_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? MAX_COMMAND_OUTPUT_BYTES;

  return new Promise((resolve, reject) => {
    let settled = false;
    let outputBytes = 0;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let child: ChildProcess;

    const finish = (error?: ServiceError, snapshot?: DashboardSnapshot) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(snapshot!);
    };

    const failAndKill = (error: ServiceError) => {
      child.kill("SIGKILL");
      finish(error);
    };

    try {
      child = spawnProcess("tokenade", ["dashboard", "--json"], {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      reject(new ServiceError("CLI_FAILED", 502, "Tokenade dashboard could not be started."));
      return;
    }

    const timer = setTimeout(() => {
      failAndKill(new ServiceError("CLI_TIMEOUT", 504, "Tokenade dashboard timed out."));
    }, timeoutMs);

    const collect = (destination: Buffer[]) => (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      outputBytes += buffer.byteLength;
      if (outputBytes > maxOutputBytes) {
        failAndKill(new ServiceError("OUTPUT_TOO_LARGE", 502, "Tokenade dashboard output exceeded the size limit."));
        return;
      }
      destination.push(buffer);
    };

    child.stdout?.on("data", collect(stdout));
    child.stderr?.on("data", collect(stderr));
    child.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        finish(new ServiceError("CLI_NOT_FOUND", 503, "Tokenade CLI was not found on the service PATH."));
      } else {
        finish(new ServiceError("CLI_FAILED", 502, "Tokenade dashboard could not be started."));
      }
    });
    child.once("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new ServiceError("CLI_FAILED", 502, "Tokenade dashboard exited with an error."));
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(stdout).toString("utf8"));
      } catch {
        finish(new ServiceError("INVALID_JSON", 502, "Tokenade dashboard returned malformed JSON."));
        return;
      }
      const snapshot = normalizeDashboardSnapshot(parsed);
      if (!snapshot) {
        finish(new ServiceError("INVALID_SNAPSHOT", 502, "Tokenade dashboard returned an unsupported snapshot."));
        return;
      }
      finish(undefined, snapshot);
    });
  });
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(data),
    "cache-control": "no-store",
  });
  response.end(data);
}

function authorized(request: IncomingMessage, token: string): boolean {
  const value = request.headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(value.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createDashboardServer(options: {
  token: string;
  loadSnapshot?: () => Promise<DashboardSnapshot>;
}): Server {
  const loadSnapshot = options.loadSnapshot ?? (() => runTokenadeDashboard());
  return createServer((request, response) => {
    void handleRequest(request, response, options.token, loadSnapshot);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  loadSnapshot: () => Promise<DashboardSnapshot>,
): Promise<void> {
  if (!token || !authorized(request, token)) {
    sendJson(response, 401, { ok: false, error: { code: "UNAUTHORIZED", message: "Authorization required." } });
    return;
  }
  if (request.method !== "GET") {
    sendJson(response, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } });
    return;
  }
  if (request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (request.url !== "/dashboard") {
    sendJson(response, 404, { ok: false, error: { code: "NOT_FOUND", message: "Route not found." } });
    return;
  }
  try {
    sendJson(response, 200, { ok: true, data: await loadSnapshot() });
  } catch (error) {
    if (error instanceof ServiceError) {
      sendJson(response, error.status, { ok: false, error: { code: error.code, message: error.message } });
    } else {
      sendJson(response, 500, { ok: false, error: { code: "SERVICE_ERROR", message: "Dashboard request failed." } });
    }
  }
}
