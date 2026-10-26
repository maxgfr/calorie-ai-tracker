/** What the model answers, checked with Zod before it reaches the app. */
import { z } from "zod";
import { MEAL_TYPES } from "../data/model";

const grams = z.number().min(0).describe("Grams");

export const foodItemSchema = z.object({
  name: z.string().min(1).describe("Short food name, e.g. 'Scrambled eggs'"),
  quantity: z.string().describe("Estimated portion, e.g. '2 eggs (100 g)'"),
  kcal: z.number().min(0),
  protein: grams,
  carbs: grams,
  fat: grams,
});

export const mealSchema = z.object({
  title: z.string().min(1).describe("A short name for the whole meal"),
  mealType: z.enum(MEAL_TYPES),
  items: z.array(foodItemSchema).min(1),
  confidence: z
    .enum(["low", "medium", "high"])
    .describe("How sure the estimate is: low when portions had to be guessed"),
  notes: z
    .string()
    .describe("One or two sentences: assumptions made, or what would sharpen the estimate"),
  heard: z
    .string()
    .describe("For a voice recording: what the person said, word for word. Otherwise empty."),
});
export type MealAnswer = z.infer<typeof mealSchema>;

export const goalsSchema = z.object({
  kcal: z.number().min(800).max(6000),
  protein: grams,
  carbs: grams,
  fat: grams,
  rationale: z.string().describe("Two to four sentences explaining the numbers"),
});
export type GoalsAnswer = z.infer<typeof goalsSchema>;
