/** Totals and the week's summary, from the entries alone. */
import { addDays, weekDays } from "./dates";
import type { Entry, FoodItem, Goals, Nutrients } from "./model";

export const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

/** A day counts as on target within this share of the calorie goal. */
export const TARGET_TOLERANCE = 0.1;

export function sum(items: Nutrients[]): Nutrients {
  return items.reduce(
    (t, i) => ({
      kcal: t.kcal + i.kcal,
      protein: t.protein + i.protein,
      carbs: t.carbs + i.carbs,
      fat: t.fat + i.fat,
    }),
    ZERO,
  );
}

export function entryTotals(entry: Pick<Entry, "items">): Nutrients {
  return sum(entry.items);
}

export function dayTotals(entries: Entry[], day: string): Nutrients {
  return sum(entries.filter((e) => e.date === day).flatMap((e) => e.items));
}

export function remaining(totals: Nutrients, goals: Nutrients): Nutrients {
  return {
    kcal: goals.kcal - totals.kcal,
    protein: goals.protein - totals.protein,
    carbs: goals.carbs - totals.carbs,
    fat: goals.fat - totals.fat,
  };
}

export function onTarget(kcal: number, goal: number): boolean {
  return goal > 0 && Math.abs(kcal - goal) <= goal * TARGET_TOLERANCE;
}

export interface DaySummary extends Nutrients {
  date: string;
  meals: number;
  onTarget: boolean;
}

export interface WeekSummary {
  days: DaySummary[];
  /** Averages over the days with at least one meal. */
  average: Nutrients;
  logged: number;
  onTarget: number;
  total: Nutrients;
}

export function weekSummary(entries: Entry[], start: string, goals: Goals): WeekSummary {
  const days = weekDays(start).map((date) => {
    const mine = entries.filter((e) => e.date === date);
    const t = sum(mine.flatMap((e) => e.items));
    return {
      date,
      ...t,
      meals: mine.length,
      onTarget: mine.length > 0 && onTarget(t.kcal, goals.kcal),
    };
  });
  const logged = days.filter((d) => d.meals > 0);
  const total = sum(logged);
  const n = Math.max(1, logged.length);
  return {
    days,
    total,
    logged: logged.length,
    onTarget: logged.filter((d) => d.onTarget).length,
    average: {
      kcal: total.kcal / n,
      protein: total.protein / n,
      carbs: total.carbs / n,
      fat: total.fat / n,
    },
  };
}

/** Days in a row with a meal logged, ending today (or yesterday, if today is still empty). */
export function streak(entries: Entry[], today: string): number {
  const days = new Set(entries.map((e) => e.date));
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/** Calories from the macros, 4/4/9 kcal per gram. */
export function kcalFromMacros(n: Pick<Nutrients, "protein" | "carbs" | "fat">): number {
  return n.protein * 4 + n.carbs * 4 + n.fat * 9;
}

/** Rounded for display and storage: kcal to the unit, grams to the tenth. */
export function roundItem(item: FoodItem): FoodItem {
  const r = (n: number) => Math.round(Math.max(0, n) * 10) / 10;
  return {
    ...item,
    kcal: Math.round(Math.max(0, item.kcal)),
    protein: r(item.protein),
    carbs: r(item.carbs),
    fat: r(item.fat),
  };
}
