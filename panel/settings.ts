export const MIN_REFRESH_SECONDS = 3;
export const MAX_REFRESH_SECONDS = 60;
export const DEFAULT_REFRESH_SECONDS = 5;

const STORAGE_KEY = "tokenade:preferences:v1";

export type Preferences = { refreshSeconds: number; accent?: string };
export type PreferenceStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

export function parseRefreshSeconds(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds >= MIN_REFRESH_SECONDS && seconds <= MAX_REFRESH_SECONDS
    ? seconds
    : null;
}

export function normalizeAccent(value: unknown): string | undefined {
  return typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}

export async function loadPreferences(store: PreferenceStore): Promise<Preferences> {
  try {
    const raw = await store.get(STORAGE_KEY);
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return defaults();
    const saved = value as Record<string, unknown>;
    const refreshSeconds = parseRefreshSeconds(saved.refreshSeconds) ?? DEFAULT_REFRESH_SECONDS;
    const accent = normalizeAccent(saved.accent);
    return accent ? { refreshSeconds, accent } : { refreshSeconds };
  } catch {
    return defaults();
  }
}

export async function savePreferences(store: PreferenceStore, preferences: Preferences): Promise<void> {
  const refreshSeconds = parseRefreshSeconds(preferences.refreshSeconds);
  if (refreshSeconds === null) throw new RangeError("Invalid refresh interval");
  const accent = preferences.accent === undefined ? undefined : normalizeAccent(preferences.accent);
  if (preferences.accent !== undefined && accent === undefined) throw new TypeError("Invalid accent color");
  const value = accent ? { refreshSeconds, accent } : { refreshSeconds };
  await store.set(STORAGE_KEY, JSON.stringify(value));
}

function defaults(): Preferences {
  return { refreshSeconds: DEFAULT_REFRESH_SECONDS };
}
