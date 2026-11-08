/** localStorage key for the theme choice: "system" | "light" | "dark". */
export const THEME_KEY = "gst-theme";

export type ThemeChoice = "system" | "light" | "dark";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong
 * theme. Kept tiny and dependency-free; it is inlined as a string.
 */
export const THEME_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)},t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches),e=document.documentElement;e.classList.toggle("dark",d);e.setAttribute("data-theme",t)}catch(_){}})();`;
