import type { Claim, ClaimCheck } from "@/src/results/schema";

const LABEL_CLASS: Record<Claim["label"], string> = {
  supported: "text-pass",
  contradicted: "text-fail",
  unsupported: "text-fail",
};

// Under the reply it came from: the claim, the judge's label, its evidence and reason.
export function ClaimNote({ c }: { c: Claim }) {
  return (
    <div className={`mt-1 border-l-2 pl-2 text-[12px] ${c.label === "supported" ? "border-l-border" : "border-l-fail"}`}>
      <p>
        <span className={`font-mono ${LABEL_CLASS[c.label]}`}>{c.label}</span> {c.text}
      </p>
      <p className="text-muted-foreground">
        {c.reason} <span className="font-mono">evidence: {c.evidence || "none"}</span>
      </p>
    </div>
  );
}

// One line at the top: what the claim checker made of this try, or why it hasn't.
export function ClaimsLine({ claims, runId, errored }: { claims: ClaimCheck | null; runId: string; errored: boolean }) {
  if (errored) return <span className="text-muted-foreground">Not checked: the try errored before it finished.</span>;
  if (claims === null) {
    return (
      <span className="text-muted-foreground">
        Not checked yet. Run <span className="font-mono">pnpm claims {runId}</span> (about one judge call per try).
      </span>
    );
  }
  if (claims.status === "ungraded") {
    return (
      <span>
        <span className="text-fail">? couldn&apos;t grade</span> <span className="text-muted-foreground">{claims.reason}</span>
      </span>
    );
  }
  const count = (label: Claim["label"]) => claims.claims.filter((c) => c.label === label).length;
  return (
    <span>
      <span className="font-mono">{claims.claims.length}</span> {claims.claims.length === 1 ? "claim" : "claims"}:{" "}
      <span className="font-mono">{count("supported")}</span> supported, <span className={`font-mono ${count("unsupported") > 0 ? "text-fail" : ""}`}>{count("unsupported")}</span>{" "}
      unsupported, <span className={`font-mono ${count("contradicted") > 0 ? "text-fail" : ""}`}>{count("contradicted")}</span> contradicted
      <span className="text-muted-foreground">
        {" "}
        · read by <span className="font-mono">{claims.model}</span>, prompt <span className="font-mono">claims {claims.promptVersion}</span>; each is listed under its reply
      </span>
    </span>
  );
}
