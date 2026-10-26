import { describe, expect, test } from "bun:test";
import { href, parseRoute, type Route } from "./router";

describe("router", () => {
  test("round-trips every route", () => {
    const routes: Route[] = [
      { name: "day" },
      { name: "day", date: "2026-10-20" },
      { name: "log", date: "2026-10-20" },
      { name: "edit", id: "abc" },
      { name: "week", date: "2026-10-19" },
      { name: "goals" },
      { name: "coach", ask: "How did I do?" },
      { name: "settings" },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });

  test("anything unknown is today", () => {
    expect(parseRoute("")).toEqual({ name: "day" });
    expect(parseRoute("#/nope/zzz")).toEqual({ name: "day" });
    expect(parseRoute("#/day/not-a-date")).toEqual({ name: "day" });
  });
});
