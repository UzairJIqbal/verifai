"use client";

import { useSyncExternalStore } from "react";

// The words live here, in the browser's code, not in what the server sends.
const MESSAGES = {
  runs: "Loading the runs…",
  run: "Loading the run…",
  trajectory: "Loading the trajectory…",
  tasks: "Loading the tasks…",
  batch: "Reading the batch…",
  batches: "Reading the traffic batches…",
  conversation: "Reading the conversation…",
  notes: "Reading your notes…",
  failures: "Reading the failure notes…",
  gates: "Reading the gate records…",
  versions: "Reading the promoted versions…",
  nextFailure: "Finding the next failure to review…",
  nextTrial: "Finding the next trial to label…",
} as const;

const subscribe = () => () => {};

// Loading text appears only in the browser, while the data is still on its
// way. The server HTML never carries it: a crawler that doesn't run JavaScript
// would otherwise read "Loading…" as the first thing on the page.
export function LoadingText({ what }: { what: keyof typeof MESSAGES }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return inBrowser ? <p className="text-muted-foreground">{MESSAGES[what]}</p> : null;
}
