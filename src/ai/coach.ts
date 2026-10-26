/** The coach: a conversation grounded in the profile, the goals and the week's meals. */
import { type ModelMessage, streamText } from "ai";
import {
  callOptions,
  languageName,
  loadModel,
  providerKindOf,
  type StopReason,
  stopReasonOf,
} from "llm-connect";
import { formatDay } from "../data/dates";
import {
  ACTIVITIES,
  type AnswerEnd,
  type ChatMessage,
  type Entry,
  type Goals,
  OBJECTIVES,
  type Profile,
} from "../data/model";
import { entryTotals, type WeekSummary } from "../data/stats";
import { AiError, aiError, type CallContext, preflight } from "./call";

/** Earlier turns sent with each question, at most. */
const HISTORY = 20;

export interface CoachContext {
  profile: Profile;
  goals: Goals;
  week: WeekSummary;
  today: string;
  /** The week's meals. */
  entries: Entry[];
  streak: number;
}

const r = Math.round;

export function coachInstructions(c: CoachContext, language: string | undefined): string {
  const p = c.profile;
  const days = c.week.days.map((d) =>
    d.meals === 0
      ? `- ${d.date} (${formatDay(d.date, "short")}): nothing logged`
      : `- ${d.date} (${formatDay(d.date, "short")}): ${r(d.kcal)} kcal, P ${r(d.protein)} g, C ${r(d.carbs)} g, F ${r(d.fat)} g, ${d.meals} meals${d.onTarget ? ", on target" : ""}`,
  );
  const meals = c.entries.map((e) => {
    const t = entryTotals(e);
    return `- ${e.date} ${e.mealType}: ${e.title} — ${r(t.kcal)} kcal (${e.items.map((i) => i.name).join(", ")})`;
  });
  return [
    "You are a warm, practical nutrition coach inside a calorie tracker. Be concise: short paragraphs or bullet points.",
    "Ground every answer in the data below; cite numbers. Suggest concrete foods and swaps. Never shame.",
    "You are not a doctor: for medical conditions, eating disorders or pregnancy, recommend a professional.",
    `Answer in ${languageName(language)}.`,
    "",
    `Today is ${c.today}.`,
    `Profile: ${p.sex}, ${p.age} y, ${p.heightCm} cm, ${p.weightKg} kg, activity ${ACTIVITIES[p.activity].label}, objective ${OBJECTIVES[p.objective]}.${p.notes.trim() ? ` Notes: ${p.notes.trim()}` : ""}`,
    `Daily goals: ${c.goals.kcal} kcal, protein ${c.goals.protein} g, carbs ${c.goals.carbs} g, fat ${c.goals.fat} g.`,
    `Logging streak: ${c.streak} days.`,
    "This week, day by day:",
    ...days,
    `Week average over ${c.week.logged} logged days: ${r(c.week.average.kcal)} kcal, P ${r(c.week.average.protein)} g. Days on target: ${c.week.onTarget}.`,
    "Meals this week:",
    ...(meals.length ? meals : ["- none yet"]),
  ].join("\n");
}

export function toMessages(history: ChatMessage[]): ModelMessage[] {
  return history.slice(-HISTORY).map((m) => ({ role: m.role, content: m.text }));
}

export interface CoachAnswer {
  text: string;
  /** Set when the answer did not end on its own. */
  end?: AnswerEnd;
}

const UNFINISHED: Partial<Record<StopReason, AnswerEnd>> = {
  length: "length",
  truncated: "truncated",
  refusal: "refusal",
  "content-filter": "content-filter",
};

/**
 * Streams the coach's answer to the last user message; resolves with the whole
 * text and how it ended. Stopped halfway, the answer keeps what came.
 */
export async function coachReply(
  ctx: CallContext,
  context: CoachContext,
  history: ChatMessage[],
  onText: (text: string) => void,
): Promise<CoachAnswer> {
  const messages = toMessages(history);
  const capabilities = preflight(ctx, messages);
  let text = "";
  let failure: unknown = null;
  // A stream that closes without a finish event was cut.
  let end: AnswerEnd | undefined = "truncated";
  try {
    const result = streamText({
      model: ctx.model ?? (await loadModel(ctx.settings)),
      instructions: coachInstructions(context, ctx.settings.language),
      messages,
      maxRetries: 1,
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
      ...callOptions(ctx.settings, { capabilities }),
      // Errors come through the stream below; the default would also log them.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        text += part.text;
        onText(text);
      } else if (part.type === "finish") {
        const stop = stopReasonOf(
          providerKindOf(ctx.settings),
          part.finishReason,
          part.rawFinishReason,
        );
        end = UNFINISHED[stop];
      } else if (part.type === "error") {
        failure = part.error;
      }
    }
  } catch (err) {
    failure = err;
  }
  if (ctx.signal?.aborted) {
    if (text.trim()) return { text, end: "stopped" };
    throw new DOMException("Cancelled", "AbortError");
  }
  if (failure) throw aiError(failure, ctx.settings);
  if (!text.trim()) {
    throw new AiError(
      end === "refusal" || end === "content-filter"
        ? "The model declined to answer. Try asking in other words."
        : "The model sent an empty answer.",
      true,
    );
  }
  return end ? { text, end } : { text };
}
