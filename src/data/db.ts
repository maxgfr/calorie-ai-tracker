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

interface Settings {
  profile: Profile;
  goals: Goals;
}

interface Schema extends DBSchema {
  entries: { key: string; value: Entry; indexes: { date: string } };
  settings: { key: string; value: Settings };
  chat: { key: string; value: ChatMessage; indexes: { time: number } };
}

const DB_NAME = "calorie-ai-tracker";
const SETTINGS_KEY = "me";

let db: Promise<IDBPDatabase<Schema>> | null = null;

function open(): Promise<IDBPDatabase<Schema>> {
  db ??= openDB<Schema>(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore("entries", { keyPath: "id" }).createIndex("date", "date");
      d.createObjectStore("settings");
      d.createObjectStore("chat", { keyPath: "id" }).createIndex("time", "time");
    },
  });
  return db;
}

export async function allEntries(): Promise<Entry[]> {
  const list = await (await open()).getAll("entries");
  return list.sort((a, b) => a.time - b.time);
}

export async function putEntry(entry: Entry): Promise<void> {
  await (await open()).put("entries", entry);
}

export async function deleteEntry(id: string): Promise<void> {
  await (await open()).delete("entries", id);
}

export async function loadSettings(): Promise<Settings> {
  const saved = await (await open()).get("settings", SETTINGS_KEY);
  return {
    profile: { ...DEFAULT_PROFILE, ...saved?.profile },
    goals: saved?.goals ?? DEFAULT_GOALS,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await open()).put("settings", settings, SETTINGS_KEY);
}

export async function chatHistory(): Promise<ChatMessage[]> {
  return (await open()).getAllFromIndex("chat", "time");
}

export async function putChat(message: ChatMessage): Promise<void> {
  await (await open()).put("chat", message);
}

export async function clearChat(): Promise<void> {
  await (await open()).clear("chat");
}

/** Removes every meal, the profile, the goals and the conversation. */
export async function clearAll(): Promise<void> {
  const d = await open();
  await Promise.all([d.clear("entries"), d.clear("settings"), d.clear("chat")]);
}
