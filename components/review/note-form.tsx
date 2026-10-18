"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/review/category-select";
import { postReview } from "@/components/review/post";
import type { FailureCategory, SaveNoteRequest, TrialRef } from "@/src/review/schema";

// One note for the try on screen. Before the taxonomy exists it's free text
// only; after, it needs its one category too.
export function NoteForm({ trial, categories }: { trial: TrialRef; categories: FailureCategory[] | null }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = note.trim() !== "" && (categories === null || category !== "");

  async function save() {
    if (!ready) return;
    const body: SaveNoteRequest = { ...trial, note, category: categories === null ? null : category };
    setSaving(true);
    setError(null);
    const failed = await postReview("/api/review/note", body);
    if (failed) {
      setError(failed);
      setSaving(false);
      return;
    }
    // The page is read again, with the next try in place of this one.
    router.refresh();
  }

  return (
    <section className="space-y-2 rounded-md border p-3 text-[12px]">
      <label className="block">
        <span className="mb-1 block font-medium">What went wrong?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={saving}
          rows={5}
          placeholder="In your own words: what the agent did, and where it first went wrong."
          className="w-full rounded-md border bg-background p-2 leading-5 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        />
      </label>
      {categories !== null && (
        <div className="space-y-1">
          <CategorySelect label="Category" categories={categories} value={category} onChange={setCategory} disabled={saving} />
          <p className="text-muted-foreground">{categories.find((c) => c.id === category)?.definition ?? "If two fit, pick the one that happened first in the trajectory."}</p>
        </div>
      )}
      <Button size="sm" onClick={save} disabled={saving || !ready}>
        {saving ? "Saving…" : "Save note"}
      </Button>
      {error && <p className="whitespace-pre-wrap text-fail">{error}</p>}
    </section>
  );
}
