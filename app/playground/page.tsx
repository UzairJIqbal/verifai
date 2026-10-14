import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { Playground, type PlaygroundMeta } from "@/components/playground/playground";
import { loadConfig } from "@/src/config";
import { agentProvider } from "@/src/agent/model";
import { getShopToday, SEED_DB_PATH } from "@/src/shop/db";
import { isLocalOnlyEnabled } from "@/src/local";
import { listPickableCustomers, type PickableCustomer } from "@/src/playground/snapshot";

export default function PlaygroundPage() {
  if (!isLocalOnlyEnabled()) {
    return (
      <EmptyState title="The playground only runs on your own machine.">
        It talks to the model, which spends calls from a daily limit, so it&apos;s turned off on the deployed site. Clone
        the repository and run <code>pnpm dev</code> to use it.
      </EmptyState>
    );
  }
  return (
    <Suspense fallback={<p className="text-muted-foreground">Opening the playground…</p>}>
      <LivePlayground />
    </Suspense>
  );
}

type Loaded = { ok: true; meta: PlaygroundMeta; customers: PickableCustomer[] } | { ok: false; error: string };

function load(): Loaded {
  try {
    const config = loadConfig();
    if (!existsSync(SEED_DB_PATH)) return { ok: false, error: "The shop hasn't been seeded yet. Run `pnpm seed`, then reload this page." };
    const seed = new DatabaseSync(SEED_DB_PATH, { readOnly: true });
    let today: string;
    try {
      today = getShopToday(seed);
    } finally {
      seed.close();
    }
    return {
      ok: true,
      meta: {
        providerLabel: agentProvider(config).label,
        model: config.agent.model,
        promptVersion: config.promptVersion,
        toolDescriptionsVersion: config.toolDescriptionsVersion,
        maxSteps: config.agent.maxSteps,
        today,
      },
      customers: listPickableCustomers(),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Read at request time, so the versions shown are the ones the next message
// will use, and a fresh `pnpm seed` shows up on reload.
async function LivePlayground() {
  await connection();
  const loaded = load();
  if (!loaded.ok) {
    return (
      <>
        <PageHeading title="Playground" />
        <div className="rounded-lg border border-fail/40 px-5 py-6">
          <p className="font-medium text-fail">The playground can&apos;t start.</p>
          <p className="mt-1 max-w-prose whitespace-pre-wrap text-muted-foreground">{loaded.error}</p>
        </div>
      </>
    );
  }
  return <Playground meta={loaded.meta} customers={loaded.customers} />;
}
