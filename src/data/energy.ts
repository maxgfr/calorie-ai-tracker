/**
 * The baseline the AI's goals are anchored on: resting energy by
 * Mifflin–St Jeor, times the activity factor, moved for the objective, with
 * protein by body weight, fat by share of calories and carbs for the rest.
 */
import { ACTIVITIES, type Goals, type Objective, type Profile } from "./model";

const OBJECTIVE_KCAL: Record<Objective, number> = { lose: -500, maintain: 0, gain: 300 };
const PROTEIN_PER_KG: Record<Objective, number> = { lose: 2, maintain: 1.6, gain: 1.8 };
const FAT_SHARE = 0.28;
/** Below this a goal needs medical follow-up, so the baseline never goes lower. */
const KCAL_FLOOR: Record<Profile["sex"], number> = { female: 1200, male: 1500 };

export function restingKcal(p: Pick<Profile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  return base + (p.sex === "male" ? 5 : -161);
}

export function maintenanceKcal(p: Profile): number {
  return restingKcal(p) * ACTIVITIES[p.activity].factor;
}

export function baselineGoals(p: Profile): Goals {
  const kcal = Math.max(KCAL_FLOOR[p.sex], maintenanceKcal(p) + OBJECTIVE_KCAL[p.objective]);
  const protein = p.weightKg * PROTEIN_PER_KG[p.objective];
  const fat = (kcal * FAT_SHARE) / 9;
  const carbs = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return {
    kcal: Math.round(kcal / 10) * 10,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
  };
}
