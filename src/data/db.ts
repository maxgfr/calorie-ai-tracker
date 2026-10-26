/** Everything the app keeps, in this browser's IndexedDB. */
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import {
  type ChatMessage,
  DEFAULT_GOALS,
  DEFAULT_PROFILE,
  type Entry,
  type Goals,
  type Profile,
} from "./model";
import {
  fromBase64,
  merge,
  type Snapshot,
  type SyncConfig,
  type SyncedEntry,
  toBase64,
} from "./sync";

interface Settings {
  profile: Profile;
  goals: Goals;
  /** Epoch ms of the save, so the latest one wins when syncing. */
  updated?: number;
}

/** The sync settings, the token encrypted. */
interface StoredSync {
  repo: string;
  path: string;
  token: { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };
  lastSync?: number;
}

interface Meta {
  "chat-cleared": number;
  "crypto-key": CryptoKey;
  sync: StoredSync;
}

interface Schema extends DBSchema {
  entries: { key: string; value: Entry; indexes: { date: string } };
  settings: { key: string; value: Settings };
  chat: { key: string; value: ChatMessage; indexes: { time: number } };
  /** Deleted meals: id → when, so a sync does not bring them back. */
  deleted: { key: string; value: number };
  meta: { key: keyof Meta; value: Meta[keyof Meta] };
}

const DB_NAME = "calorie-ai-tracker";
const SETTINGS_KEY = "me";

let db: Promise<IDBPDatabase<Schema>> | null = null;

function open(): Promise<IDBPDatabase<Schema>> {
  db ??= openDB<Schema>(DB_NAME, 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore("entries", { keyPath: "id" }).createIndex("date", "date");
        d.createObjectStore("settings");
        d.createObjectStore("chat", { keyPath: "id" }).createIndex("time", "time");
      }
      if (oldVersion < 2) {
        d.createObjectStore("deleted");
        d.createObjectStore("meta");
      }
    },
  });
  return db;
}

const listeners = new Set<() => void>();

/** Called after each change made in the app (not after a sync writes). */
export function onChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed(): void {
  for (const l of listeners) l();
}

export async function allEntries(): Promise<Entry[]> {
  const list = await (await open()).getAll("entries");
  return list.sort((a, b) => a.time - b.time);
}

export async function putEntry(entry: Entry): Promise<void> {
  await (await open()).put("entries", entry);
  changed();
}

export async function deleteEntry(id: string): Promise<void> {
  const tx = (await open()).transaction(["entries", "deleted"], "readwrite");
  await Promise.all([
    tx.objectStore("entries").delete(id),
    tx.objectStore("deleted").put(Date.now(), id),
    tx.done,
  ]);
  changed();
}

export async function loadSettings(): Promise<Settings> {
  const saved = await (await open()).get("settings", SETTINGS_KEY);
  return {
    profile: { ...DEFAULT_PROFILE, ...saved?.profile },
    goals: saved?.goals ?? DEFAULT_GOALS,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await open()).put("settings", { ...settings, updated: Date.now() }, SETTINGS_KEY);
  changed();
}

export async function chatHistory(): Promise<ChatMessage[]> {
  return (await open()).getAllFromIndex("chat", "time");
}

export async function putChat(message: ChatMessage): Promise<void> {
  await (await open()).put("chat", message);
  changed();
}

export async function clearChat(): Promise<void> {
  const tx = (await open()).transaction(["chat", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("chat").clear(),
    tx.objectStore("meta").put(Date.now(), "chat-cleared"),
    tx.done,
  ]);
  changed();
}

/** Removes every meal, the profile, the goals, the conversation and the sync settings. */
export async function clearAll(): Promise<void> {
  const d = await open();
  await Promise.all(
    (["entries", "settings", "chat", "deleted", "meta"] as const).map((s) => d.clear(s)),
  );
}

async function photoToUrl(photo: Blob): Promise<string> {
  const bytes = new Uint8Array(await photo.arrayBuffer());
  return `data:${photo.type || "image/jpeg"};base64,${toBase64(bytes)}`;
}

function urlToPhoto(url: string): Blob | undefined {
  const match = /^data:([^;,]*);base64,(.*)$/s.exec(url);
  return match
    ? new Blob([fromBase64(match[2] ?? "")], { type: match[1] ?? "image/jpeg" })
    : undefined;
}

/** Everything, in the form the sync file takes. */
export async function exportSnapshot(): Promise<Snapshot> {
  const d = await open();
  const [entries, settings, chat, deletedIds, deletedTimes, chatCleared] = await Promise.all([
    allEntries(),
    d.get("settings", SETTINGS_KEY),
    chatHistory(),
    d.getAllKeys("deleted"),
    d.getAll("deleted"),
    d.get("meta", "chat-cleared"),
  ]);
  const synced: SyncedEntry[] = await Promise.all(
    entries.map(async ({ photo, ...e }) => (photo ? { ...e, photo: await photoToUrl(photo) } : e)),
  );
  return {
    app: "calorie-ai-tracker",
    version: 1,
    entries: synced,
    deleted: Object.fromEntries(deletedIds.map((id, i) => [id, deletedTimes[i] ?? 0])),
    settings: settings
      ? { profile: settings.profile, goals: settings.goals, updated: settings.updated ?? 0 }
      : null,
    chat,
    chatCleared: typeof chatCleared === "number" ? chatCleared : 0,
  };
}

/**
 * Keeps synced data: merged once more with what is here now, so a meal saved
 * while the sync ran is not lost. Resolves with what was written.
 */
export async function applySnapshot(snapshot: Snapshot): Promise<Snapshot> {
  const result = merge(await exportSnapshot(), snapshot);
  const stores = ["entries", "settings", "chat", "deleted", "meta"] as const;
  const tx = (await open()).transaction(stores, "readwrite");
  const entries = tx.objectStore("entries");
  const chat = tx.objectStore("chat");
  const deleted = tx.objectStore("deleted");
  const writes: Promise<unknown>[] = [entries.clear(), chat.clear(), deleted.clear()];
  for (const { photo, ...e } of result.entries) {
    const blob = photo ? urlToPhoto(photo) : undefined;
    writes.push(entries.put(blob ? { ...e, photo: blob } : e));
  }
  for (const m of result.chat) writes.push(chat.put(m));
  for (const [id, time] of Object.entries(result.deleted)) writes.push(deleted.put(time, id));
  if (result.settings) writes.push(tx.objectStore("settings").put(result.settings, SETTINGS_KEY));
  writes.push(tx.objectStore("meta").put(result.chatCleared, "chat-cleared"));
  await Promise.all([...writes, tx.done]);
  return result;
}

/** A key the page can use but never read out, made once per browser. */
async function cryptoKey(): Promise<CryptoKey> {
  const d = await open();
  const saved = await d.get("meta", "crypto-key");
  if (saved instanceof CryptoKey) return saved;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  await d.put("meta", key, "crypto-key");
  return key;
}

export interface SyncState {
  config: SyncConfig;
  lastSync: number | null;
}

export async function loadSync(): Promise<SyncState | null> {
  const saved = (await (await open()).get("meta", "sync")) as StoredSync | undefined;
  if (!saved) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: saved.token.iv },
      await cryptoKey(),
      saved.token.data,
    );
    const token = new TextDecoder().decode(plain);
    return {
      config: { repo: saved.repo, path: saved.path, token },
      lastSync: saved.lastSync ?? null,
    };
  } catch {
    return null;
  }
}

export async function saveSync(config: SyncConfig, lastSync?: number): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await cryptoKey(),
    new TextEncoder().encode(config.token),
  );
  const stored: StoredSync = {
    repo: config.repo,
    path: config.path,
    token: { iv, data },
    ...(lastSync ? { lastSync } : {}),
  };
  await (await open()).put("meta", stored, "sync");
}

export async function clearSync(): Promise<void> {
  await (await open()).delete("meta", "sync");
}
