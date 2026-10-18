"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CategorySelect } from "@/components/review/category-select";
import { postReview } from "@/components/review/post";
import type { FailureCategory, SaveTagRequest, TrialRef } from "@/src/review/schema";

// The second pass: one category for a note written before the taxonomy.
export function TagRow({ trial, categories }: { trial: TrialRef; categories: FailureCategory[] }) {
  const router = useRouter();
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (category === "") return;
    const body: SaveTagRequest = { ...trial, category };
    setSaving(true);
    setError(null);
    const failed = await postReview("/api/review/tag", body);
    if (failed) {
      setError(failed);
      setSaving(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <CategorySelect label={`Category for ${trial.taskId}, try ${trial.tryNumber}`} categories={categories} value={category} onChange={setCategory} disabled={saving} />
        <Button size="sm" variant="outline" onClick={save} disabled={saving || category === ""}>
          {saving ? "Saving…" : "Save tag"}
        </Button>
      </div>
      {error && <p className="whitespace-pre-wrap text-fail">{error}</p>}
    </div>
  );
}
