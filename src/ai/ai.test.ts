import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { type LlmSettings, resolveCapabilities } from "llm-connect";
import { baselineGoals } from "../data/energy";
import { DEFAULT_PROFILE } from "../data/model";
import { AiError, aiError } from "./call";
import { coachInstructions, coachReply } from "./coach";
import { suggestGoals } from "./goals";
import { analyzeMeal, mealText } from "./meal";
import { encodeWav, voiceRoute } from "./voice";

const settings: LlmSettings = {
  apiKey: "sk-test-123456",
  model: "gpt-test",
  providerId: "openai",
  providerNpm: "@ai-sdk/openai",
  language: "fr",
};

function answering(json: unknown) {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 10, text: 10, reasoning: 0 },
      },
      warnings: [],
    },
  });
}

const meal = {
  title: "Œufs brouillés et tartine",
  mealType: "breakfast",
  items: [
    {
      name: "Œufs brouillés",
      quantity: "2 œufs",
      kcal: 182.4,
      protein: 12.56,
      carbs: 1,
      fat: 13.9,
    },
    { name: "Tartine beurrée", quantity: "1 tranche", kcal: 160, protein: 4, carbs: 20, fat: 7 },
  ],
  confidence: "medium",
  notes: "Beurre de cuisson compté.",
  heard: "",
};

const vision = resolveCapabilities({
  kind: "openai",
  modelId: "gpt-test",
  override: { vision: true },
});
const blind = resolveCapabilities({
  kind: "openai",
  modelId: "gpt-test",
  override: { vision: false },
});

describe("analyzeMeal", () => {
  test("returns the structured meal, rounded, in the asked language", async () => {
    const model = answering(meal);
    const out = await analyzeMeal(
      { settings, model, capabilities: vision },
      { text: "2 oeufs et une tartine" },
    );
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ kcal: 182, protein: 12.6, fat: 13.9 });
    const call = model.doGenerateCalls[0];
    expect(JSON.stringify(call?.prompt)).toContain("French");
    expect(call?.responseFormat?.type).toBe("json");
  });

  test("keeps the meal type the user picked", async () => {
    const out = await analyzeMeal(
      { settings, model: answering(meal), capabilities: vision },
      { text: "x", mealType: "dinner" },
    );
    expect(out.mealType).toBe("dinner");
  });

  test("sends the photo as an image file part", async () => {
    const model = answering(meal);
    await analyzeMeal(
      { settings, model, capabilities: vision },
      { image: { data: new Uint8Array([255, 216, 255]), mediaType: "image/jpeg" } },
    );
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain("image/jpeg");
  });

  test("sends a voice recording to the model as an audio file part", async () => {
    const model = answering({ ...meal, heard: "deux oeufs et une tartine" });
    const out = await analyzeMeal(
      { settings, model, capabilities: { ...vision, audio: true } },
      { audio: { data: encodeWav(new Float32Array(160), 16_000), mediaType: "audio/wav" } },
    );
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain("audio/wav");
    expect(prompt).toContain("voice recording");
    expect(out.heard).toBe("deux oeufs et une tartine");
  });

  test("refuses a recording for a model that does not hear, before any request", async () => {
    const model = answering(meal);
    const run = analyzeMeal(
      { settings, model, capabilities: vision },
      { audio: { data: encodeWav(new Float32Array(160), 16_000), mediaType: "audio/wav" } },
    );
    await expect(run).rejects.toBeInstanceOf(AiError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("refuses a photo for a model without vision, before any request", async () => {
    const model = answering(meal);
    const run = analyzeMeal(
      { settings, model, capabilities: blind },
      { image: { data: new Uint8Array([1]), mediaType: "image/jpeg" } },
    );
    await expect(run).rejects.toBeInstanceOf(AiError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  test("rejects an answer that does not match the schema", async () => {
    const run = analyzeMeal(
      { settings, model: answering({ title: "x", items: [] }), capabilities: vision },
      { text: "x" },
    );
    await expect(run).rejects.toBeInstanceOf(AiError);
  });

  test("a correction carries the previous estimate", () => {
    const text = mealText({ previous: meal as never, correction: "double portion" });
    expect(text).toContain("double portion");
    expect(text).toContain("Tartine beurrée");
  });
});

describe("suggestGoals", () => {
  test("returns rounded goals anchored on the baseline", async () => {
    const model = answering({ kcal: 1899.6, protein: 120.4, carbs: 200, fat: 60, rationale: "ok" });
    const baseline = baselineGoals(DEFAULT_PROFILE);
    const out = await suggestGoals(
      { settings, model, capabilities: vision },
      DEFAULT_PROFILE,
      baseline,
    );
    expect(out).toMatchObject({ kcal: 1900, protein: 120 });
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(`${baseline.kcal} kcal`);
  });
});

describe("coach", () => {
  const context = {
    profile: DEFAULT_PROFILE,
    goals: { kcal: 2000, protein: 100, carbs: 250, fat: 70 },
    week: {
      days: [],
      average: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      logged: 0,
      onTarget: 0,
      total: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    },
    today: "2026-10-26",
    entries: [],
    streak: 0,
  };

  test("instructions carry the goals and the language", () => {
    const s = coachInstructions(context, "fr");
    expect(s).toContain("2000 kcal");
    expect(s).toContain("French");
  });

  /** A model streaming `words`, then finishing for `finish` (none: the stream is cut). */
  function streaming(words: string[], finish?: "stop" | "length", signal?: AbortController) {
    return new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          async start(c) {
            c.enqueue({ type: "text-start", id: "1" });
            for (const delta of words) c.enqueue({ type: "text-delta", id: "1", delta });
            if (signal) {
              // The user stops once the first words are on screen.
              setTimeout(() => signal.abort(), 20);
              return;
            }
            c.enqueue({ type: "text-end", id: "1" });
            if (finish) {
              c.enqueue({
                type: "finish",
                finishReason: { unified: finish, raw: finish },
                usage: {
                  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                  outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
              });
            }
            c.close();
          },
        }),
      }),
    });
  }
  const question = [{ id: "q", role: "user" as const, text: "Une idée ?", time: 0 }];

  test("streams the answer", async () => {
    const model = streaming(["Mange ", "des lentilles."], "stop");
    const seen: string[] = [];
    const answer = await coachReply(
      { settings, model, capabilities: vision },
      context,
      question,
      (t) => seen.push(t),
    );
    expect(answer).toEqual({ text: "Mange des lentilles." });
    expect(seen.at(-1)).toBe(answer.text);
  });

  test("says when the answer was cut, at the length limit or by a closed stream", async () => {
    const at = (model: MockLanguageModelV4) =>
      coachReply({ settings, model, capabilities: vision }, context, question, () => {});
    expect(await at(streaming(["Mange "], "length"))).toEqual({ text: "Mange ", end: "length" });
    expect(await at(streaming(["Mange "]))).toEqual({ text: "Mange ", end: "truncated" });
  });

  test("stopped halfway, keeps what came", async () => {
    const stop = new AbortController();
    const answer = await coachReply(
      {
        settings,
        model: streaming(["Mange "], "stop", stop),
        capabilities: vision,
        signal: stop.signal,
      },
      context,
      question,
      () => {},
    );
    expect(answer).toEqual({ text: "Mange ", end: "stopped" });
  });
});

describe("errors", () => {
  test("say what a failure means, then the provider's words, never the key", () => {
    const limited = Object.assign(new Error("Slow down sk-test-123456"), {
      name: "AI_APICallError",
      statusCode: 429,
      isRetryable: true,
    });
    const e = aiError(limited, settings);
    expect(e.message).toStartWith("Too many requests for now");
    expect(e.message).not.toContain("sk-test-123456");
    expect(e.retryable).toBe(true);
  });
});

describe("voice", () => {
  test("goes straight to a model that hears, else through the provider's transcription", () => {
    expect(voiceRoute(settings, true)).toBe("audio");
    expect(voiceRoute(settings, false)).toBe("transcribe");
    const claude = {
      ...settings,
      providerId: "anthropic",
      providerNpm: "@ai-sdk/anthropic",
      model: "claude-sonnet-5-5",
    };
    expect(voiceRoute(claude, false)).toBeNull();
    expect(voiceRoute(claude, true)).toBe("audio");
  });

  test("encodes 16-bit mono PCM WAV", () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16_000);
    const v = new DataView(wav.buffer);
    expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(wav.slice(8, 12))).toBe("WAVE");
    expect(v.getUint32(24, true)).toBe(16_000);
    expect(wav.length).toBe(44 + 6);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32768);
  });
});
