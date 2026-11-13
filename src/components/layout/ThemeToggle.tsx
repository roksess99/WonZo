"use client";

import { useLayoutEffect } from "react";
import { parseThemeChoice, THEME_KEY, type ThemeChoice } from "@/lib/theme";
import { MoonIcon, SunIcon } from "../icons";

const root = () => document.documentElement;

function stored(): ThemeChoice | null {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

/** What the page shows now: the visitor's choice, else the device. */
function showsDark(): boolean {
  const t = root().getAttribute("data-theme");
  return t === "dark" || (t !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

/**
 * The theme button in the header (D-33). It says where it goes: "Donker"
 * with a moon on a light page, "Licht" with a sun on a dark one — a button
 * that always said "Donker" turned a dark page light (seen by the user,
 * 2026-11-13). Both labels are in the page and CSS shows the right one
 * (only-light / only-dark, globals.css), so it is right from the first paint,
 * also when the device decides; the hidden one is not read out either.
 * The first press stores a choice; until then the device decides.
 */
export function ThemeToggle({ dark, light, hidden }: { dark: string; light: string; hidden: string }) {
  // React's dev remount resets <html> to what it rendered (data-theme="system"):
  // put the choice back before paint. In production this changes nothing.
  useLayoutEffect(() => {
    const choice = stored();
    if (choice) root().setAttribute("data-theme", choice);
  }, []);

  function toggle() {
    const next: ThemeChoice = showsDark() ? "light" : "dark";
    root().setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage blocked: the choice holds for this page only.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      // px-2 on a phone: at 375px the header row (theme, language, cart) is otherwise 5px too wide (measured 2026-11-13).
      className="inline-flex min-h-11 items-center rounded-md px-2 hover:bg-background sm:px-3"
    >
      <span className="only-light">
        <span className="inline-flex items-center gap-2">
          <MoonIcon />
          <span>
            {dark}
            <span className="sr-only">{hidden}</span>
          </span>
        </span>
      </span>
      <span className="only-dark">
        <span className="inline-flex items-center gap-2">
          <SunIcon />
          <span>
            {light}
            <span className="sr-only">{hidden}</span>
          </span>
        </span>
      </span>
    </button>
  );
}
