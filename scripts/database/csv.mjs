import { createHash } from "node:crypto";
const columns = {
  customers: ["external_key", "display_name", "contact"],
  professionals: ["external_key", "display_name"],
  services: ["external_key", "name", "duration_minutes", "buffer_before", "buffer_after"],
  openings: ["external_key", "weekday", "opens", "closes"],
};
export function parseImport(bytes, kind) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > 5 * 1024 * 1024)
    throw new Error("FILE_LIMIT");
  let source;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    throw new Error("INVALID_UTF8");
  }
  if (source.includes("\0") || !columns[kind]) throw new Error("INVALID_INPUT");
  const records = [];
  let row = [],
    field = "",
    quoted = false,
    closed = false;
  const cell = () => {
    row.push(field);
    field = "";
    closed = false;
  };
  const record = () => {
    cell();
    records.push(row);
    row = [];
    if (records.length > 1001) throw new Error("ROW_LIMIT");
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
      continue;
    }
    if (c === ",") {
      cell();
      continue;
    }
    if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i++;
      record();
      continue;
    }
    if (closed) throw new Error("INVALID_CSV");
    if (c === '"') {
      if (field) throw new Error("INVALID_CSV");
      quoted = true;
    } else field += c;
  }
  if (quoted) throw new Error("INVALID_CSV");
  if (field || row.length || closed) record();
  const header = records.shift();
  if (
    !header ||
    new Set(header).size !== header.length ||
    header.some((x) => !columns[kind].includes(x)) ||
    !header.includes("external_key")
  )
    throw new Error("INVALID_COLUMNS");
  const required = columns[kind].filter(
    (x) => !["contact", "buffer_before", "buffer_after"].includes(x),
  );
  if (required.some((x) => !header.includes(x)) || records.length < 1)
    throw new Error("MISSING_FIELDS");
  const rows = records.map((r) => {
    if (r.length !== header.length) throw new Error("INVALID_ROW");
    return Object.fromEntries(header.map((h, i) => [h, r[i]]));
  });
  return { fileSha256: createHash("sha256").update(bytes).digest("hex"), rows };
}
export function exportCsv(columns, rows) {
  const cell = (value) => {
    let s = String(value ?? "");
    if (/^[\s\uFEFF]*[=+\-@]/u.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    [columns, ...rows.map((row) => columns.map((c) => row[c]))]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
