/** Hash routes, so the app works from any folder of GitHub Pages. */
import { useEffect, useState } from "react";

export type Route =
  | { name: "day"; date?: string }
  | { name: "log"; date?: string }
  | { name: "edit"; id: string }
  | { name: "week"; date?: string }
  | { name: "goals" }
  | { name: "coach"; ask?: string }
  | { name: "settings" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseRoute(hash: string): Route {
  const [path = "", query = ""] = hash.replace(/^#\/?/, "").split("?");
  const [name, arg] = path.split("/");
  const date = arg && DATE.test(arg) ? arg : undefined;
  switch (name) {
    case "log":
      return date ? { name: "log", date } : { name: "log" };
    case "edit":
      return arg ? { name: "edit", id: arg } : { name: "day" };
    case "week":
      return date ? { name: "week", date } : { name: "week" };
    case "goals":
      return { name: "goals" };
    case "coach": {
      const ask = new URLSearchParams(query).get("ask");
      return ask ? { name: "coach", ask } : { name: "coach" };
    }
    case "settings":
      return { name: "settings" };
    default:
      return date ? { name: "day", date } : { name: "day" };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case "day":
      return route.date ? `#/day/${route.date}` : "#/";
    case "log":
      return route.date ? `#/log/${route.date}` : "#/log";
    case "edit":
      return `#/edit/${route.id}`;
    case "week":
      return route.date ? `#/week/${route.date}` : "#/week";
    case "coach":
      return route.ask ? `#/coach?ask=${encodeURIComponent(route.ask)}` : "#/coach";
    default:
      return `#/${route.name}`;
  }
}

export function go(route: Route): void {
  location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}
