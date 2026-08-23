import type { SyncItem, MediaKind } from "./types";

/**
 * Quote-aware CSV row splitter (RFC 4180-ish): handles embedded commas,
 * "" escaped quotes, and newlines inside quoted fields.
 *
 * The legacy implementation (index.html:4042) was double-escaped —
 * `text.split('\\n')` split on a literal backslash-n and the field regex
 * used `\\s` — so the whole file was read as a single line and the parsed
 * count was always zero. This is the fix.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Strip a UTF-8 BOM — IMDb exports include one.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Swallow the \n of a \r\n pair.
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim().length));
}

export interface CsvParseResult {
  items: SyncItem[];
  error?: string;
}

/**
 * Maps an IMDb watchlist/ratings export to library items.
 * Column names match the IMDb export header: `Const`, `Title`, `Title Type`.
 */
export function parseImdbCsv(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { items: [], error: "The file has no data rows." };
  }

  const header = rows[0].map((c) => c.trim().toLowerCase());
  const idIdx = header.indexOf("const");
  const titleIdx = header.indexOf("title");
  const typeIdx = header.indexOf("title type");

  if (idIdx === -1 || titleIdx === -1) {
    return {
      items: [],
      error: "Missing the 'Const' or 'Title' column — is this an IMDb export?",
    };
  }

  const seen = new Set<string>();
  const items: SyncItem[] = [];

  for (const row of rows.slice(1)) {
    const id = row[idIdx]?.trim();
    const title = row[titleIdx]?.trim();
    if (!id?.startsWith("tt") || !title || seen.has(id)) continue;

    const rawType = (typeIdx > -1 ? row[typeIdx] : "").toLowerCase();
    // IMDb uses "TV Series", "TV Mini Series", "TV Episode" — all series to Stremio.
    const type: MediaKind = /series|episode/.test(rawType) ? "series" : "movie";

    seen.add(id);
    items.push({ id, title, type });
  }

  if (!items.length) {
    return { items: [], error: "No valid IMDb IDs found in the file." };
  }

  return { items };
}
