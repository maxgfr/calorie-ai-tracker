/** The week: calories per day against the goal, averages, streak. */
import { useMemo } from "react";
import { addDays, dayKey, formatDay, parseDay, weekStart } from "../data/dates";
import { streak, weekSummary } from "../data/stats";
import { Button, Icon, MacroLine, PageTitle } from "./kit";
import { go, href } from "./router";
import { useApp } from "./state";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="label">{label}</div>
      <div className="num text-2xl font-bold tracking-tight">{value}</div>
      {hint ? <div className="text-xs text-stone-500 dark:text-stone-400">{hint}</div> : null}
    </div>
  );
}

export function Week({ date }: { date?: string | undefined }) {
  const { entries, goals } = useApp();
  const today = dayKey();
  const start = weekStart(date ?? today);
  const week = useMemo(() => weekSummary(entries, start, goals), [entries, start, goals]);
  const thisWeek = start === weekStart(today);
  const end = addDays(start, 6);
  const range = `${parseDay(start).toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${parseDay(end).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  const max = Math.max(goals.kcal * 1.3, ...week.days.map((d) => d.kcal));
  const pct = (kcal: number) => (kcal / max) * 100;
  const diff = Math.round(week.average.kcal - goals.kcal);

  return (
    <>
      <PageTitle title={thisWeek ? "This week" : "Week"} subtitle={range}>
        <div className="flex items-center gap-1">
          <a
            className="rounded-lg p-2 hover:bg-stone-200 dark:hover:bg-stone-800"
            href={href({ name: "week", date: addDays(start, -7) })}
            aria-label="Previous week"
          >
            <Icon name="left" />
          </a>
          {!thisWeek ? (
            <a className="chip" href={href({ name: "week" })}>
              This week
            </a>
          ) : null}
          <a
            className={`rounded-lg p-2 hover:bg-stone-200 dark:hover:bg-stone-800 ${thisWeek ? "pointer-events-none opacity-30" : ""}`}
            href={href({ name: "week", date: addDays(start, 7) })}
            aria-label="Next week"
            aria-disabled={thisWeek}
          >
            <Icon name="right" />
          </a>
        </div>
      </PageTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Daily average"
          value={week.logged ? `${Math.round(week.average.kcal)}` : "–"}
          hint={week.logged ? `${diff > 0 ? "+" : ""}${diff} kcal vs goal` : "kcal"}
        />
        <Tile label="On target" value={`${week.onTarget}/${week.logged}`} hint="days within ±10%" />
        <Tile label="Logged" value={`${week.logged}/7`} hint="days" />
        <Tile label="Streak" value={`${streak(entries, today)}`} hint="days in a row" />
      </div>

      <section className="card mt-4" aria-label="Calories per day">
        <div className="relative mt-5 h-48">
          <div
            className="absolute inset-x-0 border-t-2 border-dashed border-stone-300 dark:border-stone-600"
            style={{ bottom: `${pct(goals.kcal)}%` }}
          >
            <span className="absolute right-0 bottom-1 text-xs text-stone-500">
              goal {goals.kcal}
            </span>
          </div>
          <div className="grid h-full grid-cols-7 gap-2 sm:gap-4">
            {week.days.map((d) => {
              const over = d.kcal > goals.kcal * 1.1;
              const color = over
                ? "bg-rose-400 dark:bg-rose-500"
                : d.onTarget
                  ? "bg-brand-600 dark:bg-brand-400"
                  : "bg-brand-200 dark:bg-brand-800";
              return (
                <a
                  key={d.date}
                  href={href({ name: "day", date: d.date })}
                  title={`${formatDay(d.date)}: ${Math.round(d.kcal)} kcal`}
                  className="flex h-full flex-col items-center justify-end"
                >
                  {d.meals > 0 ? (
                    <>
                      <span className="num mb-1 text-[11px] text-stone-500 dark:text-stone-400">
                        {Math.round(d.kcal)}
                      </span>
                      <span
                        className={`w-full max-w-12 rounded-t-lg rounded-b-sm transition-[height] duration-700 ${color}`}
                        style={{ height: `${pct(d.kcal)}%` }}
                      />
                    </>
                  ) : (
                    <span className="h-1 w-full max-w-12 rounded-full bg-stone-200 dark:bg-stone-800" />
                  )}
                </a>
              );
            })}
          </div>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-2 text-center text-xs sm:gap-4">
          {week.days.map((d) => (
            <span
              key={d.date}
              className={
                d.date === today
                  ? "font-bold text-brand-700 dark:text-brand-400"
                  : "text-stone-500 dark:text-stone-400"
              }
            >
              {formatDay(d.date, "short")}
            </span>
          ))}
        </div>
      </section>

      <section className="card mt-4 py-1">
        <ul className="divide-y divide-stone-100 dark:divide-stone-800">
          {week.days.map((d) => (
            <li key={d.date}>
              <a
                href={href({ name: "day", date: d.date })}
                className="flex items-center justify-between gap-3 py-3 hover:opacity-80"
              >
                <div>
                  <div className="font-medium">{formatDay(d.date)}</div>
                  {d.meals > 0 ? (
                    <MacroLine n={d} />
                  ) : (
                    <span className="text-xs text-stone-400">Nothing logged</span>
                  )}
                </div>
                <div className="num text-right">
                  <span className="font-semibold">{Math.round(d.kcal)}</span>
                  <span className="text-xs text-stone-500"> / {goals.kcal}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-5 flex justify-center">
        <Button
          variant="secondary"
          icon="spark"
          disabled={week.logged === 0}
          onClick={() =>
            go({
              name: "coach",
              ask: "Review my week: what went well, what should I change next week?",
            })
          }
        >
          Ask the coach about this week
        </Button>
      </div>
    </>
  );
}
