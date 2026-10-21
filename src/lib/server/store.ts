/**
 * Persistence behind one small interface.
 *
 * - "redis": Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Shared across instances.
 * - "file": a JSON file under data/runtime/ (local dev / single server). Shared by everyone using
 *   that server and survives restarts, but not shared across serverless instances.
 * - "memory": last resort (read-only filesystems without Redis). Lost on restart; per instance.
 *
 * Locks serialise writes that must not race (inventory, votes). Redis locks use SET NX with expiry.
 */
import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";

export type StoreMode = "redis" | "file" | "memory";

interface Backend {
  mode: StoreMode;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  srem(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  mget<T>(keys: string[]): Promise<(T | null)[]>;
  lock<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

const localLocks = new Map<string, Promise<unknown>>();
function localLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const prev = localLocks.get(name) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  localLocks.set(name, next.catch(() => undefined));
  return next;
}

class MapBackend implements Backend {
  constructor(
    public mode: StoreMode,
    private data: Map<string, unknown>,
    private persist: () => void = () => {},
  ) {}
  async get<T>(key: string) {
    return (this.data.has(key) ? structuredClone(this.data.get(key)) : null) as T | null;
  }
  async set(key: string, value: unknown) {
    this.data.set(key, structuredClone(value));
    this.persist();
  }
  async del(key: string) {
    this.data.delete(key);
    this.persist();
  }
  async sadd(key: string, member: string) {
    const s = new Set((this.data.get(key) as string[] | undefined) ?? []);
    s.add(member);
    this.data.set(key, [...s]);
    this.persist();
  }
  async srem(key: string, member: string) {
    const s = new Set((this.data.get(key) as string[] | undefined) ?? []);
    s.delete(member);
    this.data.set(key, [...s]);
    this.persist();
  }
  async smembers(key: string) {
    return [...((this.data.get(key) as string[] | undefined) ?? [])];
  }
  async mget<T>(keys: string[]) {
    return Promise.all(keys.map((k) => this.get<T>(k)));
  }
  lock<T>(name: string, fn: () => Promise<T>) {
    return localLock(name, fn);
  }
}

function fileBackend(): Backend | null {
  if (process.env.VERCEL) return null;
  const dir = path.join(process.cwd(), "data", "runtime");
  const file = path.join(dir, "store.json");
  try {
    mkdirSync(dir, { recursive: true });
    const data = new Map<string, unknown>(existsSync(file) ? Object.entries(JSON.parse(readFileSync(file, "utf8"))) : []);
    let timer: NodeJS.Timeout | null = null;
    const flush = () => {
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(Object.fromEntries(data)));
      renameSync(tmp, file);
    };
    // Coalesce bursts of writes; flush synchronously on exit so nothing is lost on Ctrl+C.
    const persist = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, 50);
    };
    process.once("beforeExit", flush);
    return new MapBackend("file", data, persist);
  } catch {
    return null;
  }
}

function redisBackend(): Backend | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const r = new Redis({ url, token });
  const P = "offbeat:";
  return {
    mode: "redis",
    get: (k) => r.get(P + k),
    set: async (k, v) => void (await r.set(P + k, v)),
    del: async (k) => void (await r.del(P + k)),
    sadd: async (k, m) => void (await r.sadd(P + k, m)),
    srem: async (k, m) => void (await r.srem(P + k, m)),
    smembers: (k) => r.smembers(P + k),
    mget: async <T,>(keys: string[]) => (keys.length ? ((await r.mget(...keys.map((k) => P + k))) as (T | null)[]) : []),
    async lock<T>(name: string, fn: () => Promise<T>) {
      const key = `${P}lock:${name}`;
      const token = crypto.randomUUID();
      for (let i = 0; i < 50; i++) {
        if (await r.set(key, token, { nx: true, px: 5000 })) {
          try {
            return await fn();
          } finally {
            if ((await r.get(key)) === token) await r.del(key);
          }
        }
        await new Promise((res) => setTimeout(res, 100));
      }
      throw new Error("Busy, please try again");
    },
  };
}

const g = globalThis as unknown as { __offbeatStore?: Backend };
export function store(): Backend {
  if (!g.__offbeatStore) g.__offbeatStore = redisBackend() ?? fileBackend() ?? new MapBackend("memory", new Map());
  return g.__offbeatStore;
}

/** Whether data written here is visible to other people using the app. */
export const isShared = () => store().mode !== "memory";

/* ── Document collections on top of the backend ── */

export async function putDoc<T extends { id: string }>(collection: string, doc: T) {
  await store().set(`${collection}:${doc.id}`, doc);
  await store().sadd(`idx:${collection}`, doc.id);
}
export const getDoc = <T,>(collection: string, id: string) => store().get<T>(`${collection}:${id}`);
export async function delDoc(collection: string, id: string) {
  await store().del(`${collection}:${id}`);
  await store().srem(`idx:${collection}`, id);
}
export async function listDocs<T>(collection: string): Promise<T[]> {
  const ids = await store().smembers(`idx:${collection}`);
  const docs = await store().mget<T>(ids.map((id) => `${collection}:${id}`));
  return docs.filter((d): d is Awaited<T> => d !== null) as T[];
}
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
