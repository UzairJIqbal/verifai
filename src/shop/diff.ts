// A whole-shop snapshot, and the difference between two of them. Taking a
// snapshot reads the database; comparing two is a pure function.
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

export type Cell = string | number | null;
export type Row = Record<string, Cell>;
export type TableDump = { primaryKey: string[]; rows: Row[] };
export type ShopDump = Record<string, TableDump>;

export type RowChange =
  | { kind: "insert"; table: string; key: Row; row: Row }
  | { kind: "update"; table: string; key: Row; before: Row; after: Row }
  | { kind: "delete"; table: string; key: Row; row: Row };

const cellSchema = z.union([z.string(), z.number(), z.null()]);
const rowSchema = z.record(z.string(), cellSchema);
const nameSchema = z.object({ name: z.string() });
const columnSchema = z.object({ name: z.string(), pk: z.number() });

// Every table, every row, read in primary-key order.
export function dumpShop(db: DatabaseSync): ShopDump {
  const tables = z
    .array(nameSchema)
    .parse(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all());
  const dump: ShopDump = {};
  for (const { name } of tables) {
    const columns = z.array(columnSchema).parse(db.prepare(`PRAGMA table_info("${name}")`).all());
    const primaryKey = columns
      .filter((c) => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((c) => c.name);
    if (primaryKey.length === 0) throw new Error(`Table ${name} has no primary key, so its rows can't be compared.`);
    const order = primaryKey.map((c) => `"${c}"`).join(", ");
    const rows = z.array(rowSchema).parse(db.prepare(`SELECT * FROM "${name}" ORDER BY ${order}`).all());
    dump[name] = { primaryKey, rows };
  }
  return dump;
}

const pick = (row: Row, columns: string[]): Row => Object.fromEntries(columns.map((c) => [c, row[c] ?? null]));
const keyOf = (row: Row, columns: string[]): string => JSON.stringify(columns.map((c) => row[c] ?? null));

// Every row added, removed or changed between `before` and `after`. An update
// carries only the columns that changed.
export function diffShops(before: ShopDump, after: ShopDump): RowChange[] {
  const changes: RowChange[] = [];
  for (const table of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    const primaryKey = after[table]?.primaryKey ?? before[table]?.primaryKey ?? [];
    const old = new Map((before[table]?.rows ?? []).map((row) => [keyOf(row, primaryKey), row]));
    const now = new Map((after[table]?.rows ?? []).map((row) => [keyOf(row, primaryKey), row]));
    for (const [id, row] of now) {
      const was = old.get(id);
      if (was === undefined) {
        changes.push({ kind: "insert", table, key: pick(row, primaryKey), row });
        continue;
      }
      const changed = Object.keys({ ...was, ...row }).filter((c) => (was[c] ?? null) !== (row[c] ?? null));
      if (changed.length > 0) {
        changes.push({ kind: "update", table, key: pick(row, primaryKey), before: pick(was, changed), after: pick(row, changed) });
      }
    }
    for (const [id, row] of old) {
      if (!now.has(id)) changes.push({ kind: "delete", table, key: pick(row, primaryKey), row });
    }
  }
  return changes;
}
