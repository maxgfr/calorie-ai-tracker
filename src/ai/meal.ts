/** A meal from words, a photo or both: foods, portions, calories and macros. */
import { type ModelMessage, streamText } from "ai";
import { callOptions, languageName, loadModel, WEB_SEARCH_TOOL, webSearchTools } from "llm-connect";
import type { MealType } from "../data/model";
import { roundItem } from "../data/stats";
import { type CallContext, canSearch, preflight, structured } from "./call";
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

/** What the search pass answers when the meal names nothing worth looking up. */
const NOTHING = "NONE";

/** Web searches per meal, at most (Anthropic bills each one). */
const SEARCHES = 3;

export const LOOKUP_INSTRUCTIONS = [
  "You look up nutrition facts on the web for a calorie tracker.",
  "If the meal names a brand, a packaged product, a chain restaurant or one of its dishes, search the web for its official nutrition facts: calories, protein, carbs, fat, and the serving size they are for.",
  "Answer with those facts only, briefly, each with the URL of the page it comes from. If a search finds nothing reliable, say so.",
  `If the meal names only generic foods (eggs, rice, an apple, a homemade dish), do not search: answer exactly ${NOTHING}.`,
].join("\n");

/**
 * The official nutrition facts of the branded or restaurant foods the meal
 * names, from the provider's web search; null when there is nothing to look
 * up, the model cannot search, or the search failed (the estimate then goes on
 * from food tables).
 */
export async function lookUpMeal(
  ctx: CallContext,
  messages: ModelMessage[],
  onSearch?: () => void,
): Promise<string | null> {
  const capabilities = preflight(ctx, messages);
  if (!canSearch(ctx.settings, capabilities)) return null;
  let text = "";
  try {
    const result = streamText({
      model: ctx.model ?? (await loadModel(ctx.settings)),
      instructions: LOOKUP_INSTRUCTIONS,
      messages,
      tools: await webSearchTools(capabilities.webSearch, { maxUses: SEARCHES }),
      maxRetries: 1,
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
      ...callOptions(ctx.settings, { capabilities }),
      // A failed search only means no facts from the web: the estimate goes on.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === "tool-call" && part.toolName === WEB_SEARCH_TOOL) onSearch?.();
      else if (part.type === "text-start" && text && !/\s$/.test(text)) text += "\n";
      else if (part.type === "text-delta") text += part.text;
      else if (part.type === "error") return null;
    }
  } catch {
    if (ctx.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    return null;
  }
  if (ctx.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  const found = text.trim();
  return !found || found.replace(/\W/g, "").toUpperCase() === NOTHING ? null : found;
}

export function mealInstructions(language: string | undefined): string {
  return [
    "You are a meticulous nutritionist estimating what someone ate, for a calorie tracker.",
    "List each distinct food or drink as its own item, with a realistic portion when none is given (say which in notes).",
    "Give calories and macros (protein, carbs, fat in grams) for the portion, from standard food composition tables (USDA, CIQUAL).",
    "When nutrition facts found on the web are given for a product, use them for it, scaled to the portion, and name the source in notes.",
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

/**
 * Estimates the meal. With a model that has web search, a first pass looks up
 * the official facts of the branded or restaurant foods it names; `onSearch`
 * fires when that pass searches.
 */
export async function analyzeMeal(
  ctx: CallContext,
  input: MealInput,
  onSearch?: () => void,
): Promise<MealAnswer> {
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
  const found = await lookUpMeal(ctx, [{ role: "user", content } as ModelMessage], onSearch);
  if (found) content.push({ type: "text", text: `Nutrition facts found on the web:\n${found}` });
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
