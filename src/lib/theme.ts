// The shop's light or dark theme (D-33, user 2026-11-13): it follows the
// device, unless the visitor chose one with the button in the header. The
// choice is kept in the browser only (localStorage, docs/PRIVACY.md); the
// server always sends data-theme="system" and never knows it. The admin panel
// has no data-theme and stays light (D-07).

export const THEME_KEY = "wonzo.theme.v1";

export type ThemeChoice = "light" | "dark";

/** A stored value we accept; anything else (an old or tampered value) is ignored: the device decides. */
export function parseThemeChoice(x: unknown): ThemeChoice | null {
  return x === "light" || x === "dark" ? x : null;
}

/**
 * Runs in <head>, before the first paint, so a dark choice never flashes
 * light (node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md).
 * A fixed string: nothing from outside goes into it. localStorage may be
 * blocked (private mode, settings): then the device decides.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;
