// Langfuse, for looking at tries. Each try becomes one trace with a span per
// model call and per tool call, built from the steps already saved, so the
// trace shows exactly what the store holds and nothing is read back from it.
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, setLangfuseTracerProvider, startObservation } from "@langfuse/tracing";
import { node } from "@opentelemetry/sdk-node";
import { z } from "zod";
import { readOptionalEnv } from "../config";
import type { Step, RecordedTrial } from "../results/schema";
import type { Task } from "../tasks/schema";
import type { Redact } from "./redact";
import type { RunConfig } from "./store";
import type { TrialTracer } from "./runner";

export const LANGFUSE_ENV = { publicKey: "LANGFUSE_PUBLIC_KEY", secretKey: "LANGFUSE_SECRET_KEY", baseUrl: "LANGFUSE_BASE_URL" } as const;
const DEFAULT_BASE_URL = "https://cloud.langfuse.com";

export type Tracing =
  | { on: true; tracerFor: (runId: string, config: RunConfig) => TrialTracer; shutdown: () => Promise<void> }
  | { on: false; reason: string };

export function langfuseSecrets(): (string | undefined)[] {
  return [readOptionalEnv(LANGFUSE_ENV.publicKey), readOptionalEnv(LANGFUSE_ENV.secretKey)];
}

const projectsSchema = z.object({ data: z.array(z.object({ id: z.string() })).min(1) });

// Checks the keys and finds the project, whose id the trace links need.
async function findProject(baseUrl: string, publicKey: string, secretKey: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/public/projects`, {
      headers: { Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error(`couldn't reach Langfuse at ${baseUrl}. Check ${LANGFUSE_ENV.baseUrl} and your connection.`);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(`Langfuse refused the keys. Check ${LANGFUSE_ENV.publicKey} and ${LANGFUSE_ENV.secretKey} in .env.local.`);
  }
  if (!response.ok) throw new Error(`Langfuse answered ${response.status} when asked for the project.`);
  const parsed = projectsSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Langfuse's answer about the project wasn't in the expected shape.");
  return parsed.data.data[0].id;
}

export async function startTracing(redact: Redact): Promise<Tracing> {
  const publicKey = readOptionalEnv(LANGFUSE_ENV.publicKey);
  const secretKey = readOptionalEnv(LANGFUSE_ENV.secretKey);
  const baseUrl = (readOptionalEnv(LANGFUSE_ENV.baseUrl) ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!publicKey || !secretKey) {
    return { on: false, reason: `${LANGFUSE_ENV.publicKey} and ${LANGFUSE_ENV.secretKey} aren't set in .env.local` };
  }
  let projectId: string;
  try {
    projectId = await findProject(baseUrl, publicKey, secretKey);
  } catch (error) {
    return { on: false, reason: error instanceof Error ? error.message : String(error) };
  }

  const processor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    // Every value sent passes through the same redaction as the store.
    mask: ({ data }: { data: unknown }) => (typeof data === "string" ? redact(data) : data),
  });
  const provider = new node.NodeTracerProvider({ spanProcessors: [processor] });
  // Registering gives OpenTelemetry a context manager, which the trace-level
  // attributes (name, tags) need to reach every span of a try.
  provider.register();
  setLangfuseTracerProvider(provider);

  return {
    on: true,
    tracerFor: (runId, config) => (trial, task) => traceTrial(runId, config, trial, task, `${baseUrl}/project/${projectId}/traces`),
    shutdown: async () => {
      await provider.forceFlush();
      await provider.shutdown();
    },
  };
}

// The text and tool calls that came out of each model call, which follow its
// "model" step until the next one.
function outputsOf(steps: Step[], index: number): { text: string; toolCalls: { name: string; input: unknown }[] } {
  const out = { text: "", toolCalls: [] as { name: string; input: unknown }[] };
  for (const step of steps.slice(index + 1)) {
    if (step.type === "model" || step.type === "customer") break;
    if (step.type === "text") out.text += step.text;
    if (step.type === "tool-call") out.toolCalls.push({ name: step.toolName, input: step.input });
  }
  return out;
}

function traceTrial(runId: string, config: RunConfig, trial: RecordedTrial, task: Task, tracesUrl: string): string {
  const versions = {
    prompt: config.promptVersion,
    tools: config.toolDescriptionsVersion,
    dataset: config.datasetVersion,
    ...(config.validation ? { validation: config.validation } : {}),
    ...(config.exemplars ? { exemplars: config.exemplars.storeHash } : {}),
  };
  const knobs = [...(config.validation ? [`validation:${config.validation}`] : []), ...(config.exemplars ? ["exemplars"] : [])];
  return propagateAttributes(
    {
      traceName: `${trial.taskId} · try ${trial.tryNumber}`,
      sessionId: runId,
      version: `prompt ${versions.prompt} · tools ${versions.tools}${knobs.length > 0 ? ` · ${knobs.join(" · ")}` : ""}`,
      tags: [`run:${runId}`, `task:${trial.taskId}`, `try:${trial.tryNumber}`, `prompt:${versions.prompt}`, `tools:${versions.tools}`, `dataset:${versions.dataset}`, ...knobs, ...(config.smoke ? ["smoke"] : []), trial.status],
      metadata: { run: runId, task: trial.taskId, try: String(trial.tryNumber), ...versions, model: config.agent.model },
    },
    () => {
      const root = startObservation(
        "try",
        {
          input: task.first_message,
          output: { status: trial.status, end: trial.end, error: trial.error, verdicts: trial.verdicts },
          level: trial.status === "errored" ? "ERROR" : "DEFAULT",
        },
        { startTime: new Date(trial.startedAt) },
      );
      const parentSpanContext = root.otelSpan.spanContext();
      const calls = new Map(trial.steps.flatMap((s) => (s.type === "tool-call" ? [[s.toolCallId, s.input] as const] : [])));

      trial.steps.forEach((step, index) => {
        if (step.type === "customer") {
          // Customer messages carry no time of their own; place each just
          // before the model call that answers it.
          const next = trial.steps.slice(index).find((s) => s.type === "model");
          const at = new Date(next?.type === "model" ? next.startedAt : trial.startedAt);
          startObservation("customer", { input: step.text }, { asType: "event", startTime: at, parentSpanContext }).end(at);
        } else if (step.type === "model") {
          const fresh = step.usage.inputTokens - step.usage.cachedInputTokens;
          startObservation(
            `model · step ${step.step}`,
            {
              model: config.agent.model,
              modelParameters: { temperature: config.agent.temperature },
              output: outputsOf(trial.steps, index),
              usageDetails: { input: fresh, input_cached_tokens: step.usage.cachedInputTokens, output: step.usage.outputTokens },
              costDetails: { total: step.costUsd },
              metadata: { provider: step.provider, replayedFromCache: step.cached },
            },
            { asType: "generation", startTime: new Date(step.startedAt), parentSpanContext },
          ).end(new Date(step.startedAt + step.latencyMs));
        } else if (step.type === "tool-result") {
          startObservation(
            step.toolName,
            {
              input: calls.get(step.toolCallId),
              output: step.outcome.ok ? step.outcome.value : { error: step.outcome.error },
              level: step.outcome.ok ? "DEFAULT" : "WARNING",
            },
            { asType: "tool", startTime: new Date(step.startedAt), parentSpanContext },
          ).end(new Date(step.startedAt + step.latencyMs));
        }
      });

      root.end(new Date(trial.finishedAt));
      return `${tracesUrl}/${root.traceId}`;
    },
  );
}
