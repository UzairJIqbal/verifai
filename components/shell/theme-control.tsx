"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { applyTheme, parseThemeChoice, THEME_STORAGE_KEY, type ThemeChoice } from "./theme";

const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { value: "system", label: "Follow the system", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

// The choice lives on <html data-theme>, set by the inline script before
// hydration; this reads it from there so the two can't disagree.
const listeners = new Set<() => void>();
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const readChoice = (): ThemeChoice => parseThemeChoice(document.documentElement.dataset.theme);

function choose(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked (a private window): the choice still applies until reload.
  }
  applyTheme(choice);
  listeners.forEach((listener) => listener());
}

export function ThemeControl() {
  const current = useSyncExternalStore(subscribe, readChoice, () => "system" as const);

  // While following the system, follow it live too.
  useEffect(() => {
    if (current !== "system") return;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => applyTheme("system");
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, [current]);

  return (
    <div role="group" aria-label="Theme" className="flex items-center rounded-md border p-0.5">
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={current === value}
          onClick={() => choose(value)}
          className={cn(
            "grid size-6 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            current === value && "bg-secondary text-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
