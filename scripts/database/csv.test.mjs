import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImport, exportCsv } from "./csv.mjs";
const bytes = (s) => new TextEncoder().encode(s);
test("UTF-8 quoted commas, escaped quotes and multiline fields survive preview parsing", () => {
  const result = parseImport(
    bytes('external_key,display_name,contact\r\na,"عميل, ""خيالي""","line1\nline2"\r\n'),
    "customers",
  );
  assert.deepEqual(result.rows, [
    { external_key: "a", display_name: 'عميل, "خيالي"', contact: "line1\nline2" },
  ]);
  assert.match(result.fileSha256, /^[a-f0-9]{64}$/);
});
test("hash binds exact bytes even when parsed records match", () => {
  const a = parseImport(bytes("external_key,display_name\na,Test\n"), "customers");
  const b = parseImport(bytes("external_key,display_name\r\na,Test\r\n"), "customers");
  assert.deepEqual(a.rows, b.rows);
  assert.notEqual(a.fileSha256, b.fileSha256);
});
for (const text of [
  'external_key,display_name\na,"broken',
  'external_key,display_name\na,a"b',
  'external_key,display_name\na,"x"oops',
  "external_key,display_name\na,x,extra",
  "external_key,display_name,password\na,x,secret",
  "external_key,external_key\na,b",
  "external_key\na",
  "external_key,display_name\na,\0",
])
  test("reject malformed or unauthorized CSV: " + JSON.stringify(text), () =>
    assert.throws(() => parseImport(bytes(text), "customers")),
  );
test("invalid UTF-8 fails instead of replacing bytes", () =>
  assert.throws(() => parseImport(new Uint8Array([255]), "customers"), /INVALID_UTF8/));
test("row limit is enforced during parsing", () =>
  assert.throws(
    () => parseImport(bytes("external_key,display_name\n" + "a,x\n".repeat(1001)), "customers"),
    /ROW_LIMIT/,
  ));
test("byte limit precedes decoding", () =>
  assert.throws(() => parseImport(new Uint8Array(5242881), "customers"), /FILE_LIMIT/));
test("formula triggers, whitespace prefixes and quotes are escaped on export", () => {
  for (const value of ["=1", "+1", "-1", "@sum(A1)", " \t=1", "\ttext", "\rtext", "\ntext"])
    assert.ok(
      exportCsv(["name"], [{ name: value }])
        .split("\r\n")[1]
        .startsWith("\"'"),
    );
  assert.equal(exportCsv(["name"], [{ name: 'a"b' }]), '"name"\r\n"a""b"\r\n');
});
