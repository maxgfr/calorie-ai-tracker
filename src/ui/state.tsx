/** The app's data in React: meals, profile and goals, loaded once from IndexedDB. */
import type { LlmSettings } from "llm-connect";
import { useLlmSettings } from "llm-connect/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface AppState {
  ready: boolean;
  entries: Entry[];
  profile: Profile;
  goals: Goals;
  /** The saved AI settings, when they can call a model. */
  settings: LlmSettings | null;
  saveEntry(entry: Entry): Promise<void>;
  removeEntry(id: string): Promise<void>;
  saveProfile(profile: Profile, goals: Goals): Promise<void>;
  resetAll(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [goals, setGoals] = useState<Goals>(DEFAULT_GOALS);
  const llmState = useLlmSettings(llm);

  useEffect(() => {
    Promise.all([db.allEntries(), db.loadSettings(), loadLlmSettings()])
      .then(([list, s]) => {
        setEntries(list);
        setProfile(s.profile);
        setGoals(s.goals);
      })
      .catch((err) => console.error("calorie-ai-tracker: could not load data", err))
      .finally(() => setReady(true));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read when the store saves
  const settings = useMemo(() => savedSettings(), [llmState.saved]);

  const saveEntry = useCallback(async (entry: Entry) => {
    await db.putEntry(entry);
    setEntries((list) =>
      [...list.filter((e) => e.id !== entry.id), entry].sort((a, b) => a.time - b.time),
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
    await db.clearAll();
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
      saveEntry,
      removeEntry,
      saveProfile,
      resetAll,
    }),
    [ready, entries, profile, goals, settings, saveEntry, removeEntry, saveProfile, resetAll],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppProvider");
  return v;
}
