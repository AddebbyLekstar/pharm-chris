/**
 * Local-only retention instrumentation.
 *
 * Nothing leaves the device. The point is to answer "is this fun, and where do
 * players quit" without a backend: every meaningful beat is stamped once, and the
 * funnel is computed from that log.
 */

export const TELEMETRY_KEY = 'pharm_chris_telemetry_v1';
export const SESSION_KEY = 'pharm_chris_sessions_v1';
const MAX_EVENTS = 800;

export type FunnelStep =
  | 'session_start'
  | 'onboarding_pickup'
  | 'onboarding_stock'
  | 'onboarding_serve'
  | 'onboarding_cash'
  | 'onboarding_upgrade'
  | 'onboarding_license'
  | 'day_complete'
  | 'employee_hired'
  | 'run_ended'
  | 'session_end';

export interface TelemetryEvent {
  name: string;
  ts: number;
  day: number;
  session: number;
  value?: number;
  meta?: Record<string, string | number | boolean>;
}

export interface FunnelRow {
  step: string;
  count: number;
  rate: number;
}

export interface FunnelReport {
  events: number;
  sessions: number;
  returns24h: number;
  returns7d: number;
  funnel: FunnelRow[];
  dropOff: string;
  medianDayReached: number;
  exportedAt: string;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function storage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* blocked */
  }
  return null;
}

const FUNNEL_ORDER: string[] = [
  'session_start',
  'onboarding_pickup',
  'onboarding_stock',
  'onboarding_serve',
  'onboarding_cash',
  'onboarding_upgrade',
  'onboarding_license',
  'day_complete',
  'employee_hired',
  'run_ended',
];

export class Telemetry {
  private events: TelemetryEvent[] = [];
  private session: number = 0;
  private store: StorageLike | null;
  private startedAt = 0;
  public enabled: boolean;

  constructor(store = storage(), enabled = true) {
    this.store = store;
    this.enabled = enabled;
    this.load();
    this.startSession();
  }

  private load(): void {
    if (!this.store) return;
    try {
      const raw = this.store.getItem(TELEMETRY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { events?: TelemetryEvent[]; session?: number };
        if (Array.isArray(parsed.events)) {
          this.events = parsed.events.slice(-MAX_EVENTS).filter(isEvent);
        }
        this.session = typeof parsed.session === 'number' ? parsed.session : 0;
      }
    } catch {
      this.events = [];
    }
  }

  private persist(): void {
    if (!this.store || !this.enabled) return;
    try {
      this.store.setItem(TELEMETRY_KEY, JSON.stringify({ events: this.events.slice(-MAX_EVENTS), session: this.session }));
    } catch {
      /* storage full: telemetry is never worth crashing a game session */
    }
  }

  private readSessions(): number[] {
    if (!this.store) return [];
    try {
      const raw = this.store.getItem(SESSION_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
    } catch {
      return [];
    }
  }

  private startSession(): void {
    this.session += 1;
    this.startedAt = Date.now();
    const sessions = this.readSessions();
    sessions.push(this.startedAt);
    if (this.store) {
      try {
        this.store.setItem(SESSION_KEY, JSON.stringify(sessions.slice(-200)));
      } catch {
        /* ignore */
      }
    }
    this.track('session_start', 0);
  }

  public track(name: string, day: number, value?: number, meta?: TelemetryEvent['meta']): void {
    if (!this.enabled) return;
    this.events.push({ name, ts: Date.now(), day, session: this.session, value, meta });
    if (this.events.length > MAX_EVENTS) this.events = this.events.slice(-MAX_EVENTS);
    // Persist on the beats that matter, not on every tick.
    if (name !== 'session_start') this.persist();
  }

  /** Stamp a funnel step at most once per run. */
  public trackOnce(name: string, day: number, meta?: TelemetryEvent['meta']): boolean {
    if (this.events.some((e) => e.name === name)) return false;
    this.track(name, day, undefined, meta);
    return true;
  }

  public has(name: string): boolean {
    return this.events.some((e) => e.name === name);
  }

  public endSession(): void {
    this.track('session_end', this.lastDay(), Math.round((Date.now() - this.startedAt) / 1000));
  }

  private lastDay(): number {
    for (let i = this.events.length - 1; i >= 0; i--) return this.events[i].day;
    return 0;
  }

  public funnel(): FunnelReport {
    const sessions = this.readSessions();
    const now = Date.now();
    const firstEver = sessions.length ? Math.min(...sessions) : now;
    const returns24h = sessions.filter((ts) => ts - firstEver >= 0 && ts - firstEver <= 24 * 3600 * 1000).length;
    const returns7d = sessions.filter((ts) => ts - firstEver > 24 * 3600 * 1000 && ts - firstEver <= 7 * 24 * 3600 * 1000).length;

    const counts = new Map<string, number>();
    for (const e of this.events) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    const startCount = counts.get('session_start') ?? 0;

    const funnel: FunnelRow[] = FUNNEL_ORDER.map((step) => {
      const count = Math.min(counts.get(step) ?? 0, Math.max(startCount, 1));
      return { step, count, rate: startCount ? Math.round((count / startCount) * 100) : 0 };
    });

    let dropOff = 'none';
    for (let i = 1; i < funnel.length; i++) {
      if (funnel[i].count < funnel[i - 1].count) {
        dropOff = funnel[i].step;
        break;
      }
    }

    const days = this.events.map((e) => e.day).filter((d) => d > 0).sort((a, b) => a - b);
    const medianDayReached = days.length ? days[Math.floor(days.length / 2)] : 0;

    return {
      events: this.events.length,
      sessions: sessions.length,
      returns24h,
      returns7d,
      funnel,
      dropOff,
      medianDayReached,
      exportedAt: new Date().toISOString(),
    };
  }

  public allEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  public exportJSON(): string {
    return JSON.stringify({ funnel: this.funnel(), events: this.events }, null, 2);
  }

  public debugLines(): string[] {
    const f = this.funnel();
    const lines = [
      `sessions ${f.sessions}  24h returns ${f.returns24h}  7d returns ${f.returns7d}  events ${f.events}`,
      `drop-off after: ${f.dropOff}`,
    ];
    for (const row of f.funnel) lines.push(`${row.step.padEnd(20)} ${String(row.count).padStart(4)}  ${String(row.rate).padStart(3)}%`);
    return lines;
  }

  public clear(): void {
    this.events = [];
    if (this.store) {
      try {
        this.store.setItem(TELEMETRY_KEY, JSON.stringify({ events: [], session: this.session }));
      } catch {
        /* ignore */
      }
    }
  }
}

function isEvent(value: unknown): value is TelemetryEvent {
  return Boolean(value) && typeof value === 'object' && typeof (value as TelemetryEvent).name === 'string';
}

/** Browser-only helper so the funnel is one click away during playtests. */
export function downloadFunnel(telemetry: Telemetry, filename = 'pharm-chris-funnel.json'): void {
  const json = telemetry.exportJSON();
  if (typeof document === 'undefined') return;
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
