// `pnpm tasks:freeze --reason "why"`: the deliberate step after changing the
// holdout. Checks every task's expected changes, then writes the lock and a
// changelog line.
import { parseArgs } from "node:util";
import { styleText } from "node:util";
import { freezeHoldout } from "../src/tasks/load";

try {
  const { values } = parseArgs({ options: { reason: { type: "string" } } });
  if (values.reason === undefined) throw new Error('Say why the holdout is being frozen: pnpm tasks:freeze --reason "…"');
  const { version, fingerprint, holdoutCounts } = freezeHoldout(values.reason);
  const counts = Object.entries(holdoutCounts).map(([c, n]) => `${c} ${n}`).join(", ");
  console.log(styleText("green", `✓ Holdout frozen for dataset ${version} (fingerprint ${fingerprint.slice(0, 12)}).`));
  console.log(styleText("dim", `  holdout per category: ${counts}. A line was added to evals/CHANGELOG.md.`));
} catch (error) {
  console.error(styleText("red", `✗ ${error instanceof Error ? error.message : String(error)}`));
  process.exit(1);
}
