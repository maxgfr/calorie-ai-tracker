/** The shell: header, navigation (a bottom bar on phones), and the current view. */
import { modelLabel } from "../ai/settings";
import { Coach } from "./Coach";
import { Day } from "./Day";
import { Edit } from "./Edit";
import { Goals } from "./Goals";
import { Icon, type IconName, Spinner } from "./kit";
import { Log } from "./Log";
import { href, type Route, useRoute } from "./router";
import { Settings } from "./Settings";
import { useApp } from "./state";
import { Week } from "./Week";

const NAV: { route: Route; label: string; icon: IconName; match: Route["name"][] }[] = [
  { route: { name: "day" }, label: "Today", icon: "today", match: ["day", "edit"] },
  { route: { name: "week" }, label: "Week", icon: "week", match: ["week"] },
  { route: { name: "log" }, label: "Log", icon: "plus", match: ["log"] },
  { route: { name: "goals" }, label: "Goals", icon: "target", match: ["goals"] },
  { route: { name: "coach" }, label: "Coach", icon: "chat", match: ["coach"] },
];

function View({ route }: { route: Route }) {
  switch (route.name) {
    case "log":
      return <Log key={route.date ?? "today"} date={route.date} />;
    case "edit":
      return <Edit key={route.id} id={route.id} />;
    case "week":
      return <Week date={route.date} />;
    case "goals":
      return <Goals />;
    case "coach":
      return <Coach ask={route.ask} />;
    case "settings":
      return <Settings />;
    default:
      return <Day date={route.date} />;
  }
}

export function App() {
  const route = useRoute();
  const { ready, settings } = useApp();

  return (
    <div className="min-h-dvh pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 border-b border-stone-200/70 bg-stone-50/85 backdrop-blur dark:border-stone-800/70 dark:bg-stone-950/85">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
          <a
            href={href({ name: "day" })}
            className="flex items-center gap-2 font-bold tracking-tight"
          >
            <img src="./icon.svg" alt="" className="size-7" />
            <span>
              calorie<span className="text-brand-700 dark:text-brand-400">ai</span>
            </span>
          </a>
          <nav className="hidden flex-1 items-center gap-1 sm:flex" aria-label="Main">
            {NAV.map((n) => (
              <a
                key={n.label}
                href={href(n.route)}
                aria-current={n.match.includes(route.name) ? "page" : undefined}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 transition hover:bg-stone-200/70 aria-[current=page]:bg-stone-900 aria-[current=page]:text-white dark:text-stone-300 dark:hover:bg-stone-800 dark:aria-[current=page]:bg-white dark:aria-[current=page]:text-stone-900"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <a
            href={href({ name: "settings" })}
            aria-current={route.name === "settings" ? "page" : undefined}
            className="ml-auto flex max-w-[50%] items-center gap-2 rounded-full border border-stone-300 px-3 py-1 text-xs text-stone-600 transition hover:border-brand-500 dark:border-stone-700 dark:text-stone-300"
            title="AI settings"
          >
            <span
              className={`size-2 shrink-0 rounded-full ${settings ? "bg-brand-500" : "bg-amber-500"}`}
            />
            <span className="truncate">{settings ? modelLabel(settings) : "Connect a model"}</span>
            <Icon name="gear" className="size-4 shrink-0" />
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-6">
        {ready ? (
          <View route={route} />
        ) : (
          <div className="grid place-items-center py-24 text-stone-400">
            <Spinner className="size-6" />
          </div>
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden dark:border-stone-800 dark:bg-stone-950/95"
        aria-label="Main"
      >
        <div className="grid grid-cols-5">
          {NAV.map((n) => {
            const active = n.match.includes(route.name);
            const log = n.route.name === "log";
            return (
              <a
                key={n.label}
                href={href(n.route)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-brand-700 dark:text-brand-400" : "text-stone-500"}`}
              >
                {log ? (
                  <span className="-mt-5 grid size-12 place-items-center rounded-full bg-brand-700 text-white shadow-lg ring-4 ring-white dark:bg-brand-500 dark:text-stone-950 dark:ring-stone-950">
                    <Icon name="plus" className="size-6" />
                  </span>
                ) : (
                  <Icon name={n.icon} />
                )}
                {n.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
