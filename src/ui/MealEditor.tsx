/** The meal before it is saved: items to fix by hand, or a correction for the AI. */
import { useState } from "react";
import type { FoodItem, MealType } from "../data/model";
import { MEAL_TYPES } from "../data/model";
import { entryTotals, roundItem } from "../data/stats";
import { Button, Icon, MacroLine } from "./kit";

export interface Draft {
  title: string;
  mealType: MealType;
  date: string;
  items: FoodItem[];
  notes?: string | undefined;
  confidence?: "low" | "medium" | "high" | undefined;
}

const EMPTY_ITEM: FoodItem = { name: "", quantity: "", kcal: 0, protein: 0, carbs: 0, fat: 0 };
const NUMBERS = ["kcal", "protein", "carbs", "fat"] as const;

function NumberCell({
  value,
  label,
  onChange,
}: {
  value: number;
  label: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        className="input num px-2 text-right"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}

export function MealEditor({
  draft,
  onChange,
  onSave,
  onCorrect,
  onCancel,
  saving = false,
  correcting = false,
  saveLabel = "Save meal",
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onSave: (draft: Draft) => void;
  onCorrect?: ((correction: string) => void) | undefined;
  onCancel?: (() => void) | undefined;
  saving?: boolean;
  correcting?: boolean;
  saveLabel?: string;
}) {
  const [correction, setCorrection] = useState("");
  const totals = entryTotals(draft);
  const setItem = (i: number, item: FoodItem) =>
    onChange({ ...draft, items: draft.items.map((it, j) => (j === i ? item : it)) });

  return (
    <div className="card grid gap-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label>
          <span className="label">Meal</span>
          <input
            className="input"
            value={draft.title}
            onChange={(e) => onChange({ ...draft, title: e.target.value })}
          />
        </label>
        <label>
          <span className="label">Type</span>
          <select
            className="input"
            value={draft.mealType}
            onChange={(e) => onChange({ ...draft, mealType: e.target.value as MealType })}
          >
            {MEAL_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0]?.toUpperCase()}
                {t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Day</span>
          <input
            className="input"
            type="date"
            value={draft.date}
            onChange={(e) => e.target.value && onChange({ ...draft, date: e.target.value })}
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-500 dark:text-stone-400">
              <th className="pb-1 font-medium">Food</th>
              <th className="pb-1 font-medium">Portion</th>
              <th className="w-20 pb-1 text-right font-medium">kcal</th>
              <th className="w-16 pb-1 text-right font-medium text-protein">P g</th>
              <th className="w-16 pb-1 text-right font-medium text-carbs">C g</th>
              <th className="w-16 pb-1 text-right font-medium text-fat">F g</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no identity of their own
              <tr key={i}>
                <td className="py-1 pr-1">
                  <input
                    className="input px-2"
                    aria-label="Food"
                    value={item.name}
                    onChange={(e) => setItem(i, { ...item, name: e.target.value })}
                  />
                </td>
                <td className="py-1 pr-1">
                  <input
                    className="input px-2"
                    aria-label="Portion"
                    value={item.quantity}
                    onChange={(e) => setItem(i, { ...item, quantity: e.target.value })}
                  />
                </td>
                {NUMBERS.map((k) => (
                  <td key={k} className="py-1 pr-1">
                    <NumberCell
                      label={k}
                      value={item[k]}
                      onChange={(n) => setItem(i, { ...item, [k]: n })}
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="rounded-lg p-1.5 text-stone-400 hover:text-rose-600"
                    aria-label={`Remove ${item.name || "item"}`}
                    onClick={() =>
                      onChange({ ...draft, items: draft.items.filter((_, j) => j !== i) })
                    }
                  >
                    <Icon name="close" className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="pt-2" colSpan={2}>
                <button
                  type="button"
                  className="chip"
                  onClick={() => onChange({ ...draft, items: [...draft.items, EMPTY_ITEM] })}
                >
                  + Add a food
                </button>
              </td>
              <td className="num pt-2 text-right">{Math.round(totals.kcal)}</td>
              <td className="num pt-2 text-right">{Math.round(totals.protein)}</td>
              <td className="num pt-2 text-right">{Math.round(totals.carbs)}</td>
              <td className="num pt-2 text-right">{Math.round(totals.fat)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {draft.notes ? (
        <p className="text-sm text-stone-600 dark:text-stone-300">
          {draft.confidence ? (
            <span className="mr-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium dark:bg-stone-800">
              {draft.confidence} confidence
            </span>
          ) : null}
          {draft.notes}
        </p>
      ) : null}

      {onCorrect ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (correction.trim()) onCorrect(correction);
          }}
        >
          <input
            className="input"
            placeholder="Tell the AI what to fix: “it was a double portion”, “no butter”…"
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            icon="spark"
            busy={correcting}
            disabled={!correction.trim()}
          >
            Fix
          </Button>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4 dark:border-stone-800">
        <MacroLine n={totals} className="text-sm" />
        <div className="flex gap-2">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            busy={saving}
            disabled={draft.items.length === 0 || !draft.title.trim()}
            onClick={() =>
              onSave({ ...draft, items: draft.items.filter((i) => i.name.trim()).map(roundItem) })
            }
          >
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
