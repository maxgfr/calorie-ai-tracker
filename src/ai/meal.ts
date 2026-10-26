/** A meal from words, a photo or both: foods, portions, calories and macros. */
import type { ModelMessage } from "ai";
import { languageName } from "llm-connect";
import type { MealType } from "../data/model";
import { roundItem } from "../data/stats";
import { type CallContext, structured } from "./call";
import { type MealAnswer, mealSchema } from "./schema";

export interface ModelImage {
  data: Uint8Array;
  mediaType: string;
}

/** A recording, as WAV. */
export type ModelAudio = ModelImage;

export interface MealInput {
  text?: string;
  image?: ModelImage;
  audio?: ModelAudio;
  /** The meal type the user already picked, if any. */
  mealType?: MealType;
  /** The previous estimate and what the user says is wrong with it. */
  previous?: MealAnswer;
  correction?: string;
  now?: Date;
}

export function mealInstructions(language: string | undefined): string {
  return [
    "You are a meticulous nutritionist estimating what someone ate, for a calorie tracker.",
    "List each distinct food or drink as its own item, with a realistic portion when none is given (say which in notes).",
    "Give calories and macros (protein, carbs, fat in grams) for the portion, from standard food composition tables (USDA, CIQUAL).",
    "Count cooking fat, sauces, dressings, sugar and milk in drinks when they are likely, as their own items.",
    "From a voice recording, listen for every food and quantity said, and write what was said in heard.",
    "From a photo, judge portions against the plate, cutlery and hands; mention the main uncertainty in notes.",
    "Keep kcal consistent with the macros (4 kcal/g protein and carbs, 9 kcal/g fat, 7 kcal/g alcohol).",
    "If the input is not food at all, return a single item named 'Nothing to log' with zeros and low confidence.",
    `Write titles, food names, quantities and notes in ${languageName(language)}.`,
  ].join("\n");
}

function hourHint(now: Date): string {
  const t = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `It is ${t} local time.`;
}

export function mealText(input: MealInput): string {
  const lines: string[] = [];
  if (input.previous) {
    lines.push("Your previous estimate:", JSON.stringify(input.previous));
    lines.push(`The user corrects it: ${input.correction?.trim() || "(no comment)"}`);
    lines.push("Return the whole meal again with the correction applied.");
  } else if (input.text?.trim()) {
    lines.push(`What I ate: ${input.text.trim()}`);
  } else if (input.audio) {
    lines.push("What I ate is in the voice recording.");
  } else {
    lines.push("What I ate is in the photo.");
  }
  if (input.image && !input.previous) lines.push("The photo shows the meal.");
  lines.push(
    input.mealType
      ? `Meal type: ${input.mealType}.`
      : `${hourHint(input.now ?? new Date())} Guess the meal type from it and from the food.`,
  );
  return lines.join("\n");
}

export async function analyzeMeal(ctx: CallContext, input: MealInput): Promise<MealAnswer> {
  const content: Exclude<ModelMessage["content"], string> = [
    { type: "text", text: mealText(input) },
  ];
  for (const file of [input.image, input.audio]) {
    if (file) {
      content.push({
        type: "file",
        mediaType: file.mediaType,
        data: { type: "data", data: file.data },
      });
    }
  }
  const answer = await structured(
    ctx,
    mealSchema,
    "meal",
    mealInstructions(ctx.settings.language),
    [{ role: "user", content } as ModelMessage],
  );
  return {
    ...answer,
    ...(input.mealType ? { mealType: input.mealType } : {}),
    items: answer.items.map(roundItem),
  };
}
