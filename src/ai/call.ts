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

/** A readable error for any failed call, with a hint for key and network failures. */
export function aiError(err: unknown, settings: LlmSettings): AiError {
  if (err instanceof AiError) return err;
  const e = describeError(err, settings.apiKey);
  const hint =
    e.code === "auth"
      ? " Check the key in Settings."
      : e.code === "auth-or-network"
        ? " The key was refused, or the network or the provider's CORS policy blocked the request."
        : "";
  return new AiError(`${e.message || "The model call failed."}${hint}`, e.retryable);
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
