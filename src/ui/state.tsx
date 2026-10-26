/**
 * The app's data in React: meals, profile and goals, loaded from IndexedDB, and
 * the sync with GitHub when one is set up.
 */
import type { LlmSettings } from "llm-connect";
import { useLlmSettings } from "llm-connect/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { llm, loadLlmSettings, savedSettings } from "../ai/settings";
import * as db from "../data/db";
import {
  DEFAULT_GOALS,
  DEFAULT_PROFILE,
  type Entry,
  type Goals,
  type Profile,
} from "../data/model";
import { type SyncConfig, syncRepo } from "../data/sync";

export interface SyncStatus {
  /** Where the data goes, without the token; null when sync is off. */
  target: { repo: string; path: string } | null;
  syncing: boolean;
  error: string | null;
  lastSync: number | null;
}

const NO_SYNC: SyncStatus = { target: null, syncing: false, error: null, lastSync: null };

/** How long after a change the sync waits for the next one. */
const SYNC_DELAY = 2000;

interface AppState {
  ready: boolean;
  entries: Entry[];
  profile: Profile;
  goals: Goals;
  /** The saved AI settings, when they can call a model. */
  settings: LlmSettings | null;
  sync: SyncStatus;
  /** Goes up each time a sync rewrites the data, for views that read it themselves. */
  revision: number;
  saveEntry(entry: Entry): Promise<void>;
  removeEntry(id: string): Promise<void>;
  saveProfile(profile: Profile, goals: Goals): Promise<void>;
  resetAll(): Promise<void>;
  /** Syncs once with this repository and keeps it if that works. */
  connectSync(config: SyncConfig): Promise<boolean>;
  disconnectSync(): Promise<void>;
  syncNow(): Promise<boolean>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const [sync, setSync] = useState<SyncStatus>(NO_SYNC);
  const [revision, setRevision] = useState(0);
  const syncConfig = useRef<SyncConfig | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const llmState = useLlmSettings(llm);

  const reload = useCallback(async () => {
    const [list, s] = await Promise.all([db.allEntries(), db.loadSettings()]);
    setEntries(list);
    setProfile(s.profile);
    setGoals(s.goals);
  }, []);

  const syncNow = useCallback((): Promise<boolean> => {
    const config = syncConfig.current;
    if (!config) return Promise.resolve(false);
    if (running.current) {
      // A change during a sync: one more round once it is done.
      again.current = true;
      return running.current;
    }
    const run = async () => {
      setSync((s) => ({ ...s, syncing: true, error: null }));
      try {
        do {
          again.current = false;
          const merged = await syncRepo(config, await db.exportSnapshot());
          if (syncConfig.current !== config) return false;
          await db.applySnapshot(merged);
        } while (again.current);
        const now = Date.now();
        await db.saveSync(config, now);
        await reload();
        setRevision((r) => r + 1);
        setSync({ target: config, syncing: false, error: null, lastSync: now });
        return true;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        setSync((s) => ({ ...s, syncing: false, error }));
        return false;
      } finally {
        running.current = null;
      }
    };
    running.current = run();
    return running.current;
  }, [reload]);

  useEffect(() => {
    Promise.all([reload(), db.loadSync(), loadLlmSettings()])
      .then(([, saved]) => {
        if (!saved) return;
        syncConfig.current = saved.config;
        setSync({ ...NO_SYNC, target: saved.config, lastSync: saved.lastSync });
        void syncNow();
      })
      .catch((err) => console.error("calorie-ai-tracker: could not load data", err))
      .finally(() => setReady(true));
  }, [reload, syncNow]);

  // Sync shortly after each change, and when the app comes back to the foreground.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = db.onChange(() => {
      if (!syncConfig.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), SYNC_DELAY);
    });
    const visible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      off();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [syncNow]);

  const connectSync = useCallback(
    async (config: SyncConfig) => {
      const previous = syncConfig.current;
      syncConfig.current = config;
      setSync({ ...NO_SYNC, target: config });
      const ok = await syncNow();
      if (!ok) {
        syncConfig.current = previous;
        setSync((s) => ({ ...s, target: previous }));
      }
      return ok;
    },
    [syncNow],
  );

  const disconnectSync = useCallback(async () => {
    syncConfig.current = null;
    await db.clearSync();
    setSync(NO_SYNC);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read when the store saves
  const settings = useMemo(() => savedSettings(), [llmState.saved]);

  const saveEntry = useCallback(async (entry: Entry) => {
    const saved = { ...entry, updated: Date.now() };
    await db.putEntry(saved);
    setEntries((list) =>
      [...list.filter((e) => e.id !== entry.id), saved].sort((a, b) => a.time - b.time),
    );
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    await db.deleteEntry(id);
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  const saveProfile = useCallback(async (p: Profile, g: Goals) => {
    await db.saveSettings({ profile: p, goals: g });
    setProfile(p);
    setGoals(g);
  }, []);

  const resetAll = useCallback(async () => {
    syncConfig.current = null;
    await db.clearAll();
    setSync(NO_SYNC);
    setEntries([]);
    setProfile(DEFAULT_PROFILE);
    setGoals(DEFAULT_GOALS);
  }, []);

  const value = useMemo(
    () => ({
      ready,
      entries,
      profile,
      goals,
      settings,
      sync,
      revision,
      saveEntry,
      removeEntry,
      saveProfile,
      resetAll,
      connectSync,
      disconnectSync,
      syncNow,
    }),
    [
      ready,
      entries,
      profile,
      goals,
      settings,
      sync,
      revision,
      saveEntry,
      removeEntry,
      saveProfile,
      resetAll,
      connectSync,
      disconnectSync,
      syncNow,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
