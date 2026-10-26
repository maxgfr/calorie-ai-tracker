/** Chat with a coach that sees your goals and your week. */
import { useEffect, useMemo, useRef, useState } from "react";
import { coachReply } from "../ai/coach";
import { dayKey, weekStart } from "../data/dates";
import * as db from "../data/db";
import { type ChatMessage, newId } from "../data/model";
import { streak, weekSummary } from "../data/stats";
import { Button, Icon, Notice, PageTitle, Spinner } from "./kit";
import { go } from "./router";
import { useApp } from "./state";

const STARTERS = [
  "What should I eat for dinner to hit my protein goal?",
  "How did I do this week?",
  "Give me 3 high-protein snacks under 200 kcal.",
  "Why am I always over on weekends?",
];

export function Coach({ ask }: { ask?: string | undefined }) {
  const { entries, profile, goals, settings } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const asked = useRef(false);
  const today = dayKey();

  const context = useMemo(() => {
    const start = weekStart(today);
    const week = weekSummary(entries, start, goals);
    const inWeek = entries.filter((e) => e.date >= start);
    return { profile, goals, week, today, entries: inWeek, streak: streak(entries, today) };
  }, [entries, profile, goals, today]);

  useEffect(() => {
    void db
      .chatHistory()
      .then(setMessages)
      .finally(() => setLoaded(true));
    return () => abort.current?.abort();
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow each new message and streamed word
  useEffect(() => end.current?.scrollIntoView({ block: "end" }), [messages, streaming]);

  async function send(text: string) {
    if (!settings || !text.trim() || streaming !== null) return;
    setError(null);
    const question: ChatMessage = {
      id: newId(),
      role: "user",
      text: text.trim(),
      time: Date.now(),
    };
    const history = [...messages, question];
    setMessages(history);
    setInput("");
    await db.putChat(question);
    abort.current = new AbortController();
    setStreaming("");
    try {
      const answer = await coachReply(
        { settings, signal: abort.current.signal },
        context,
        history,
        setStreaming,
      );
      const reply: ChatMessage = { id: newId(), role: "assistant", text: answer, time: Date.now() };
      await db.putChat(reply);
      setMessages((m) => [...m, reply]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setStreaming(null);
    }
  }

  // A question handed over by another view (the week's "Ask the coach").
  useEffect(() => {
    if (ask && settings && loaded && !asked.current) {
      asked.current = true;
      history.replaceState(null, "", "#/coach");
      void send(ask);
    }
  });

  if (!settings) {
    return (
      <>
        <PageTitle title="Coach" />
        <div className="card grid gap-3">
          <p>The coach needs a model. Connect one in Settings.</p>
          <div>
            <Button icon="gear" onClick={() => go({ name: "settings" })}>
              Open settings
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      <PageTitle title="Coach" subtitle="Knows your goals and this week's meals.">
        {messages.length ? (
          <Button
            variant="ghost"
            icon="trash"
            disabled={streaming !== null}
            onClick={() => void db.clearChat().then(() => setMessages([]))}
          >
            Clear
          </Button>
        ) : null}
      </PageTitle>

      <div className="flex-1 space-y-3" aria-live="polite">
        {messages.length === 0 && streaming === null ? (
          <div className="grid gap-2">
            <p className="text-sm text-stone-500 dark:text-stone-400">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chip text-left"
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {streaming !== null ? (
          streaming ? (
            <Bubble message={{ id: "live", role: "assistant", text: streaming, time: 0 }} />
          ) : (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Spinner /> Thinking…
            </div>
          )
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <div ref={end} />
      </div>

      <form
        className="sticky bottom-20 mt-4 flex gap-2 rounded-2xl border border-stone-200 bg-white/90 p-2 shadow-lg backdrop-blur sm:bottom-4 dark:border-stone-800 dark:bg-stone-900/90"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
          placeholder="Ask about your meals, goals, ideas…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Message"
        />
        {streaming !== null ? (
          <Button variant="secondary" icon="stop" onClick={() => abort.current?.abort()}>
            Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} aria-label="Send">
            <Icon name="send" className="size-4" />
          </Button>
        )}
      </form>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === "user";
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          mine
            ? "rounded-br-md bg-brand-700 text-white dark:bg-brand-600"
            : "rounded-bl-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
