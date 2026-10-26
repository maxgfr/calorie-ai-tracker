/** One day: the calorie ring, macros, and the meals logged. */
import { useEffect, useMemo, useState } from "react";
import { addDays, dayKey, relativeDay } from "../data/dates";
import { type Entry, MEAL_TYPES } from "../data/model";
import { dayTotals, entryTotals, streak } from "../data/stats";
import { Button, Icon, MacroBars, MacroLine, PageTitle, Ring } from "./kit";
import { go, href } from "./router";
import { useApp } from "./state";

const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks" };

function Thumb({ photo }: { photo: Blob }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(photo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);
  return url ? <img src={url} alt="" className="size-12 shrink-0 rounded-lg object-cover" /> : null;
}

function MealRow({ entry, onDelete }: { entry: Entry; onDelete: () => void }) {
  const t = entryTotals(entry);
  return (
    <li className="flex items-center gap-3 py-3">
      {entry.photo ? <Thumb photo={entry.photo} /> : null}
      <a
        href={href({ name: "edit", id: entry.id })}
        className="min-w-0 flex-1 rounded-lg focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <div className="truncate font-medium">{entry.title}</div>
        <div className="truncate text-xs text-stone-500 dark:text-stone-400">
          {entry.items.map((i) => i.name).join(", ")}
        </div>
        <MacroLine n={t} />
      </a>
      <div className="num shrink-0 text-right font-semibold">
        {Math.round(t.kcal)}
        <span className="ml-0.5 text-xs font-normal text-stone-500">kcal</span>
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-lg p-2 text-stone-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950"
        aria-label={`Delete ${entry.title}`}
      >
        <Icon name="trash" className="size-4" />
      </button>
    </li>
  );
}

export function Day({ date }: { date?: string | undefined }) {
  const { entries, goals, removeEntry } = useApp();
  const today = dayKey();
  const day = date ?? today;
  const mine = useMemo(() => entries.filter((e) => e.date === day), [entries, day]);
  const totals = useMemo(() => dayTotals(entries, day), [entries, day]);
  const days = streak(entries, today);

  return (
    <>
      <PageTitle
        title={relativeDay(day, today)}
        subtitle={
          days > 1
            ? `${days}-day logging streak`
            : day === today
              ? "Log what you eat; the AI does the counting."
              : day
        }
      >
        <div className="flex items-center gap-1">
          <a
            className="rounded-lg p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
            href={href({ name: "day", date: addDays(day, -1) })}
            aria-label="Previous day"
          >
            <Icon name="left" />
          </a>
          {day !== today ? (
            <a className="chip" href={href({ name: "day" })}>
              Today
            </a>
          ) : null}
          <a
            className={`rounded-lg p-2 hover:bg-stone-200 dark:hover:bg-stone-800 ${day >= today ? "pointer-events-none opacity-30" : ""}`}
            href={href({ name: "day", date: addDays(day, 1) })}
            aria-label="Next day"
            aria-disabled={day >= today}
          >
            <Icon name="right" />
          </a>
        </div>
      </PageTitle>

      <section className="card flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <Ring value={totals.kcal} goal={goals.kcal} />
        <div className="w-full flex-1">
          <MacroBars totals={totals} goals={goals} />
          <Button
            className="mt-5 w-full sm:w-auto"
            icon="plus"
            onClick={() => go({ name: "log", ...(day !== today ? { date: day } : {}) })}
          >
            Log a meal
          </Button>
        </div>
      </section>

      <section className="mt-6 flex flex-col gap-4">
        {mine.length === 0 ? (
          <div className="card text-center text-sm text-stone-500 dark:text-stone-400">
            <p className="font-medium text-stone-700 dark:text-stone-200">
              Nothing logged {day === today ? "yet today" : "this day"}.
            </p>
            <p className="mt-1">
              Type it, snap it or say it: “a bowl of oatmeal with banana and a coffee”.
            </p>
          </div>
        ) : (
          MEAL_TYPES.map((type) => {
            const list = mine.filter((e) => e.mealType === type);
            if (list.length === 0) return null;
            const kcal = list.reduce((s, e) => s + entryTotals(e).kcal, 0);
            return (
              <div key={type} className="card py-2">
                <div className="flex items-baseline justify-between pt-2">
                  <h2 className="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                    {MEAL_LABELS[type]}
                  </h2>
                  <span className="num text-sm text-stone-500">{Math.round(kcal)} kcal</span>
                </div>
                <ul className="divide-y divide-stone-100 dark:divide-stone-800">
                  {list.map((e) => (
                    <MealRow key={e.id} entry={e} onDelete={() => void removeEntry(e.id)} />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
