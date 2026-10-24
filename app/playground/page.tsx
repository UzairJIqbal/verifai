import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, PageHeading } from "@/components/shell/empty-state";
import { Playground, type PlaygroundMeta, type TaskPreset } from "@/components/playground/playground";
import { loadConfig } from "@/src/config";
import { firstInPool, providerLabel } from "@/src/agent/model";
import { getShopToday, SEED_DB_PATH } from "@/src/shop/db";
import { isLocalOnlyEnabled } from "@/src/local";
import { listPickableCustomers, type PickableCustomer } from "@/src/playground/snapshot";
import { loadTasks } from "@/src/tasks/load";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Playground" };

export default function PlaygroundPage({ searchParams }: PageProps<"/playground">) {
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
      <LivePlayground searchParams={searchParams} />
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
        providerLabel: providerLabel(firstInPool(config).provider),
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
async function LivePlayground({ searchParams }: { searchParams: PageProps<"/playground">["searchParams"] }) {
  await connection();
  const loaded = load();
  const taskParam = (await searchParams).task;
  const task = typeof taskParam === "string" ? loadPreset(taskParam) : undefined;
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
  // Keyed by task, so opening another task starts clean instead of keeping
  // the previous visit's conversation.
  return <Playground key={taskParam?.toString() ?? ""} meta={loaded.meta} customers={loaded.customers} task={task} />;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

// A dev task's opening, ready to send. Only dev tasks: the loader never hands
// out the holdout here, so asking for one by id finds nothing.
function loadPreset(id: string): TaskPreset {
  try {
    const task = loadTasks().tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: `There's no dev task called ${id}. Pick one from the Tasks page.` };
    const email = [task.first_message, ...task.canned_replies].map((text) => EMAIL.exec(text)?.[0]).find((e) => e !== undefined);
    return { ok: true, id: task.id, firstMessage: task.first_message, cannedReplies: task.canned_replies, email: email ?? "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
