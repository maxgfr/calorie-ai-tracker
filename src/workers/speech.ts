/**
 * Whisper on this device, off the page's thread (llm-connect/whisper over
 * transformers.js). The model is downloaded once from Hugging Face, then served
 * from the browser's cache; onnxruntime's WebAssembly comes from this site.
 */
import { env } from "@huggingface/transformers";
import { loadWhisper, recommendedWhisperPreset, type Whisper } from "llm-connect/whisper";

export interface SpeechRequest {
  samples: Float32Array;
  /** Absolute URL of the folder holding onnxruntime's files. */
  ortBase: string;
  language?: string;
}

export type SpeechReply =
  | { kind: "progress"; ratio: number }
  | { kind: "loaded" }
  | { kind: "done"; text: string }
  | { kind: "error"; message: string };

let whisper: Promise<Whisper> | null = null;
const post = (reply: SpeechReply) => self.postMessage(reply);

function load(ortBase: string): Promise<Whisper> {
  const wasm = env.backends.onnx.wasm as { wasmPaths?: unknown } | undefined;
  if (wasm) {
    wasm.wasmPaths = {
      mjs: `${ortBase}ort-wasm-simd-threaded.asyncify.mjs`,
      wasm: `${ortBase}ort-wasm-simd-threaded.asyncify.wasm`,
    };
  }
  return recommendedWhisperPreset().then((preset) =>
    loadWhisper({ preset, onProgress: ({ ratio }) => post({ kind: "progress", ratio }) }),
  );
}

self.onmessage = async (e: MessageEvent<SpeechRequest>) => {
  const { samples, ortBase, language } = e.data;
  try {
    if (!whisper) {
      whisper = load(ortBase);
      whisper.catch(() => {
        whisper = null;
      });
    }
    const w = await whisper;
    post({ kind: "loaded" });
    const t = await w.transcribe(samples, language ? { language } : {});
    post({ kind: "done", text: t.text });
  } catch (err) {
    post({ kind: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
