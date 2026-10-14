import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PROJECT_ROOT } from "../config";

// The seeded shop. The agent never touches this file; it only ever gets a copy.
export const SEED_DB_PATH = join(PROJECT_ROOT, "data", "shop.db");

export type Shop = { db: DatabaseSync; dispose: () => void };

// Every chat (and later every try) gets its own copy, so nothing one
// conversation changes can leak into the next one's starting state.
export function openFreshShop(seedPath: string = SEED_DB_PATH): Shop {
  // The seed is never part of the deployed site (the playground is local only),
  // so the build mustn't trace files from this path.
  if (!existsSync(/*turbopackIgnore: true*/ seedPath)) {
    throw new Error("The shop hasn't been seeded yet. Run `pnpm seed` first.");
  }
  const dir = mkdtempSync(join(tmpdir(), "verifai-shop-"));
  const path = join(dir, "shop.db");
  copyFileSync(seedPath, path);
  const db = new DatabaseSync(path);
  return {
    db,
    dispose: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const todaySchema = z.object({ value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export function getShopToday(db: DatabaseSync): string {
  const row = db.prepare("SELECT value FROM shop_meta WHERE key = 'today'").get();
  const parsed = todaySchema.safeParse(row);
  if (!parsed.success) throw new Error("The shop database has no valid 'today' date. Run `pnpm seed` again.");
  return parsed.data.value;
}
