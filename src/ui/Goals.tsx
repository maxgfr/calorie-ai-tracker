/** Your profile, and daily goals proposed by the AI or set by hand. */
import { useEffect, useMemo, useState } from "react";
import { suggestGoals } from "../ai/goals";
import { dayKey, weekStart } from "../data/dates";
import { baselineGoals, maintenanceKcal } from "../data/energy";
import {
  ACTIVITIES,
  type Activity,
  type Goals as GoalsT,
  OBJECTIVES,
  type Objective,
  type Profile,
  SEXES,
  type Sex,
} from "../data/model";
import { kcalFromMacros, weekSummary } from "../data/stats";
import { Button, Notice, PageTitle } from "./kit";
import { useApp } from "./state";

function NumberField({
  label,
  value,
  unit,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  unit: string;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      <span className="label">{label}</span>
      <div className="relative">
        <input
          className="input num pr-12"
          type="number"
          inputMode="decimal"
          min={min}
          {...(max !== undefined ? { max } : {})}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-stone-400">
          {unit}
        </span>
      </div>
    </label>
  );
}

export function Goals() {
  const { profile: saved, goals: savedGoals, entries, settings, saveProfile } = useApp();
  const [profile, setProfile] = useState<Profile>(saved);
  const [goals, setGoals] = useState<GoalsT>(savedGoals);
  const [busy, setBusy] = useState<"ai" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => setProfile(saved), [saved]);
  useEffect(() => setGoals(savedGoals), [savedGoals]);

  const baseline = useMemo(() => baselineGoals(profile), [profile]);
  const macroKcal = Math.round(kcalFromMacros(goals));
  const dirty =
    JSON.stringify(profile) !== JSON.stringify(saved) ||
    JSON.stringify(goals) !== JSON.stringify(savedGoals);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setProfile({ ...profile, [k]: v });

  async function askAi() {
    if (!settings) return;
    setBusy("ai");
    setError(null);
    try {
      const week = weekSummary(entries, weekStart(dayKey()), savedGoals);
      setGoals(await suggestGoals({ settings }, profile, baseline, week));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    setBusy("save");
    await saveProfile(profile, goals);
    setBusy(null);
    setSavedAt(Date.now());
  }

  return (
    <>
      <PageTitle
        title="Goals"
        subtitle="Tell the AI about you; it proposes daily targets you can adjust."
      />

      <section className="card grid gap-4">
        <h2 className="font-semibold">About you</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label>
            <span className="label">Sex</span>
            <select
              className="input"
              value={profile.sex}
              onChange={(e) => set("sex", e.target.value as Sex)}
            >
              {SEXES.map((s) => (
                <option key={s} value={s}>
                  {s === "female" ? "Female" : "Male"}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Age"
            unit="years"
            value={profile.age}
            min={14}
            max={110}
            onChange={(n) => set("age", n)}
          />
          <NumberField
            label="Height"
            unit="cm"
            value={profile.heightCm}
            min={100}
            max={250}
            onChange={(n) => set("heightCm", n)}
          />
          <NumberField
            label="Weight"
            unit="kg"
            value={profile.weightKg}
            min={30}
            max={350}
            onChange={(n) => set("weightKg", n)}
          />
        </div>
        <div>
          <span className="label">Activity</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACTIVITIES) as Activity[]).map((a) => (
              <button
                key={a}
                type="button"
                className="chip"
                aria-pressed={profile.activity === a}
                title={ACTIVITIES[a].hint}
                onClick={() => set("activity", a)}
              >
                {ACTIVITIES[a].label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-stone-500">{ACTIVITIES[profile.activity].hint}</p>
        </div>
        <div>
          <span className="label">Objective</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(OBJECTIVES) as Objective[]).map((o) => (
              <button
                key={o}
                type="button"
                className="chip"
                aria-pressed={profile.objective === o}
                onClick={() => set("objective", o)}
              >
                {OBJECTIVES[o]}
              </button>
            ))}
          </div>
        </div>
        <label>
          <span className="label">Anything else for the AI</span>
          <textarea
            className="input min-h-20"
            placeholder="“Weight training 4× a week”, “vegetarian”, “lose 5 kg by summer, slowly”…"
            value={profile.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </label>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          Maintenance estimate:{" "}
          <strong className="num">{Math.round(maintenanceKcal(profile))} kcal</strong> a day
          (Mifflin–St Jeor). Baseline for your objective:{" "}
          <span className="num">{baseline.kcal} kcal</span>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            icon="spark"
            busy={busy === "ai"}
            disabled={!settings}
            onClick={() => void askAi()}
          >
            Suggest goals with AI
          </Button>
          <Button variant="secondary" onClick={() => setGoals(baseline)}>
            Use the baseline
          </Button>
        </div>
        {!settings ? (
          <Notice tone="warn">Connect a model in Settings to get AI suggestions.</Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
      </section>

      <section className="card mt-4 grid gap-4">
        <h2 className="font-semibold">Daily goals</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumberField
            label="Calories"
            unit="kcal"
            value={goals.kcal}
            onChange={(n) => setGoals({ ...goals, kcal: n })}
          />
          <NumberField
            label="Protein"
            unit="g"
            value={goals.protein}
            onChange={(n) => setGoals({ ...goals, protein: n })}
          />
          <NumberField
            label="Carbs"
            unit="g"
            value={goals.carbs}
            onChange={(n) => setGoals({ ...goals, carbs: n })}
          />
          <NumberField
            label="Fat"
            unit="g"
            value={goals.fat}
            onChange={(n) => setGoals({ ...goals, fat: n })}
          />
        </div>
        {Math.abs(macroKcal - goals.kcal) > goals.kcal * 0.08 ? (
          <Notice tone="warn">
            The macros add up to <span className="num">{macroKcal}</span> kcal, not {goals.kcal}.
          </Notice>
        ) : null}
        {goals.rationale ? <Notice>{goals.rationale}</Notice> : null}
        <div className="flex items-center gap-3">
          <Button busy={busy === "save"} disabled={!dirty} onClick={() => void save()}>
            Save
          </Button>
          {savedAt && !dirty ? (
            <span className="text-sm text-brand-700 dark:text-brand-400">Saved.</span>
          ) : null}
        </div>
      </section>
    </>
  );
}
