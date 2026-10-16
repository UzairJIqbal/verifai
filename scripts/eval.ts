// `pnpm eval`: every dev task, 4 tries each, a few at a time, every step saved.
// Stops cleanly at the daily limit (or Ctrl-C); running it again carries the
// same run on from the next unfinished try. The holdout is never loaded here.
//
//   pnpm eval              run, replaying any call already in the cache
//   pnpm eval --no-cache   send every call afresh
//   pnpm eval --smoke      only runner.smokeTasks, one dev task per category:
//                          checks the machinery, never a score
import { parseArgs } from "node:util";
import { executeRun, fatal, openSession } from "../src/eval/session";

function parseFlags(): { useCache: boolean; smoke: boolean } {
  try {
    const { values } = parseArgs({
      options: { "no-cache": { type: "boolean", default: false }, smoke: { type: "boolean", default: false } },
      strict: true,
    });
    return { useCache: !values["no-cache"], smoke: values.smoke };
  } catch (error) {
    fatal(`${error instanceof Error ? error.message : String(error)}\nUsage: pnpm eval [--smoke] [--no-cache]`);
  }
}

async function main(): Promise<void> {
  const { useCache, smoke } = parseFlags();
  const command = ["pnpm eval", smoke ? "--smoke" : "", useCache ? "" : "--no-cache"].filter(Boolean).join(" ");
  const session = await openSession({ useCache, smoke });
  const outcome = await executeRun(session, { title: smoke ? "smoke run" : "eval", command });
  if (!outcome.finished) process.exitCode = 1;
  await session.close();
}

void main();
