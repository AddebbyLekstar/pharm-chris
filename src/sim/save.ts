import { RUN_CONFIG, StoreRun } from './progression';

/**
 * Persistence for the idle run.
 *
 * Rules that matter:
 *  - A save that fails to parse never wipes a good one silently: the bad payload is
 *    parked under a `.corrupt` key for inspection and the caller gets a fresh run.
 *  - Older payloads (v1 narrative GameState, or v2 with missing fields) are migrated,
 *    not discarded.
 *  - Offline time is capped, and the cap is visible to the UI.
 */

export const SAVE_KEY = 'pharm_chris_run_v2';
export const LEGACY_KEYS = ['pharm_chris_run', 'pharm_chris_save', 'pharm_chris_state'];

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadStatus = 'ok' | 'empty' | 'corrupt' | 'migrated';

export interface LoadResult {
  run: StoreRun | null;
  status: LoadStatus;
  savedAt: number | null;
  raw?: string;
}

function safeStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
}

export function loadRun(storage?: StorageLike | null, now = Date.now()): LoadResult {
  const store = safeStorage(storage);
  if (!store) return { run: null, status: 'empty', savedAt: null };

  const candidates = [SAVE_KEY, ...LEGACY_KEYS];
  for (const key of candidates) {
    let raw: string | null = null;
    try {
      raw = store.getItem(key);
    } catch {
      return { run: null, status: 'empty', savedAt: null };
    }
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      quarantine(store, key, raw);
      return { run: null, status: 'corrupt', savedAt: null, raw };
    }

    const payload = unwrap(parsed);
    if (!payload) {
      quarantine(store, key, raw);
      return { run: null, status: 'corrupt', savedAt: null, raw };
    }

    const run = StoreRun.fromJSON(payload);
    if (!run) {
      quarantine(store, key, raw);
      return { run: null, status: 'corrupt', savedAt: null, raw };
    }

    const version = Number((payload as Record<string, unknown>).saveVersion ?? 1);
    run.touch(now);
    return {
      run,
      status: version >= 2 ? 'ok' : 'migrated',
      savedAt: typeof (parsed as { savedAt?: number })?.savedAt === 'number'
        ? (parsed as { savedAt: number }).savedAt
        : null,
    };
  }
  return { run: null, status: 'empty', savedAt: null };
}

function unwrap(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  // Envelope shape {savedAt, data} or a bare snapshot.
  if (obj.data && typeof obj.data === 'object') return obj.data as Record<string, unknown>;
  return obj;
}

function quarantine(store: StorageLike, key: string, raw: string): void {
  try {
    store.setItem(`${key}.corrupt`, raw.slice(0, 20000));
    store.removeItem(key);
  } catch {
    /* storage full: the corrupt blob is not worth crashing over */
  }
}

export function saveRun(run: StoreRun, storage?: StorageLike | null, now = Date.now()): boolean {
  const store = safeStorage(storage);
  if (!store) return false;
  try {
    const snapshot = run.toJSON();
    snapshot.lastSeenAt = now;
    store.setItem(SAVE_KEY, JSON.stringify({ savedAt: now, data: snapshot }));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(storage?: StorageLike | null): void {
  const store = safeStorage(storage);
  if (!store) return;
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    try {
      store.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export interface OfflineResult {
  seconds: number;
  hours: number;
  days: number;
  earned: number;
  served: number;
  capped: boolean;
  ratePerHour: number;
}

/**
 * Works out how long the player was away and pays out what the staffed store
 * would have earned, capped at RUN_CONFIG.offlineCapSeconds.
 */
export function settleOffline(run: StoreRun, lastSeenAt: number, now = Date.now()): OfflineResult {
  const elapsed = Math.max(0, Math.floor((now - lastSeenAt) / 1000));
  if (elapsed < 60) {
    return { seconds: elapsed, hours: elapsed / 3600, days: 0, earned: 0, served: 0, capped: false, ratePerHour: 0 };
  }
  const result = run.simulateOffline(elapsed);
  return {
    seconds: result.seconds,
    hours: result.seconds / 3600,
    days: result.days,
    earned: result.earned,
    served: result.served,
    capped: result.capped || elapsed > RUN_CONFIG.offlineCapSeconds,
    ratePerHour: result.seconds > 0 ? Math.round((result.earned / result.seconds) * 3600) : 0,
  };
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}
