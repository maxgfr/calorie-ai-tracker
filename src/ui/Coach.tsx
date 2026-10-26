/** Chat with a coach that sees your goals and your week. */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { AiError } from "../ai/call";
import { coachReply } from "../ai/coach";
import { dayKey, weekStart } from "../data/dates";
import * as db from "../data/db";
import { type AnswerEnd, type ChatMessage, newId } from "../data/model";
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

/** Shown under an answer that did not end on its own. */
const END_NOTES: Record<AnswerEnd, string> = {
  stopped: "Stopped.",
  length: "Cut off at the model's length limit: ask it to go on.",
  truncated: "Cut off: the connection closed before the end.",
  refusal: "The model declined to go further.",
  "content-filter": "Cut off by the provider's content filter.",
};

/** The composer grows with its text up to this height, then scrolls. */
const COMPOSER_MAX = 160;

export function Coach({ ask }: { ask?: string | undefined }) {
  const { entries, profile, goals, settings, revision } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; retry: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  /** The question asked last on this screen: its exchange starts at the top. */
  const [turn, setTurn] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const reveal = useRef<string | null>(null);
  const asked = useRef(false);
  const today = dayKey();

  const context = useMemo(() => {
    const start = weekStart(today);
    const week = weekSummary(entries, start, goals);
    const inWeek = entries.filter((e) => e.date >= start);
    return { profile, goals, week, today, entries: inWeek, streak: streak(entries, today) };
  }, [entries, profile, goals, today]);

  // Read again after a sync brings messages from another device.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-read on each sync
  useEffect(() => {
    void db
      .chatHistory()
      .then(setMessages)
      .finally(() => setLoaded(true));
  }, [revision]);

  useEffect(() => () => abort.current?.abort(), []);

  // Open on the latest exchange. The whole page scrolls, so its very bottom
  // keeps the last answer clear of the composer and the tab bar.
  useEffect(() => {
    if (loaded) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [loaded]);

  // A new question goes to the top of the screen: its answer is read from the start.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once the question is rendered
  useEffect(() => {
    if (!reveal.current) return;
    document.getElementById(`m-${reveal.current}`)?.scrollIntoView({ block: "start" });
    reveal.current = null;
  }, [messages]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: measure on each change of the text
  useLayoutEffect(() => {
    const el = composer.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX)}px`;
  }, [input]);

  /** Answers the last question of `history`. */
  async function answer(history: ChatMessage[]) {
    if (!settings) return;
    setError(null);
    abort.current = new AbortController();
    setStreaming("");
    try {
      const a = await coachReply(
        { settings, signal: abort.current.signal },
        context,
        history,
        setStreaming,
      );
      const reply: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: a.text,
        time: Date.now(),
        ...(a.end ? { end: a.end } : {}),
      };
      await db.putChat(reply);
      setMessages((m) => [...m, reply]);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError({
          message: err instanceof Error ? err.message : String(err),
          // A refused key or a model that cannot take the request fails the same way again.
          retry: !(err instanceof AiError) || err.retryable,
        });
      }
    } finally {
      setStreaming(null);
    }
  }

  async function send(text: string) {
    if (!settings || !text.trim() || streaming !== null) return;
    const question: ChatMessage = {
      id: newId(),
      role: "user",
      text: text.trim(),
      time: Date.now(),
    };
    const history = [...messages, question];
    reveal.current = question.id;
    setTurn(question.id);
    setMessages(history);
    setInput("");
    setConfirmClear(false);
    await db.putChat(question);
    await answer(history);
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

  const busy = streaming !== null;
  const unanswered = messages.at(-1)?.role === "user";
  // On a touch keyboard Enter makes a new line; the send button sends.
  const enterSends = !window.matchMedia("(pointer: coarse)").matches;
  const split = turn ? messages.findIndex((m) => m.id === turn) : -1;
  const earlier = split < 0 ? messages : messages.slice(0, split);
  const current = split < 0 ? [] : messages.slice(split);

  const tail = (
    <>
      {busy ? (
        streaming ? (
          <Bubble message={{ id: "live", role: "assistant", text: streaming, time: 0 }} live />
        ) : (
          <div className="flex items-center gap-2 text-sm text-stone-500 dark:text-stone-400">
            <Spinner /> Thinking…
          </div>
        )
      ) : null}
      {error ? (
        <Notice tone="error">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>{error.message}</span>
            {error.retry && unanswered && !busy ? (
              <button
                type="button"
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                onClick={() => void answer(messages)}
              >
                <Icon name="retry" className="size-4" />
                Try again
              </button>
            ) : null}
          </div>
        </Notice>
      ) : null}
    </>
  );

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col">
      <PageTitle title="Coach" subtitle="Knows your goals and this week's meals.">
        {messages.length === 0 ? null : confirmClear ? (
          <div className="flex items-center gap-1">
            <span className="mr-1 text-sm text-stone-600 dark:text-stone-300">
              Clear the conversation?
            </span>
            <Button
              variant="danger"
              onClick={() =>
                void db.clearChat().then(() => {
                  setMessages([]);
                  setTurn(null);
                  setError(null);
                  setConfirmClear(false);
                })
              }
            >
              Clear
            </Button>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            icon="trash"
            disabled={busy}
            onClick={() => setConfirmClear(true)}
          >
            Clear
          </Button>
        )}
      </PageTitle>

      <div className="flex-1 space-y-3" role="log" aria-label="Conversation" aria-busy={busy}>
        {messages.length === 0 && !busy ? (
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
        {earlier.map((m) => (
          <Bubble key={m.id} message={m} />
        ))}
        {split < 0 ? (
          tail
        ) : (
          // The exchange under way takes a screen, so its question can sit at the top.
          <div className="min-h-[calc(100dvh-15rem)] space-y-3 sm:min-h-[calc(100dvh-11rem)]">
            {current.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {tail}
          </div>
        )}
      </div>

      <form
        className="sticky bottom-20 mt-4 flex items-end gap-2 rounded-2xl border border-stone-200 bg-white/90 p-2 shadow-lg backdrop-blur focus-within:border-brand-500 sm:bottom-4 dark:border-stone-800 dark:bg-stone-900/90"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <textarea
          ref={composer}
          rows={1}
          className="max-h-40 min-w-0 flex-1 resize-none bg-transparent px-2 py-1.5 text-base outline-none placeholder:text-stone-400 sm:text-sm dark:placeholder:text-stone-500"
          placeholder="Ask about your meals, goals, ideas…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (enterSends && e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(input);
            }
          }}
          enterKeyHint={enterSends ? "send" : "enter"}
          aria-label="Message"
        />
        {busy ? (
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

/** Links leave the app; a wide table scrolls inside the bubble. */
const MARKDOWN: Components = {
  a: ({ node: _, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  table: ({ node: _, ...props }) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
};

function Bubble({ message, live = false }: { message: ChatMessage; live?: boolean }) {
  const mine = message.role === "user";
  return (
    <div
      id={`m-${message.id}`}
      className={`flex scroll-mt-20 flex-col gap-1 ${mine ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          mine
            ? "rounded-br-md bg-brand-700 whitespace-pre-wrap text-white dark:bg-brand-600"
            : "markdown rounded-bl-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
        }`}
      >
        {mine ? (
          message.text
        ) : (
          // The coach answers in Markdown: no raw HTML, and no images, which the CSP blocks.
          <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN} disallowedElements={["img"]}>
            {message.text}
          </Markdown>
        )}
      </div>
      {mine || live ? null : (
        <div className="flex flex-wrap items-center gap-x-3 px-1 text-xs text-stone-500 dark:text-stone-400">
          <CopyButton text={message.text} />
          {message.end ? (
            <span className={message.end === "stopped" ? "" : "text-amber-700 dark:text-amber-400"}>
              {END_NOTES[message.end]}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 transition hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-brand-500 dark:hover:text-white"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => undefined,
        )
      }
    >
      <Icon name={copied ? "check" : "copy"} className="size-3.5" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
