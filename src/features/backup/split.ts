import type { ExportFile } from "@/lib/docs";

/** Roughly how big each import request may be (the server accepts up to 4 MB). */
export const PART_BYTES = 1_500_000;

/**
 * Splits an export file into several smaller export files with the same
 * format, so big backups can be imported in parts.
 */
export function splitExport(file: ExportFile, maxBytes = PART_BYTES): ExportFile[] {
  const parts: ExportFile[] = [];
  let current: ExportFile = { ...file, collections: {} };
  let size = 0;
  let count = 0;
  for (const [c, docs] of Object.entries(file.collections ?? {})) {
    for (const [id, data] of Object.entries(docs ?? {})) {
      const bytes = JSON.stringify(data ?? null).length + id.length + 8;
      if (count > 0 && size + bytes > maxBytes) {
        parts.push(current);
        current = { ...file, collections: {} };
        size = 0;
        count = 0;
      }
      const key = c as keyof ExportFile["collections"];
      (current.collections[key] ??= {})[id] = data;
      size += bytes;
      count++;
    }
  }
  if (count > 0 || parts.length === 0) parts.push(current);
  return parts;
}
