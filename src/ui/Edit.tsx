/** Change a saved meal by hand, or ask the AI to correct it. */
import { useState } from "react";
import { analyzeMeal } from "../ai/meal";
import { Button, Notice, PageTitle } from "./kit";
import { toAnswer } from "./Log";
import { type Draft, MealEditor } from "./MealEditor";
import { go } from "./router";
import { useApp } from "./state";

export function Edit({ id }: { id: string }) {
  const { entries, settings, saveEntry, removeEntry } = useApp();
  const entry = entries.find((e) => e.id === id);
  const [draft, setDraft] = useState<Draft | null>(
    entry
      ? {
          title: entry.title,
          mealType: entry.mealType,
          date: entry.date,
          items: entry.items,
          notes: entry.notes,
          confidence: entry.confidence,
        }
      : null,
  );
  const [busy, setBusy] = useState<"save" | "fix" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!entry || !draft) {
    return (
      <>
        <PageTitle title="Meal not found" />
        <Button variant="secondary" onClick={() => go({ name: "day" })}>
          Back to today
        </Button>
      </>
    );
  }

  async function fix(correction: string) {
    if (!settings || !draft) return;
    setBusy("fix");
    setError(null);
    try {
      const a = await analyzeMeal({ settings }, { previous: toAnswer(draft), correction });
      setDraft({
        ...draft,
        title: a.title,
        mealType: a.mealType,
        items: a.items,
        notes: a.notes,
        confidence: a.confidence,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageTitle title="Edit meal" subtitle={entry.input ? `“${entry.input}”` : undefined}>
        <Button
          variant="danger"
          icon="trash"
          onClick={() => {
            void removeEntry(entry.id).then(() =>
              go({ name: "day", date: entry.date }, { replace: true }),
            );
          }}
        >
          Delete
        </Button>
      </PageTitle>
      <MealEditor
        draft={draft}
        onChange={setDraft}
        saveLabel="Save changes"
        saving={busy === "save"}
        correcting={busy === "fix"}
        onCorrect={settings ? (c) => void fix(c) : undefined}
        onCancel={() => history.back()}
        onSave={(d) => {
          setBusy("save");
          void saveEntry({
            ...entry,
            title: d.title.trim(),
            mealType: d.mealType,
            date: d.date,
            items: d.items,
            ...(d.notes ? { notes: d.notes } : {}),
            ...(d.confidence ? { confidence: d.confidence } : {}),
          }).then(() => go({ name: "day", date: d.date }, { replace: true }));
        }}
      />
      {error ? (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
    </>
  );
}
