/** The coach: a conversation grounded in the profile, the goals and the week's meals. */
import { type ModelMessage, streamText } from "ai";
import {
  callOptions,
  languageName,
  loadModel,
  providerKindOf,
  type StopReason,
  stopReasonOf,
  WEB_SEARCH_TOOL,
  webSearchTools,
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
  type Source,
} from "../data/model";
import { entryTotals, type WeekSummary } from "../data/stats";
import { AiError, aiError, type CallContext, canSearch, preflight } from "./call";

/** Earlier turns sent with each question, at most. */
const HISTORY = 20;

/** Web searches per answer, at most (Anthropic bills each one). */
const SEARCHES = 3;

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

export function coachInstructions(
  c: CoachContext,
  language: string | undefined,
  webSearch = false,
): string {
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
    ...(webSearch
      ? [
          "You can search the web. Search when the question needs facts the data below does not hold: a product's or a restaurant dish's nutrition, a food's values you are unsure of, recent guidelines or research. Do not search for what the data answers.",
          "When you use what a search found, cite the pages as Markdown links.",
        ]
      : []),
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
  /** The pages a web search brought, when the model searched. */
  sources?: Source[];
}

export interface CoachProgress {
  /** The answer so far. */
  onText: (text: string) => void;
  /** The model started a web search. */
  onSearch?: () => void;
}

const UNFINISHED: Partial<Record<StopReason, AnswerEnd>> = {
  length: "length",
  truncated: "truncated",
  refusal: "refusal",
  "content-filter": "content-filter",
};

/**
 * Streams the coach's answer to the last user message; resolves with the whole
 * text, how it ended and the pages it searched. Stopped halfway, the answer
 * keeps what came. The model searches the web when it has the provider's search.
 */
export async function coachReply(
  ctx: CallContext,
  context: CoachContext,
  history: ChatMessage[],
  progress: CoachProgress | ((text: string) => void),
): Promise<CoachAnswer> {
  const { onText, onSearch } = typeof progress === "function" ? { onText: progress } : progress;
  const messages = toMessages(history);
  const capabilities = preflight(ctx, messages);
  const search = canSearch(ctx.settings, capabilities);
  const sources = new Map<string, Source>();
  let text = "";
  let failure: unknown = null;
  // A stream that closes without a finish event was cut.
  let end: AnswerEnd | undefined = "truncated";
  try {
    const result = streamText({
      model: ctx.model ?? (await loadModel(ctx.settings)),
      instructions: coachInstructions(context, ctx.settings.language, search),
      messages,
      ...(search
        ? { tools: await webSearchTools(capabilities.webSearch, { maxUses: SEARCHES }) }
        : {}),
      maxRetries: 1,
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
      ...callOptions(ctx.settings, { capabilities }),
      // Errors come through the stream below; the default would also log them.
      onError: () => {},
    });
    for await (const part of result.fullStream) {
      if (part.type === "text-start") {
        // Text around a search comes in separate blocks: keep them apart.
        if (text && !/\s$/.test(text)) text += "\n\n";
      } else if (part.type === "text-delta") {
        text += part.text;
        onText(text);
      } else if (part.type === "tool-call" && part.toolName === WEB_SEARCH_TOOL) {
        onSearch?.();
      } else if (part.type === "source" && part.sourceType === "url") {
        if (!sources.has(part.url)) {
          sources.set(
            part.url,
            part.title ? { url: part.url, title: part.title } : { url: part.url },
          );
        }
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
  const found = sources.size ? { sources: [...sources.values()] } : {};
  if (ctx.signal?.aborted) {
    if (text.trim()) return { text, end: "stopped", ...found };
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
  return { text, ...(end ? { end } : {}), ...found };
}
