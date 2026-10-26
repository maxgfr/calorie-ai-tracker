/** Daily goals from the profile, anchored on the Mifflin–St Jeor baseline. */
import { languageName } from "llm-connect";
import { maintenanceKcal, restingKcal } from "../data/energy";
import { ACTIVITIES, type Goals, OBJECTIVES, type Profile } from "../data/model";
import type { WeekSummary } from "../data/stats";
import { type CallContext, structured } from "./call";
import { type GoalsAnswer, goalsSchema } from "./schema";

export function goalsInstructions(language: string | undefined): string {
  return [
    "You are a registered dietitian setting daily calorie and macro goals for a calorie tracker.",
    "Start from the computed baseline and adjust it only for what the profile and notes justify (training, diet, pace).",
    "Stay safe: no more than a 25% deficit, at least 1200 kcal (female) or 1500 kcal (male), protein 1.2–2.4 g/kg.",
    "Make the macros add up to the calories (4/4/9 kcal per gram).",
    `Write the rationale in ${languageName(language)}, plainly, without medical claims.`,
  ].join("\n");
}

export function goalsText(profile: Profile, baseline: Goals, week?: WeekSummary): string {
  const lines = [
    `Profile: ${profile.sex}, ${profile.age} years, ${profile.heightCm} cm, ${profile.weightKg} kg.`,
    `Activity: ${ACTIVITIES[profile.activity].label} (${ACTIVITIES[profile.activity].hint}).`,
    `Objective: ${OBJECTIVES[profile.objective]}.`,
    `Resting energy (Mifflin–St Jeor): ${Math.round(restingKcal(profile))} kcal; maintenance: ${Math.round(maintenanceKcal(profile))} kcal.`,
    `Baseline goals: ${baseline.kcal} kcal, protein ${baseline.protein} g, carbs ${baseline.carbs} g, fat ${baseline.fat} g.`,
  ];
  if (profile.notes.trim()) lines.push(`Notes from the user: ${profile.notes.trim()}`);
  if (week && week.logged > 0) {
    lines.push(
      `This week they logged ${week.logged} days, averaging ${Math.round(week.average.kcal)} kcal and ${Math.round(week.average.protein)} g protein.`,
    );
  }
  return lines.join("\n");
}

export async function suggestGoals(
  ctx: CallContext,
  profile: Profile,
  baseline: Goals,
  week?: WeekSummary,
): Promise<GoalsAnswer> {
  const answer = await structured(
    ctx,
    goalsSchema,
    "goals",
    goalsInstructions(ctx.settings.language),
    [{ role: "user", content: goalsText(profile, baseline, week) }],
  );
  return {
    ...answer,
    kcal: Math.round(answer.kcal),
    protein: Math.round(answer.protein),
    carbs: Math.round(answer.carbs),
    fat: Math.round(answer.fat),
  };
}
