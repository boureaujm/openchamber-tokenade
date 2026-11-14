import { describe, expect, it } from "bun:test";
import {
  DEFAULT_REFRESH_SECONDS,
  loadPreferences,
  normalizeAccent,
  parseRefreshSeconds,
  savePreferences,
  type PreferenceStore,
} from "./settings";

function memoryStore(initial?: unknown) {
  let value = initial;
  const store: PreferenceStore = {
    async get() { return value; },
    async set(_key, next) { value = next; },
    async delete() { value = undefined; },
  };
  return { store, read: () => value };
}

describe("panel preferences", () => {
  it("uses defaults when preferences are absent or corrupt", async () => {
    expect(await loadPreferences(memoryStore().store)).toEqual({ refreshSeconds: DEFAULT_REFRESH_SECONDS });
    expect(await loadPreferences(memoryStore("{broken").store)).toEqual({ refreshSeconds: DEFAULT_REFRESH_SECONDS });
    expect(await loadPreferences(memoryStore("null").store)).toEqual({ refreshSeconds: DEFAULT_REFRESH_SECONDS });
  });

  it("accepts only whole refresh intervals from 3 to 60 seconds", () => {
    expect(parseRefreshSeconds("3")).toBe(3);
    expect(parseRefreshSeconds(60)).toBe(60);
    for (const value of [2, 61, 3.5, "3.5", "", "  ", Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(parseRefreshSeconds(value)).toBeNull();
    }
  });

  it("normalizes opaque six-digit accent colors only", () => {
    expect(normalizeAccent("#C25E0C")).toBe("#c25e0c");
    for (const value of ["red", "#fff", "#12345678", "#gg0000", null]) {
      expect(normalizeAccent(value)).toBeUndefined();
    }
  });

  it("loads valid fields and drops invalid or unknown values", async () => {
    expect(await loadPreferences(memoryStore(JSON.stringify({ refreshSeconds: 12, accent: "#C25E0C", extra: true })).store))
      .toEqual({ refreshSeconds: 12, accent: "#c25e0c" });
    expect(await loadPreferences(memoryStore(JSON.stringify({ refreshSeconds: 90, accent: "red" })).store))
      .toEqual({ refreshSeconds: DEFAULT_REFRESH_SECONDS });
  });

  it("removes only the accent override when saving the theme default", async () => {
    const { store, read } = memoryStore();
    await savePreferences(store, { refreshSeconds: 15, accent: "#123456" });
    await savePreferences(store, { refreshSeconds: 15 });
    expect(JSON.parse(read() as string)).toEqual({ refreshSeconds: 15 });
    expect(await loadPreferences(store)).toEqual({ refreshSeconds: 15 });
  });

  it("uses defaults on read failure and propagates write failure", async () => {
    const failing: PreferenceStore = {
      async get() { throw new Error("read failed"); },
      async set() { throw new Error("write failed"); },
      async delete() {},
    };
    expect(await loadPreferences(failing)).toEqual({ refreshSeconds: DEFAULT_REFRESH_SECONDS });
    await expect(savePreferences(failing, { refreshSeconds: 5 })).rejects.toThrow("write failed");
  });
});
