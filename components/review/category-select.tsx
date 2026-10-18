import type { FailureCategory } from "@/src/review/schema";

export function CategorySelect({ categories, value, onChange, disabled, label }: { categories: FailureCategory[]; value: string; onChange: (v: string) => void; disabled: boolean; label: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 max-w-full rounded-md border bg-background px-1.5 text-[12px] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <option value="">Pick a category…</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id} title={c.definition}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
