import { parseExport } from "../../src/lib/import/parse-export.ts";
import type { ImportRow } from "../../src/lib/import/parse-export.ts";
import { makeSample, SAMPLE_SETUP, type Sample } from "../../src/lib/sample/sample-export.ts";
import { type AccountGroup, EMPTY_SETUP, type OwnerGroups, type Setup } from "../../src/lib/setup/setup.ts";
import { workbook, type RowOverrides, row } from "./import-helpers.ts";

/** The sample's setup answers in the form the metrics read, without touching a database. */
export function sampleSetup(): Setup {
  return {
    saved: true,
    groups: new Map(SAMPLE_SETUP.accountGroups.map(({ account, group }) => [account, group as AccountGroup])),
    income: ownerGroups(SAMPLE_SETUP.incomeGroups),
    expense: ownerGroups(SAMPLE_SETUP.expenseGroups),
  };
}

/** Owner groups given by name, as the metrics read them. */
export function ownerGroups(list: { names: readonly string[]; placed: ReadonlyArray<{ category: string; group: string }> }): OwnerGroups {
  return { names: [...list.names], placed: new Map(list.placed.map(({ category, group }) => [category, list.names.indexOf(group)])) };
}

export async function loadSample(): Promise<{ sample: Sample; rows: ImportRow[]; setup: Setup }> {
  const sample = makeSample();
  const { rows } = await parseExport(sample.bytes);
  return { sample, rows, setup: sampleSetup() };
}

export async function rowsFrom(overrides: readonly RowOverrides[]): Promise<ImportRow[]> {
  return (await parseExport(workbook(overrides.map((item) => row(item))))).rows;
}

export function setupWith(changes: Partial<Setup>): Setup {
  return { ...EMPTY_SETUP, saved: true, ...changes };
}
