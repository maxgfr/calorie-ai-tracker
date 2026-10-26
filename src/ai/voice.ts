/**
 * A spoken meal goes to the provider, never processed on the device: straight
 * to the model when it hears audio (Gemini, directly or through OpenRouter),
 * otherwise through the provider's transcription model (OpenAI, Mistral's
 * Voxtral, Groq…) and then to the model as text.
 */
import { type LlmSettings, transcribe, transcriptionProblem } from "llm-connect";
import { aiError } from "./call";
import { acceptsAudio } from "./settings";

export type VoiceRoute = "audio" | "transcribe";

/** How the recording reaches the model, or null when this model and provider take no voice. */
export function voiceRoute(
  settings: LlmSettings,
  hearsAudio = acceptsAudio(settings),
): VoiceRoute | null {
  if (hearsAudio) return "audio";
  return transcriptionProblem(settings) ? null : "transcribe";
}

export const NO_VOICE =
  "This model does not take audio and its provider has no transcription. Pick a model that hears (Gemini) or a provider that transcribes (OpenAI, Mistral, Groq) in Settings, or type the meal.";

export function voiceLabel(route: VoiceRoute | null): string {
  if (route === "audio") return "The recording goes straight to your model.";
  if (route === "transcribe")
    return "Your provider transcribes the recording, then your model reads it.";
  return NO_VOICE;
}

/**
 * The provider's transcription of the recording. The spoken language is left
 * to the provider to detect: the settings' language is the one answers are
 * written in, and Mistral refuses a language next to the word timings
 * llm-connect asks for.
 */
export async function transcribeVoice(settings: LlmSettings, audio: Blob): Promise<string> {
  try {
    return (await transcribe(settings, audio, { words: false })).text.trim();
  } catch (err) {
    throw aiError(err, settings);
  }
}

/** Rate of the WAV sent to the model: enough for speech, small to upload. */
const WAV_RATE = 16_000;

/** Any recording (WebM, MP4…) as 16 kHz mono 16-bit WAV, the audio format every API takes. */
export async function toWav(audio: Blob): Promise<Uint8Array> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(await audio.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const length = Math.max(1, Math.ceil(decoded.duration * WAV_RATE));
  const offline = new OfflineAudioContext(1, length, WAV_RATE);
  const src = offline.createBufferSource();
  src.buffer = decoded;
  src.connect(offline.destination);
  src.start();
  return encodeWav((await offline.startRendering()).getChannelData(0), WAV_RATE);
}

export function encodeWav(samples: Float32Array, rate: number): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buf);
}
