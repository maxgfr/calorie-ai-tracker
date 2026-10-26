/**
 * A spoken meal to text: the provider's transcription model when it has one
 * (OpenAI, Gemini, Mistral, Groq), Whisper on this device otherwise.
 */
import { browserLanguage, type LlmSettings, transcribe, transcriptionProblem } from "llm-connect";
import type { SpeechReply, SpeechRequest } from "../workers/speech";
import { aiError } from "./call";

export type VoiceEngine = "provider" | "device";

export function voiceEngine(settings: LlmSettings | null): VoiceEngine {
  return settings && !transcriptionProblem(settings) ? "provider" : "device";
}

export interface VoiceProgress {
  message: string;
  ratio?: number;
}

let worker: Worker | null = null;

function onDevice(
  samples: Float32Array,
  language: string,
  onProgress: (p: VoiceProgress) => void,
): Promise<string> {
  worker ??= new Worker(new URL("../workers/speech.ts", import.meta.url), { type: "module" });
  const w = worker;
  return new Promise((resolve, reject) => {
    w.onmessage = (e: MessageEvent<SpeechReply>) => {
      const r = e.data;
      if (r.kind === "progress") {
        onProgress({ message: "Downloading Whisper (once)…", ratio: r.ratio });
      } else if (r.kind === "loaded") {
        onProgress({ message: "Transcribing on this device…" });
      } else if (r.kind === "done") {
        resolve(r.text);
      } else {
        reject(new Error(r.message));
      }
    };
    w.onerror = (e) => reject(new Error(e.message || "The speech worker failed."));
    const request: SpeechRequest = {
      samples,
      language,
      ortBase: new URL("./ort/", document.baseURI).href,
    };
    w.postMessage(request, [samples.buffer]);
  });
}

export async function speechToText(
  settings: LlmSettings | null,
  audio: Blob,
  onProgress: (p: VoiceProgress) => void,
): Promise<string> {
  const language = settings?.language || browserLanguage();
  if (settings && voiceEngine(settings) === "provider") {
    onProgress({ message: "Transcribing with your provider…" });
    try {
      return (await transcribe(settings, audio, { language, words: false })).text.trim();
    } catch (err) {
      throw aiError(err, settings);
    }
  }
  onProgress({ message: "Reading the recording…" });
  const { decodeAudio } = await import("llm-connect/whisper");
  return (await onDevice(await decodeAudio(audio), language, onProgress)).trim();
}
