import { describe, expect, test } from "bun:test";
import { DEFAULT_GOALS, DEFAULT_PROFILE } from "./model";
import {
  emptySnapshot,
  fromBase64,
  merge,
  type Snapshot,
  type SyncedEntry,
  syncRepo,
  toBase64,
} from "./sync";

const entry = (id: string, time: number, updated?: number, title = "meal"): SyncedEntry => ({
  id,
  date: "2026-10-26",
  time,
  mealType: "lunch",
  title,
  items: [],
  source: "text",
  ...(updated ? { updated } : {}),
});

const snap = (over: Partial<Snapshot>): Snapshot => ({ ...emptySnapshot(), ...over });

const config = { repo: "me/data", path: "calorie-ai-tracker.json", token: "ghp_test" };

const encode = (s: Snapshot) => toBase64(new TextEncoder().encode(JSON.stringify(s)));
const decode = (content: string) =>
  JSON.parse(new TextDecoder().decode(fromBase64(content))) as Snapshot;

/** A repository holding one file, as the Contents API serves it. */
function github(initial: Snapshot | null, { conflicts = 0 } = {}) {
  const state = { file: initial, sha: initial ? "sha-0" : null, puts: 0, conflicts };
  const fetchImpl = async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://api.github.com/repos/me/data/contents/calorie-ai-tracker.json");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer ghp_test");
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body)) as { content: string; sha?: string };
      if (state.conflicts > 0 || (body.sha ?? null) !== state.sha) {
        state.conflicts--;
        state.sha = `sha-other-${state.conflicts}`;
        return Response.json({ message: "conflict" }, { status: 409 });
      }
      state.puts++;
      state.file = decode(body.content);
      state.sha = `sha-${state.puts}`;
      return Response.json({ content: { sha: state.sha } });
    }
    if (!state.file) return Response.json({ message: "Not Found" }, { status: 404 });
    return Response.json({ sha: state.sha, encoding: "base64", content: encode(state.file) });
  };
  return { state, fetchImpl };
}

describe("merge", () => {
  test("joins meals by id and keeps the latest edit", () => {
    const a = snap({ entries: [entry("1", 1), entry("2", 2, 10, "old")] });
    const b = snap({ entries: [entry("2", 2, 20, "new"), entry("3", 3)] });
    const merged = merge(a, b);
    expect(merged.entries.map((e) => [e.id, e.title])).toEqual([
      ["1", "meal"],
      ["2", "new"],
      ["3", "meal"],
    ]);
    expect(merge(b, a)).toEqual(merged);
    expect(merge(merged, merged)).toEqual(merged);
  });

  test("a deleted meal stays deleted, an edit after the deletion brings it back", () => {
    const a = snap({ entries: [entry("1", 1), entry("2", 2)] });
    const b = snap({ deleted: { "1": 5, "2": 5 } });
    expect(merge(a, b).entries).toEqual([]);
    const edited = snap({ entries: [entry("2", 2, 9)] });
    expect(merge(merge(a, b), edited).entries.map((e) => e.id)).toEqual(["2"]);
  });

  test("the latest profile wins, and clearing the conversation drops older messages", () => {
    const older = { profile: DEFAULT_PROFILE, goals: DEFAULT_GOALS, updated: 1 };
    const newer = { ...older, goals: { ...DEFAULT_GOALS, kcal: 1800 }, updated: 2 };
    const msg = (id: string, time: number) => ({ id, role: "user" as const, text: id, time });
    const a = snap({ settings: older, chat: [msg("a", 1), msg("b", 10)] });
    const b = snap({ settings: newer, chatCleared: 5 });
    const merged = merge(a, b);
    expect(merged.settings?.goals.kcal).toBe(1800);
    expect(merged.chat.map((m) => m.id)).toEqual(["b"]);
    expect(merge(snap({}), a).settings).toEqual(older);
  });
});

describe("base64", () => {
  test("round-trips UTF-8 and large buffers", () => {
    const text = "Crème brûlée 🍮 ".repeat(5000);
    const bytes = new TextEncoder().encode(text);
    expect(new TextDecoder().decode(fromBase64(toBase64(bytes)))).toBe(text);
  });
});

describe("syncRepo", () => {
  test("creates the file when there is none", async () => {
    const { state, fetchImpl } = github(null);
    const local = snap({ entries: [entry("1", 1)] });
    expect(await syncRepo(config, local, fetchImpl)).toEqual(local);
    expect(state.file).toEqual(local);
  });

  test("merges with the file and writes back only when something changed", async () => {
    const { state, fetchImpl } = github(snap({ entries: [entry("2", 2)] }));
    const merged = await syncRepo(config, snap({ entries: [entry("1", 1)] }), fetchImpl);
    expect(merged.entries.map((e) => e.id)).toEqual(["1", "2"]);
    expect(state.file).toEqual(merged);
    expect(state.puts).toBe(1);
    await syncRepo(config, merged, fetchImpl);
    expect(state.puts).toBe(1);
  });

  test("starts again when another device wrote in between", async () => {
    const { state, fetchImpl } = github(snap({ entries: [entry("2", 2)] }), { conflicts: 1 });
    const merged = await syncRepo(config, snap({ entries: [entry("1", 1)] }), fetchImpl);
    expect(merged.entries).toHaveLength(2);
    expect(state.puts).toBe(1);
  });

  test("says when the token is refused, and refuses a file of another app", async () => {
    const refused = async () => Response.json({ message: "Bad credentials" }, { status: 401 });
    await expect(syncRepo(config, snap({}), refused)).rejects.toThrow("GitHub refused the token.");
    const other = async () =>
      Response.json({
        sha: "x",
        encoding: "base64",
        content: toBase64(new TextEncoder().encode('{"hello":1}')),
      });
    await expect(syncRepo(config, snap({}), other)).rejects.toThrow("not calorie-ai-tracker data");
  });
});
