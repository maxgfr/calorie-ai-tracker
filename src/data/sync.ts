/**
 * Sync with GitHub: the whole data set as one JSON file in a repository of
 * yours, read and written with the Contents API straight from the browser.
 *
 * Each device merges the file with what it has before writing it back: meals
 * and messages are joined by id, the latest edit of a meal wins, a deleted
 * meal leaves a tombstone so it is not brought back, and the profile with its
 * goals goes with the latest save.
 */
import type { ChatMessage, Entry, Goals, Profile } from "./model";

export const SYNC_FILE = "calorie-ai-tracker.json";

export interface SyncConfig {
  /** "owner/name". */
  repo: string;
  /** Path of the file in the repository. */
  path: string;
  /** A token that can read and write the repository's contents. */
  token: string;
}

/** A meal as stored in the file: its photo as a data: URL. */
export type SyncedEntry = Omit<Entry, "photo"> & { photo?: string };

export interface Snapshot {
  app: "calorie-ai-tracker";
  version: 1;
  entries: SyncedEntry[];
  /** Deleted meals: id → when. */
  deleted: Record<string, number>;
  /** Null until the profile is first saved. */
  settings: { profile: Profile; goals: Goals; updated: number } | null;
  chat: ChatMessage[];
  /** When the conversation was last cleared: older messages are gone. */
  chatCleared: number;
}

export function emptySnapshot(): Snapshot {
  return {
    app: "calorie-ai-tracker",
    version: 1,
    entries: [],
    deleted: {},
    settings: null,
    chat: [],
    chatCleared: 0,
  };
}

const stamp = (e: SyncedEntry) => e.updated ?? e.time;

/** Both sides joined. Order-independent, and merging a result again changes nothing. */
export function merge(a: Snapshot, b: Snapshot): Snapshot {
  const deleted = { ...a.deleted };
  for (const [id, time] of Object.entries(b.deleted)) {
    deleted[id] = Math.max(deleted[id] ?? 0, time);
  }

  const entries = new Map<string, SyncedEntry>();
  for (const e of [...a.entries, ...b.entries]) {
    const prev = entries.get(e.id);
    if (!prev || stamp(e) > stamp(prev)) entries.set(e.id, e);
  }

  const chatCleared = Math.max(a.chatCleared, b.chatCleared);
  const chat = new Map<string, ChatMessage>();
  for (const m of [...a.chat, ...b.chat]) if (m.time > chatCleared) chat.set(m.id, m);

  const settings =
    !a.settings || (b.settings && b.settings.updated > a.settings.updated)
      ? b.settings
      : a.settings;

  return {
    app: "calorie-ai-tracker",
    version: 1,
    entries: [...entries.values()]
      .filter((e) => (deleted[e.id] ?? -1) < stamp(e))
      .sort((x, y) => x.time - y.time || x.id.localeCompare(y.id)),
    deleted,
    settings,
    chat: [...chat.values()].sort((x, y) => x.time - y.time || x.id.localeCompare(y.id)),
    chatCleared,
  };
}

export class SyncError extends Error {
  override name = "SyncError";
}

/** Base64 without the call-stack limit of spreading a large array. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A file of this app, with every field present: anything else is refused. */
export function parseSnapshot(text: string): Snapshot {
  let data: Partial<Snapshot> | null;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SyncError("The file on GitHub is not valid JSON.");
  }
  if (data?.app !== "calorie-ai-tracker" || !Array.isArray(data.entries)) {
    throw new SyncError("The file on GitHub is not calorie-ai-tracker data.");
  }
  if (data.version !== 1) {
    throw new SyncError("The file on GitHub comes from a newer version of the app: reload it.");
  }
  return { ...emptySnapshot(), ...data };
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const REPO = /^[\w.-]+\/[\w.-]+$/;

export function validRepo(repo: string): boolean {
  return REPO.test(repo.trim());
}

function contentsUrl(config: SyncConfig): string {
  const path = config.path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${config.repo.trim()}/contents/${path}`;
}

function headers(config: SyncConfig, accept = "application/vnd.github+json"): HeadersInit {
  return {
    accept,
    authorization: `Bearer ${config.token.trim()}`,
    "x-github-api-version": "2022-11-28",
  };
}

async function failure(res: Response): Promise<SyncError> {
  if (res.status === 401) return new SyncError("GitHub refused the token.");
  if (res.status === 403) {
    return new SyncError(
      res.headers.get("x-ratelimit-remaining") === "0"
        ? "GitHub's rate limit is reached: try again later."
        : "The token cannot write to this repository (Contents: read and write).",
    );
  }
  if (res.status === 404) {
    return new SyncError("Repository not found, or the token has no access to it.");
  }
  const body = (await res.json().catch(() => null)) as { message?: string } | null;
  return new SyncError(`GitHub answered ${res.status}${body?.message ? `: ${body.message}` : ""}.`);
}

/** The file and its blob sha, or nulls when it does not exist yet. */
export async function pull(
  config: SyncConfig,
  fetchImpl: Fetch = fetch,
): Promise<{ snapshot: Snapshot | null; sha: string | null }> {
  const url = contentsUrl(config);
  const res = await fetchImpl(url, { headers: headers(config), cache: "no-store" });
  if (res.status === 404) {
    // A missing file, or a repository the token cannot see: the latter fails on write.
    return { snapshot: null, sha: null };
  }
  if (!res.ok) throw await failure(res);
  const file = (await res.json()) as { sha: string; content?: string; encoding?: string };
  let text: string;
  if (file.encoding === "base64" && file.content) {
    text = new TextDecoder().decode(fromBase64(file.content));
  } else {
    // Over 1 MB the JSON comes without the content: ask for the raw file.
    const raw = await fetchImpl(url, {
      headers: headers(config, "application/vnd.github.raw+json"),
      cache: "no-store",
    });
    if (!raw.ok) throw await failure(raw);
    text = await raw.text();
  }
  return { snapshot: parseSnapshot(text), sha: file.sha };
}

class Conflict extends Error {}

async function push(
  config: SyncConfig,
  snapshot: Snapshot,
  sha: string | null,
  fetchImpl: Fetch,
): Promise<void> {
  const content = toBase64(new TextEncoder().encode(`${JSON.stringify(snapshot, null, 1)}\n`));
  const res = await fetchImpl(contentsUrl(config), {
    method: "PUT",
    headers: { ...headers(config), "content-type": "application/json" },
    body: JSON.stringify({
      message: "Sync calorie-ai-tracker data",
      content,
      ...(sha ? { sha } : {}),
    }),
  });
  // Another device wrote in between: its sha no longer matches.
  if (res.status === 409 || (res.status === 422 && sha === null)) throw new Conflict();
  if (!res.ok) throw await failure(res);
}

const same = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Merges what this device has with the file on GitHub and writes the result
 * back when it differs. Resolves with the merged data, for this device to keep.
 */
export async function syncRepo(
  config: SyncConfig,
  local: Snapshot,
  fetchImpl: Fetch = fetch,
): Promise<Snapshot> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await pull(config, fetchImpl);
    const merged = remote.snapshot ? merge(local, remote.snapshot) : merge(local, emptySnapshot());
    if (remote.snapshot && same(merged, remote.snapshot)) return merged;
    try {
      await push(config, merged, remote.sha, fetchImpl);
      return merged;
    } catch (err) {
      if (!(err instanceof Conflict)) throw err;
    }
  }
  throw new SyncError("The file kept changing on GitHub while syncing: try again.");
}
