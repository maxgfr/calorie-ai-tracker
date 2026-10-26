import { describe, expect, test } from "bun:test";
import type { Entry, FoodItem } from "./model";
import { dayTotals, kcalFromMacros, onTarget, roundItem, streak, weekSummary } from "./stats";

const item = (kcal: number, protein = 10, carbs = 20, fat = 5): FoodItem => ({
  name: "food",
  quantity: "1",
  kcal,
  protein,
  carbs,
  fat,
});

const entry = (date: string, ...items: FoodItem[]): Entry => ({
  id: `${date}-${Math.random()}`,
  date,
  time: 0,
  mealType: "lunch",
  title: "meal",
  items,
  source: "text",
});

const goals = { kcal: 2000, protein: 100, carbs: 250, fat: 70 };

describe("stats", () => {
  test("dayTotals sums every item of the day only", () => {
    const entries = [entry("2026-10-26", item(500), item(300)), entry("2026-10-25", item(900))];
    expect(dayTotals(entries, "2026-10-26")).toEqual({
      kcal: 800,
      protein: 20,
      carbs: 40,
      fat: 10,
    });
  });

  test("onTarget allows ±10%", () => {
    expect(onTarget(2200, 2000)).toBe(true);
    expect(onTarget(1799, 2000)).toBe(false);
    expect(onTarget(0, 0)).toBe(false);
  });

  test("weekSummary averages over logged days", () => {
    const entries = [entry("2026-10-26", item(2000)), entry("2026-10-28", item(1000))];
    const w = weekSummary(entries, "2026-10-26", goals);
    expect(w.days).toHaveLength(7);
    expect(w.days[0]?.date).toBe("2026-10-26");
    expect(w.logged).toBe(2);
    expect(w.onTarget).toBe(1);
    expect(w.average.kcal).toBe(1500);
  });

  test("weekSummary of an empty week has zero averages", () => {
    const w = weekSummary([], "2026-10-26", goals);
    expect(w.logged).toBe(0);
    expect(w.average.kcal).toBe(0);
  });

  test("streak counts consecutive days back from today, or from yesterday", () => {
    const entries = ["2026-10-24", "2026-10-25", "2026-10-26"].map((d) => entry(d, item(1)));
    expect(streak(entries, "2026-10-26")).toBe(3);
    expect(streak(entries, "2026-10-27")).toBe(3);
    expect(streak(entries, "2026-10-28")).toBe(0);
  });

  test("kcalFromMacros uses 4/4/9", () => {
    expect(kcalFromMacros({ protein: 10, carbs: 10, fat: 10 })).toBe(170);
  });

  test("roundItem rounds and clamps negatives", () => {
    expect(roundItem(item(99.6, 1.234, -2, 3.36))).toMatchObject({
      kcal: 100,
      protein: 1.2,
      carbs: 0,
      fat: 3.4,
    });
  });
});
