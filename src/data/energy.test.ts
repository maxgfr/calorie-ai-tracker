import { describe, expect, test } from "bun:test";
import { baselineGoals, maintenanceKcal, restingKcal } from "./energy";
import { DEFAULT_PROFILE, type Profile } from "./model";
import { kcalFromMacros } from "./stats";

const man: Profile = {
  ...DEFAULT_PROFILE,
  sex: "male",
  age: 30,
  heightCm: 180,
  weightKg: 80,
  activity: "moderate",
  objective: "maintain",
};

describe("energy", () => {
  test("Mifflin–St Jeor resting energy", () => {
    expect(restingKcal(man)).toBe(1780);
    expect(restingKcal({ ...man, sex: "female" })).toBe(1614);
  });

  test("maintenance applies the activity factor", () => {
    expect(maintenanceKcal(man)).toBeCloseTo(2759, 0);
  });

  test("baseline goals follow the objective and add up", () => {
    const keep = baselineGoals(man);
    const lose = baselineGoals({ ...man, objective: "lose" });
    expect(keep.kcal).toBe(2760);
    expect(lose.kcal).toBe(2260);
    expect(lose.protein).toBe(160);
    expect(Math.abs(kcalFromMacros(lose) - lose.kcal)).toBeLessThan(15);
  });

  test("baseline never drops below the safe floor", () => {
    const tiny: Profile = {
      ...man,
      sex: "female",
      weightKg: 40,
      heightCm: 145,
      age: 80,
      activity: "sedentary",
      objective: "lose",
    };
    expect(baselineGoals(tiny).kcal).toBe(1200);
  });
});
