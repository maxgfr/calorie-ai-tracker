/** Calendar days as local YYYY-MM-DD keys; weeks start on Monday. */

export function dayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** The key's day at local noon, safe from daylight-saving shifts. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Monday of the key's week. */
export function weekStart(key: string): string {
  const day = parseDay(key).getDay();
  return addDays(key, -((day + 6) % 7));
}

export function weekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function formatDay(key: string, style: "long" | "short" = "long"): string {
  const d = parseDay(key);
  return style === "long"
    ? d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    : d.toLocaleDateString(undefined, { weekday: "short" });
}

export function relativeDay(key: string, today = dayKey()): string {
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return formatDay(key);
}
