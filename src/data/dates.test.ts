import { describe, expect, test } from "bun:test";
import { addDays, dayKey, weekDays, weekStart } from "./dates";

describe("dates", () => {
  test("dayKey is the local calendar day", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  test("addDays crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  test("weeks start on Monday", () => {
    expect(weekStart("2026-10-26")).toBe("2026-10-26"); // a Monday
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // a Sunday
    expect(weekDays("2026-10-26").at(-1)).toBe("2026-11-01");
  });

  test("daylight saving does not skip or repeat a day", () => {
    expect(weekDays("2026-03-23")).toHaveLength(7);
    expect(new Set(weekDays("2026-10-19").concat(weekDays("2026-10-26"))).size).toBe(14);
  });
});
