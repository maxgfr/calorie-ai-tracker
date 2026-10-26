/** Your model (llm-connect's settings store), the sync with GitHub and your data. */
import { ENDPOINT_PRESETS, RESPONSE_LANGUAGES } from "llm-connect";
import { useLlmSettings } from "llm-connect/react";
import { useEffect, useState } from "react";
import { llm } from "../ai/settings";
import { voiceLabel, voiceRoute } from "../ai/voice";
import { SYNC_FILE, validRepo } from "../data/sync";
import { Button, Notice, PageTitle } from "./kit";
import { useApp } from "./state";

const TEST_REASONS: Record<string, string> = {
  auth: "The key was refused.",
  cors: "Key refused or network: the request got no readable answer.",
  http: "The provider answered with an error.",
  timeout: "The provider did not answer in time.",
  config: "Something is missing: a key, a model or an endpoint.",
  insecure: "Plain http is only allowed to this machine (localhost).",
};

export function Settings() {
  const state = useLlmSettings(llm);
  const { settings, entries, resetAll } = useApp();
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const d = state.draft;

  useEffect(() => {
    void llm.load().then(() => llm.open());
  }, []);

  async function save() {
    const r = await llm.save();
    setSaved(
      r.ok
        ? "Saved."
        : r.reason === "incomplete"
          ? "Pick a model and enter a key first."
          : r.reason === "insecure-endpoint"
            ? "Plain http is only allowed to localhost."
            : "This endpoint URL is not valid.",
    );
  }

  const models = state.models.slice(0, 200);
  const vision = (input?: string[]) => (input ? input.includes("image") : undefined);

  return (
    <>
      <PageTitle
        title="Settings"
        subtitle="Bring your own model. Nothing goes through a server of ours: there is none."
      />

      <section className="card grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">AI model</h2>
          <div
            className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 text-sm whitespace-nowrap dark:bg-stone-800"
            role="tablist"
          >
            {[false, true].map((custom) => (
              <button
                key={String(custom)}
                type="button"
                role="tab"
                aria-selected={d.custom === custom}
                onClick={() => llm.toggleCustom(custom)}
                className={`rounded-lg px-3 py-1 font-medium ${d.custom === custom ? "bg-white shadow-sm dark:bg-stone-950" : "text-stone-500"}`}
              >
                {custom ? "Local / custom" : "Provider"}
              </button>
            ))}
          </div>
        </div>

        {d.custom ? (
          <>
            <div className="flex flex-wrap gap-2">
              {Object.values(ENDPOINT_PRESETS).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="chip"
                  aria-pressed={d.customEndpoint === p.endpoint}
                  onClick={() => llm.applyPreset(p)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <label>
              <span className="label">Endpoint (OpenAI-compatible)</span>
              <input
                className="input"
                placeholder="http://localhost:11434/v1"
                value={d.customEndpoint}
                onChange={(e) => llm.setEndpoint(e.target.value)}
              />
            </label>
            <label>
              <span className="label">Model</span>
              <input
                className="input"
                placeholder="llama3.2-vision"
                value={d.customModel}
                onChange={(e) => llm.setCustomModel(e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              <span className="label">Provider</span>
              <select
                className="input"
                value={d.providerId}
                onChange={(e) => llm.selectProvider(e.target.value)}
                disabled={state.catalogStatus === "loading"}
              >
                {state.catalogStatus === "loading" ? <option>Loading the catalog…</option> : null}
                <optgroup label="Recommended">
                  {state.providers.recommended.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Others">
                  {state.providers.others.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </label>
            {state.catalogStatus === "error" ? (
              <Notice tone="error">
                The model catalog could not be loaded.{" "}
                <button type="button" className="underline" onClick={() => llm.retryCatalog()}>
                  Retry
                </button>
              </Notice>
            ) : null}
            <div>
              <label>
                <span className="label">Model</span>
                <input
                  className="input mb-2"
                  placeholder="Search models…"
                  value={state.search}
                  onChange={(e) => llm.setSearch(e.target.value)}
                />
              </label>
              <div
                className="max-h-56 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800"
                role="listbox"
                aria-label="Models"
              >
                {models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={d.model === m.id}
                    onClick={() => llm.selectModel(m.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                      d.model === m.id
                        ? "bg-brand-50 font-semibold text-brand-900 dark:bg-brand-900/40 dark:text-brand-100"
                        : "hover:bg-stone-50 dark:hover:bg-stone-800"
                    }`}
                  >
                    <span className="truncate">
                      {m.name}
                      {state.recommendedModel?.id === m.id ? (
                        <span className="ml-2 text-xs text-brand-700 dark:text-brand-400">
                          recommended
                        </span>
                      ) : null}
                    </span>
                    {vision(m.input) ? (
                      <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                        photos
                      </span>
                    ) : null}
                  </button>
                ))}
                {models.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-stone-500">No model matches.</p>
                ) : null}
              </div>
            </div>
          </>
        )}

        <label>
          <span className="label">API key{d.custom ? " (optional for local servers)" : ""}</span>
          <input
            className="input font-mono"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={state.apiKey}
            onChange={(e) => llm.setApiKey(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-brand-600"
            checked={d.rememberKey}
            onChange={(e) => llm.setRememberKey(e.target.checked)}
          />
          Remember the key on this device (encrypted). Otherwise it is forgotten when the tab
          closes.
        </label>

        <label>
          <span className="label">AI answers in</span>
          <select
            className="input"
            value={d.language}
            onChange={(e) => llm.setLanguage(e.target.value)}
          >
            {RESPONSE_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void save()} disabled={!state.canSave}>
            Save
          </Button>
          <Button
            variant="secondary"
            busy={state.testing}
            disabled={!state.canTest}
            onClick={() => void llm.test()}
          >
            Test connection
          </Button>
          <Button
            variant="ghost"
            onClick={() => void llm.clear().then(() => setSaved("Settings cleared."))}
          >
            Forget
          </Button>
          {saved ? (
            <span className="text-sm text-stone-600 dark:text-stone-300">{saved}</span>
          ) : null}
        </div>
        {state.testResult ? (
          state.testResult.ok ? (
            <Notice>
              Connected
              {state.testResult.modelCount
                ? ` · ${state.testResult.modelCount} models available`
                : ""}
              .
            </Notice>
          ) : (
            <Notice tone="error">
              {TEST_REASONS[state.testResult.reason] ?? "The test failed."}
              {state.testResult.message ? ` ${state.testResult.message}` : ""}
            </Notice>
          )
        ) : null}
        {settings ? (
          <p className="text-xs text-stone-500">
            Photos and voice go to your model. Voice: {voiceLabel(voiceRoute(settings))}
          </p>
        ) : null}
      </section>

      <GitHubSync />

      <section className="card mt-4 grid gap-3">
        <h2 className="font-semibold">Your data</h2>
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {entries.length} meals, your profile, goals and the coach conversation are stored in this
          browser (IndexedDB), and in your GitHub repository when sync is on. Photos are sent to
          your model to be estimated, then kept as small thumbnails. Deleting here leaves the GitHub
          copy as it is.
        </p>
        <div className="flex flex-wrap gap-2">
          {confirmReset ? (
            <>
              <Button
                variant="danger"
                onClick={() => void resetAll().then(() => setConfirmReset(false))}
              >
                Yes, delete everything
              </Button>
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="danger" icon="trash" onClick={() => setConfirmReset(true)}>
              Delete all my data
            </Button>
          )}
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-stone-400">
        Open source ·{" "}
        <a
          className="underline"
          href="https://github.com/maxgfr/calorie-ai-tracker"
          target="_blank"
          rel="noreferrer"
        >
          github.com/maxgfr/calorie-ai-tracker
        </a>
      </p>
    </>
  );
}

function GitHubSync() {
  const { sync, connectSync, disconnectSync, syncNow } = useApp();
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState(SYNC_FILE);
  const [token, setToken] = useState("");
  const canConnect = validRepo(repo) && path.trim() !== "" && token.trim() !== "" && !sync.syncing;

  async function connect() {
    if (await connectSync({ repo: repo.trim(), path: path.trim(), token: token.trim() })) {
      setToken("");
    }
  }

  return (
    <section className="card mt-4 grid gap-3">
      <h2 className="font-semibold">Sync with GitHub</h2>
      {sync.target ? (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Synced with <span className="font-mono">{sync.target.repo}</span>, file{" "}
            <span className="font-mono">{sync.target.path}</span>, after each change and when you
            come back to the app.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              busy={sync.syncing}
              disabled={sync.syncing}
              onClick={() => void syncNow()}
            >
              Sync now
            </Button>
            <Button variant="ghost" onClick={() => void disconnectSync()}>
              Disconnect
            </Button>
            <span className="text-sm text-stone-600 dark:text-stone-300">
              {sync.syncing
                ? "Syncing…"
                : sync.lastSync
                  ? `Last synced ${new Date(sync.lastSync).toLocaleString()}.`
                  : null}
            </span>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-stone-600 dark:text-stone-300">
            Keep your meals, profile, goals and coach conversation in a file of a GitHub repository,
            and find them on every device. Use a <strong>private</strong> repository and a{" "}
            <a
              className="underline"
              href="https://github.com/settings/personal-access-tokens/new"
              target="_blank"
              rel="noreferrer"
            >
              fine-grained token
            </a>{" "}
            limited to it, with the permission Contents: read and write. The token is encrypted on
            this device and only ever sent to GitHub.
          </p>
          <label>
            <span className="label">Repository</span>
            <input
              className="input font-mono"
              placeholder="you/calorie-data"
              autoComplete="off"
              spellCheck={false}
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
            />
          </label>
          <label>
            <span className="label">File</span>
            <input
              className="input font-mono"
              autoComplete="off"
              spellCheck={false}
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </label>
          <label>
            <span className="label">GitHub token</span>
            <input
              className="input font-mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <div>
            <Button busy={sync.syncing} disabled={!canConnect} onClick={() => void connect()}>
              Connect and sync
            </Button>
          </div>
        </>
      )}
      {sync.error ? <Notice tone="error">{sync.error}</Notice> : null}
    </section>
  );
}
