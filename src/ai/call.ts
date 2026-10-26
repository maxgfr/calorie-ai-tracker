/**
 * Every model call goes through llm-connect: the model from the saved
 * settings, the provider options for it, a check of what it accepts before any
 * request, and errors described without the key.
 */
import { generateText, type LanguageModel, type ModelMessage, Output } from "ai";
import {
  type Capabilities,
  callOptions,
  callProblem,
  describeError,
  type LlmErrorCode,
  type LlmSettings,
  loadModel,
} from "llm-connect";
import type { z } from "zod";
import { capabilitiesOf } from "./settings";

export interface CallContext {
  settings: LlmSettings;
  signal?: AbortSignal;
  /** Replaces the model the settings point to (tests). */
  model?: LanguageModel;
  /** Replaces what the catalog says the model takes (tests). */
  capabilities?: Capabilities;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
  }
}

/** What each kind of failure means for the user, ahead of the provider's own words. */
const FAILURES: Record<LlmErrorCode, string> = {
  auth: "The provider refused the key. Check it in Settings.",
  "auth-or-network":
    "No answer from the provider: the key was refused, or the network or the provider's CORS policy blocked the request.",
  "rate-limit": "Too many requests for now: wait a moment.",
  overloaded: "The provider is overloaded right now.",
  "context-length": "This is more than the model can read at once.",
  "invalid-request": "The provider refused the request.",
  "not-found": "The provider does not know this model. Pick another one in Settings.",
  server: "The provider ran into an error.",
  unknown: "The model call failed.",
};

/** A readable error for any failed call: what it means, then the provider's message. */
export function aiError(err: unknown, settings: LlmSettings): AiError {
  if (err instanceof AiError) return err;
  const e = describeError(err, settings.apiKey);
  const detail = e.message.trim();
  return new AiError(
    detail ? `${FAILURES[e.code]} (${detail.replace(/\.$/, "")}.)` : FAILURES[e.code],
    e.retryable,
  );
}

export function hasImage(messages: ModelMessage[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some(
        (p) => p.type === "image" || (p.type === "file" && p.mediaType.startsWith("image")),
      ),
  );
}

/** Checks the call against the model before any request; returns its capabilities. */
export function preflight(ctx: CallContext, messages: ModelMessage[]): Capabilities {
  const capabilities = ctx.capabilities ?? capabilitiesOf(ctx.settings);
  if (hasImage(messages) && !capabilities.vision) {
    throw new AiError(
      "This model does not accept photos. Pick a vision model in Settings (GPT, Claude, Gemini…), or describe the meal in words.",
    );
  }
  const problem = callProblem(ctx.settings, { messages }, capabilities);
  if (problem) throw new AiError(problem.message);
  return capabilities;
}

/** One structured answer, checked against `schema`. */
export async function structured<S extends z.ZodType>(
  ctx: CallContext,
  schema: S,
  name: string,
  instructions: string,
  messages: ModelMessage[],
): Promise<z.infer<S>> {
  const capabilities = preflight(ctx, messages);
  try {
    const res = await generateText({
      model: ctx.model ?? (await loadModel(ctx.settings)),
      instructions,
      messages,
      output: Output.object({ schema, name }),
      maxRetries: 1,
      ...(ctx.signal ? { abortSignal: ctx.signal } : {}),
      ...callOptions(ctx.settings, { capabilities }),
    });
    return res.output as z.infer<S>;
  } catch (err) {
    if (ctx.signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    throw aiError(err, ctx.settings);
  }
}
