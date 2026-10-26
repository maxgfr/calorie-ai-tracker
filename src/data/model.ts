/** What the app keeps: meals, the profile with its goals, and the coach's conversation. */

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export interface Nutrients {
  kcal: number;
  /** Grams. */
  protein: number;
  carbs: number;
  fat: number;
}

export interface FoodItem extends Nutrients {
  name: string;
  /** As the model or the user wrote it: "2 eggs", "150 g". */
  quantity: string;
}

export type EntrySource = "text" | "photo" | "voice" | "manual";
export type Confidence = "low" | "medium" | "high";

export interface Entry {
  id: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Epoch ms, for ordering within the day. */
  time: number;
  mealType: MealType;
  title: string;
  items: FoodItem[];
  source: EntrySource;
  /** What the user typed or said. */
  input?: string;
  confidence?: Confidence;
  notes?: string;
  /** A small JPEG of the photo, when there was one. */
  photo?: Blob;
  /** Epoch ms of the last edit, so the latest one wins when syncing. */
  updated?: number;
}

export const SEXES = ["female", "male"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITIES = {
  sedentary: { label: "Sedentary", hint: "Desk job, little exercise", factor: 1.2 },
  light: { label: "Light", hint: "Exercise 1–3 days a week", factor: 1.375 },
  moderate: { label: "Moderate", hint: "Exercise 3–5 days a week", factor: 1.55 },
  active: { label: "Active", hint: "Hard exercise 6–7 days a week", factor: 1.725 },
  "very-active": { label: "Very active", hint: "Physical job or two sessions a day", factor: 1.9 },
} as const;
export type Activity = keyof typeof ACTIVITIES;

export const OBJECTIVES = {
  lose: "Lose weight",
  maintain: "Maintain",
  gain: "Gain weight",
} as const;
export type Objective = keyof typeof OBJECTIVES;

export interface Profile {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: Activity;
  objective: Objective;
  /** Free text for the AI: training, diet, constraints. */
  notes: string;
}

export interface Goals extends Nutrients {
  /** Why these numbers, when the AI proposed them. */
  rationale?: string;
}

/** How an answer ended when it did not end on its own: stopped, cut at the length limit… */
export type AnswerEnd = "stopped" | "length" | "truncated" | "refusal" | "content-filter";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  time: number;
  end?: AnswerEnd;
}

export const DEFAULT_PROFILE: Profile = {
  sex: "female",
  age: 30,
  heightCm: 168,
  weightKg: 65,
  activity: "light",
  objective: "maintain",
  notes: "",
};

export const DEFAULT_GOALS: Goals = { kcal: 2000, protein: 110, carbs: 230, fat: 70 };

export function newId(): string {
  return crypto.randomUUID();
}
