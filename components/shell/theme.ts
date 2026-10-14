// The theme choice: follow the system, or force light or dark. It's kept in
// localStorage so it survives a reload, and applied as the "dark" class on
// <html> before first paint by THEME_SCRIPT, which the root layout inlines.

export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_STORAGE_KEY = "verifai-theme";

// Runs in <head> before anything is painted. Mirrors applyTheme below; it's a
// string because it has to run before React does.
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t="system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=t}catch(e){}})()`;

export function parseThemeChoice(value: string | null | undefined): ThemeChoice {
  return THEME_CHOICES.find((choice) => choice === value) ?? "system";
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  const dark = choice === "dark" || (choice === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.dataset.theme = choice;
}
