// Reads what the improvement chart is drawn from: the gate records, their
// runs and the review files. The page and `pnpm chart` both use this, so the
// image can't drift from the dashboard.
import { listGates } from "../gate/record";
import { listRuns, readRun } from "../results/read";
import { readNotes, readTags, readTaxonomy } from "../review/files";
import { improvementSeries, type Improvement, type RunData } from "./series";

export function loadImprovement(): Improvement {
  const { gates, problems: gateProblems } = listGates();
  const { runs, problems: runProblems } = listRuns();
  const notes = readNotes();
  const cache = new Map<string, RunData | string>();
  const run = (runId: string): RunData | string => {
    const seen = cache.get(runId);
    if (seen !== undefined) return seen;
    let data: RunData | string;
    try {
      const files = readRun(runId);
      data = files === null ? `Run ${runId} isn't in results/.` : { report: files.report, trials: files.sealed ? null : files.trials };
    } catch (error) {
      data = error instanceof Error ? error.message : String(error);
    }
    cache.set(runId, data);
    return data;
  };
  const series = improvementSeries({
    gates,
    run,
    configKeys: new Map(runs.map((r) => [r.runId, r.configKey])),
    notes,
    tags: readTags(notes),
    taxonomy: readTaxonomy(),
  });
  return { ...series, problems: [...gateProblems, ...runProblems, ...series.problems] };
}
