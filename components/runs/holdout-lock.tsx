// Why a holdout try shows nothing but its outcome.
export function HoldoutLock() {
  return (
    <div className="rounded-lg border border-dashed px-5 py-6">
      <p className="font-medium">Holdout trajectories are locked.</p>
      <p className="mt-1 max-w-prose text-muted-foreground">
        The holdout is kept back to judge a version of the agent fairly at the release gate. Reading what the agent did on it would
        leak into the next fix, so only whether each try passed is saved. The trajectories open once this version is promoted.
      </p>
    </div>
  );
}
