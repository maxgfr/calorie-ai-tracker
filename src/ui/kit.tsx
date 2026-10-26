/** Small building blocks shared by the views. */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Nutrients } from "../data/model";

const ICONS = {
  today:
    "M12 3v2m0 14v2m9-9h-2M5 12H3m15.4-6.4-1.4 1.4M7 17l-1.4 1.4m12.8 0L17 17M7 7 5.6 5.6M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  week: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  plus: "M12 5v14M5 12h14",
  target:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-4a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  chat: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z",
  camera:
    "M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  mic: "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm7-3a7 7 0 0 1-14 0m7 7v3",
  text: "M4 6h16M4 12h16M4 18h10",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  edit: "m4 20 4-1 11-11-3-3L5 16l-1 4Zm10-13 3 3",
  left: "m15 18-6-6 6-6",
  right: "m9 18 6-6-6-6",
  spark:
    "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z",
  stop: "M7 7h10v10H7z",
  close: "M6 6l12 12M18 6 6 18",
  send: "M4 12 20 4l-4 16-4-7-8-1Z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-700 text-white hover:bg-brand-800 dark:bg-brand-500 dark:text-stone-950 dark:hover:bg-brand-400",
  secondary:
    "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800",
  ghost:
    "text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white",
  danger: "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950",
};

export function Button({
  variant = "primary",
  busy = false,
  icon,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {busy ? <Spinner /> : icon ? <Icon name={icon} className="size-4" /> : null}
      {children}
    </button>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".25"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "warn";
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-900 dark:bg-brand-900/30 dark:text-brand-100",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-100",
    error:
      "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-100",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2 text-sm ${tones[tone]}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-stone-500 dark:text-stone-400">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** A calorie ring: eaten against the goal, red past it. */
export function Ring({ value, goal, size = 176 }: { value: number; goal: number; size?: number }) {
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = goal > 0 ? value / goal : 0;
  const over = ratio > 1;
  const left = Math.round(goal - value);
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        width={size}
        height={size}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-stone-200 dark:stroke-stone-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, ratio))}
          className={`transition-[stroke-dashoffset] duration-700 ${over ? "stroke-rose-500" : "stroke-brand-600 dark:stroke-brand-400"}`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="num text-3xl font-bold tracking-tight">{Math.round(value)}</div>
        <div className="text-xs text-stone-500 dark:text-stone-400">of {goal} kcal</div>
        <div
          className={`num mt-1 text-xs font-semibold ${over ? "text-rose-600 dark:text-rose-400" : "text-brand-700 dark:text-brand-400"}`}
        >
          {over ? `${-left} over` : `${left} left`}
        </div>
      </div>
    </div>
  );
}

const MACROS = [
  { key: "protein", label: "Protein", bar: "bg-protein" },
  { key: "carbs", label: "Carbs", bar: "bg-carbs" },
  { key: "fat", label: "Fat", bar: "bg-fat" },
] as const;

export function MacroBars({ totals, goals }: { totals: Nutrients; goals: Nutrients }) {
  return (
    <div className="grid w-full gap-3">
      {MACROS.map((m) => {
        const v = totals[m.key];
        const g = goals[m.key];
        const pct = g > 0 ? Math.min(100, (v / g) * 100) : 0;
        return (
          <div key={m.key}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium">{m.label}</span>
              <span className="num text-stone-500 dark:text-stone-400">
                {Math.round(v)} / {g} g
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
              <div
                className={`h-full rounded-full ${m.bar} transition-[width] duration-700`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MacroLine({ n, className = "" }: { n: Nutrients; className?: string }) {
  return (
    <span className={`num text-xs text-stone-500 dark:text-stone-400 ${className}`}>
      <span className="text-protein">P</span> {Math.round(n.protein)} ·{" "}
      <span className="text-carbs">C</span> {Math.round(n.carbs)} ·{" "}
      <span className="text-fat">F</span> {Math.round(n.fat)} g
    </span>
  );
}
