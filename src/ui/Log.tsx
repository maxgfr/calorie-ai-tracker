/** Log a meal by text, photo or voice: the AI estimates it, you check it, it is saved. */
import { useEffect, useRef, useState } from "react";
import { AiError } from "../ai/call";
import { preparePhoto } from "../ai/image";
import { analyzeMeal, type MealInput, type ModelImage } from "../ai/meal";
import type { MealAnswer } from "../ai/schema";
import { NO_VOICE, toWav, transcribeVoice, voiceLabel, voiceRoute } from "../ai/voice";
import { dayKey } from "../data/dates";
import { type EntrySource, MEAL_TYPES, type MealType, newId } from "../data/model";
import { Button, Icon, type IconName, Notice, PageTitle } from "./kit";
import { type Draft, MealEditor } from "./MealEditor";
import { go, href } from "./router";
import { useApp } from "./state";

type Mode = "text" | "photo" | "voice";

const MODES: { id: Mode; label: string; icon: IconName }[] = [
  { id: "text", label: "Describe", icon: "text" },
  { id: "photo", label: "Photo", icon: "camera" },
  { id: "voice", label: "Voice", icon: "mic" },
];

const EXAMPLES = [
  "2 scrambled eggs, a slice of buttered sourdough and a latte",
  "Chicken caesar salad and a can of coke",
  "A bowl of spaghetti bolognese with parmesan",
];

function useRecorder() {
  const [recording, setRecording] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const done = useRef<((b: Blob) => void) | null>(null);

  useEffect(
    () => () => {
      for (const t of rec.current?.stream.getTracks() ?? []) t.stop();
    },
    [],
  );

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      for (const t of stream.getTracks()) t.stop();
      setRecording(false);
      done.current?.(new Blob(chunks.current, { type: r.mimeType }));
    };
    rec.current = r;
    r.start();
    setRecording(true);
  }

  function stop(): Promise<Blob> {
    return new Promise((resolve) => {
      done.current = resolve;
      rec.current?.stop();
    });
  }

  return { recording, start, stop };
}

export function Log({ date }: { date?: string | undefined }) {
  const { settings, saveEntry } = useApp();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [mealType, setMealType] = useState<MealType | "auto">("auto");
  const [photo, setPhoto] = useState<{ model: ModelImage; thumbnail: Blob; url: string } | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<MealAnswer | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [source, setSource] = useState<EntrySource>("text");
  const recorder = useRecorder();
  const fileInput = useRef<HTMLInputElement>(null);
  const day = date ?? dayKey();

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  async function run(input: MealInput, from: EntrySource) {
    if (!settings) return;
    setError(null);
    setBusy(input.previous ? "Fixing the estimate…" : "Estimating calories…");
    try {
      const a = await analyzeMeal(
        { settings },
        { ...input, ...(mealType !== "auto" ? { mealType } : {}) },
      );
      setAnswer(a);
      setSource(from);
      if (a.heard.trim() && input.audio) setText(a.heard.trim());
      setDraft({
        title: a.title,
        mealType: a.mealType,
        date: draft?.date ?? day,
        items: a.items,
        notes: a.notes,
        confidence: a.confidence,
      });
    } catch (err) {
      setError(err instanceof AiError || err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const p = await preparePhoto(file);
      setPhoto({ ...p, url: URL.createObjectURL(p.thumbnail) });
    } catch {
      setError("This image could not be read. Try a JPEG or PNG.");
    }
  }

  async function toggleVoice() {
    setError(null);
    if (!recorder.recording) {
      try {
        await recorder.start();
      } catch {
        setError("The microphone is not available. Allow it in the browser, or type the meal.");
      }
      return;
    }
    const audio = await recorder.stop();
    if (!settings) return;
    const route = voiceRoute(settings);
    try {
      if (route === "audio") {
        setBusy("Preparing the recording…");
        await run({ audio: { data: await toWav(audio), mediaType: "audio/wav" } }, "voice");
      } else if (route === "transcribe") {
        setBusy("Transcribing with your provider…");
        const said = await transcribeVoice(settings, audio);
        if (!said)
          throw new Error("Nothing was heard. Try again a little closer to the microphone.");
        setText(said);
        await run({ text: said }, "voice");
      } else {
        throw new Error(NO_VOICE);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function save(d: Draft) {
    setBusy("Saving…");
    const now = Date.now();
    await saveEntry({
      id: newId(),
      date: d.date,
      time: d.date === dayKey() ? now : new Date(`${d.date}T12:00:00`).getTime() + (now % 1000),
      mealType: d.mealType,
      title: d.title.trim(),
      items: d.items,
      source,
      ...(text.trim() ? { input: text.trim() } : {}),
      ...(d.confidence ? { confidence: d.confidence } : {}),
      ...(d.notes ? { notes: d.notes } : {}),
      ...(source === "photo" && photo ? { photo: photo.thumbnail } : {}),
    });
    go({ name: "day", ...(d.date !== dayKey() ? { date: d.date } : {}) }, { replace: true });
  }

  if (!settings) {
    return (
      <>
        <PageTitle title="Log a meal" />
        <div className="card grid gap-3">
          <p className="font-medium">Connect a model first.</p>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            The estimates come from an AI model of your choice: OpenAI, Anthropic, Google, Mistral,
            or a local one with Ollama. Your key stays encrypted in this browser and is only sent to
            that provider.
          </p>
          <div>
            <Button onClick={() => go({ name: "settings" })} icon="gear">
              Open settings
            </Button>
          </div>
          <p className="text-sm text-stone-500">
            Or{" "}
            <button
              type="button"
              className="font-medium text-brand-700 underline dark:text-brand-400"
              onClick={() =>
                setDraft({
                  title: "",
                  mealType: "snack",
                  date: day,
                  items: [{ name: "", quantity: "", kcal: 0, protein: 0, carbs: 0, fat: 0 }],
                })
              }
            >
              enter it by hand
            </button>
            .
          </p>
        </div>
        {draft ? (
          <div className="mt-4">
            <MealEditor
              draft={draft}
              onChange={setDraft}
              onSave={(d) => void save(d)}
              saving={busy === "Saving…"}
            />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageTitle
        title="Log a meal"
        subtitle={day === dayKey() ? "Describe it, snap it or say it." : `For ${day}`}
      />

      {draft ? (
        <MealEditor
          draft={draft}
          onChange={setDraft}
          onSave={(d) => void save(d)}
          saving={busy === "Saving…"}
          correcting={busy === "Fixing the estimate…"}
          onCorrect={
            answer
              ? (correction) =>
                  void run(
                    {
                      previous: toAnswer(draft, answer),
                      correction,
                      ...(photo && source === "photo" ? { image: photo.model } : {}),
                    },
                    source,
                  )
              : undefined
          }
          onCancel={() => {
            setDraft(null);
            setAnswer(null);
          }}
        />
      ) : (
        <div className="card grid gap-4">
          <div
            className="grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800"
            role="tablist"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => setMode(m.id)}
                className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition ${
                  mode === m.id
                    ? "bg-white shadow-sm dark:bg-stone-950"
                    : "text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
                }`}
              >
                <Icon name={m.icon} className="size-4" />
                {m.label}
              </button>
            ))}
          </div>

          {mode === "text" ? (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) void run({ text }, "text");
              }}
            >
              <textarea
                className="input min-h-28 resize-y text-base"
                placeholder="What did you eat? Quantities help: “150 g of grilled salmon, rice, a glass of white wine”"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
                    e.currentTarget.form?.requestSubmit();
                }}
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button key={ex} type="button" className="chip" onClick={() => setText(ex)}>
                    {ex}
                  </button>
                ))}
              </div>
              <MealTypePicker value={mealType} onChange={setMealType} />
              <Button type="submit" icon="spark" busy={!!busy} disabled={!text.trim()}>
                {busy ?? "Estimate"}
              </Button>
            </form>
          ) : null}

          {mode === "photo" ? (
            <div className="grid gap-3">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => void pickPhoto(e.target.files?.[0])}
              />
              {photo ? (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="overflow-hidden rounded-xl"
                  aria-label="Choose another photo"
                >
                  <img src={photo.url} alt="Your meal" className="max-h-72 w-full object-cover" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="grid h-44 place-items-center rounded-xl border-2 border-dashed border-stone-300 text-stone-500 transition hover:border-brand-500 hover:text-brand-700 dark:border-stone-700"
                >
                  <span className="grid justify-items-center gap-2">
                    <Icon name="camera" className="size-8" />
                    <span className="text-sm font-medium">
                      Take or choose a photo of your plate
                    </span>
                  </span>
                </button>
              )}
              <input
                className="input"
                placeholder="Optional details: “half the fries”, “cooked in olive oil”"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <MealTypePicker value={mealType} onChange={setMealType} />
              <Button
                icon="spark"
                busy={!!busy}
                disabled={!photo}
                onClick={() => photo && void run({ text, image: photo.model }, "photo")}
              >
                {busy ?? "Estimate from the photo"}
              </Button>
            </div>
          ) : null}

          {mode === "voice" ? (
            <div className="grid justify-items-center gap-4 py-4">
              <button
                type="button"
                onClick={() => void toggleVoice()}
                disabled={!!busy || voiceRoute(settings) === null}
                className={`relative grid size-24 place-items-center rounded-full text-white shadow-lg transition disabled:opacity-50 ${
                  recorder.recording
                    ? "recording bg-rose-600"
                    : "bg-brand-700 hover:bg-brand-800 dark:bg-brand-500 dark:text-stone-950"
                }`}
                aria-label={recorder.recording ? "Stop and estimate" : "Start recording"}
              >
                <Icon name={recorder.recording ? "stop" : "mic"} className="relative size-9" />
              </button>
              <p
                className="text-center text-sm text-stone-500 dark:text-stone-400"
                aria-live="polite"
              >
                {busy ??
                  (recorder.recording
                    ? "Listening… tap to stop."
                    : "Tap and say what you ate, with quantities if you know them.")}
              </p>
              <p className="text-center text-xs text-stone-400">
                {voiceLabel(voiceRoute(settings))}
              </p>
              <MealTypePicker value={mealType} onChange={setMealType} />
            </div>
          ) : null}
        </div>
      )}

      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}

      <p className="mt-6 text-center text-xs text-stone-400">
        Estimates are approximate.{" "}
        <a className="underline" href={href({ name: "day" })}>
          Back to today
        </a>
      </p>
    </>
  );
}

/** The meal as the user left it, for the model to correct. */
export function toAnswer(draft: Draft, fallback?: MealAnswer): MealAnswer {
  return {
    title: draft.title,
    mealType: draft.mealType,
    items: draft.items,
    confidence: draft.confidence ?? fallback?.confidence ?? "medium",
    notes: draft.notes ?? "",
    heard: fallback?.heard ?? "",
  };
}

function MealTypePicker({
  value,
  onChange,
}: {
  value: MealType | "auto";
  onChange: (v: MealType | "auto") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="label mb-0">Meal</span>
      {(["auto", ...MEAL_TYPES] as const).map((t) => (
        <button
          key={t}
          type="button"
          className="chip"
          aria-pressed={value === t}
          onClick={() => onChange(t)}
        >
          {t === "auto" ? "Auto" : `${t[0]?.toUpperCase()}${t.slice(1)}`}
        </button>
      ))}
    </div>
  );
}
