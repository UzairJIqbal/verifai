import Link from "next/link";
import { SectionHeading } from "@/components/shell/empty-state";

// What VerifAI is and its final baseline, written out so the page's server
// HTML says it before any table. The numbers are the ones in the README, from
// the committed results (run 20261023-122611-7220 and results/noise-floors.jsonl).
export function AboutVerifai() {
  return (
    <div className="mb-6 grid max-w-prose gap-4">
      <section>
        <SectionHeading>What VerifAI is</SectionHeading>
        <p className="text-muted-foreground">
          VerifAI is an evaluation system for a customer-support agent of a made-up phone-accessories shop. It runs the agent on a fixed set
          of tasks many times, checks each result with code wherever it can, uses a claim checker to count made-up facts in the
          agent&apos;s answers, and has a release gate that keeps a change only if the locked-away holdout tasks get better by more than luck
          could explain.
        </p>
      </section>
      <section>
        <SectionHeading>Latest result</SectionHeading>
        <p className="text-muted-foreground">
          The final baseline, agent v1, succeeds on <span className="font-mono text-foreground">89.7%</span> of dev tries (95% interval{" "}
          <span className="font-mono">83.9–94.6</span>, 56 tasks × 4 tries, run{" "}
          <Link href="/runs/20261023-122611-7220" className="font-mono text-link hover:underline">
            20261023-122611-7220
          </Link>
          ). Running the same configuration twice showed that a difference under <span className="font-mono">4.9</span> points can be luck
          alone; that is the noise floor.
        </p>
      </section>
    </div>
  );
}
