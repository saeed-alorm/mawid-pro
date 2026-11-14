import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertTransactionalSql,
  prepareManifest,
  applyLocalMigrations,
  readLocalMigrations,
} from "./runner.mjs";
const entry = (name = "20990101000001_fixture.sql", sql = "SELECT 1;") => ({ name, sql });
test("transaction control is rejected even after comments and prior statements", () => {
  for (const sql of [
    "BEGIN;",
    "SELECT 1;COMMIT;",
    "-- comment\n ROLLBACK;",
    "/* nested /* comment */ */ END;",
    "START TRANSACTION;",
    "PREPARE TRANSACTION 'x';",
    "SAVEPOINT x;",
    "RELEASE x;",
    "SET ROLE postgres;",
    "RESET ROLE;",
    "DISCARD ALL;",
  ])
    assert.throws(() => assertTransactionalSql(sql), { code: "MIGRATION_TRANSACTION_CONTROL" });
});
test("SQL bodies, strings, quoted identifiers and nested comments are not top-level commands", () => {
  for (const sql of [
    "SELECT 'COMMIT; ROLLBACK;';",
    "CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE NOTICE 'COMMIT;'; END; $$;",
    "DO $body$ BEGIN PERFORM 'ROLLBACK;'; END $body$;",
    'SELECT "COMMIT;"; /* outer /* COMMIT; */ END; */',
    "SELECT E'escaped\\\' COMMIT;'; SELECT 1;",
  ])
    assert.doesNotThrow(() => assertTransactionalSql(sql));
});
test("unterminated SQL cannot hide transaction boundaries", () => {
  for (const sql of ["SELECT 'x", "DO $$ BEGIN END;", "/* comment", 'SELECT "field'])
    assert.throws(() => assertTransactionalSql(sql), { code: "MIGRATION_SQL_UNTERMINATED" });
});
test("nontransactional operations are refused by the atomic runner", () => {
  for (const sql of [
    "VACUUM mawid_core.bookings;",
    "CREATE INDEX CONCURRENTLY idx ON t(x);",
    "CREATE UNIQUE INDEX CONCURRENTLY idx ON t(x);",
    "DROP INDEX CONCURRENTLY idx;",
    "CREATE DATABASE test;",
    "ALTER SYSTEM SET x=1;",
  ])
    assert.throws(() => assertTransactionalSql(sql), { code: "MIGRATION_NONTRANSACTIONAL_SQL" });
});
test("manifests require unique strictly ordered versions and safe filenames", () => {
  for (const entries of [
    [],
    [entry("../bad.sql")],
    [entry(), entry()],
    [entry("20990101000002_second.sql"), entry()],
    [entry("20990101000001_one.sql"), entry("20990101000001_two.sql")],
    [entry(undefined, "")],
  ])
    assert.throws(() => prepareManifest(entries), { code: "MIGRATION_MANIFEST_INVALID" });
});
test("checksums bind exact migration bytes", () => {
  const first = prepareManifest([entry()])[0];
  const changed = prepareManifest([entry(undefined, "SELECT 1;\r\n")])[0];
  assert.match(first.sha256, /^[a-f0-9]{64}$/);
  assert.notEqual(first.sha256, changed.sha256);
});
test("unsafe database targets fail before a connection is attempted", async () => {
  for (const options of [
    {
      host: "hosted.invalid",
      port: 5432,
      user: "postgres",
      ssl: false,
      database: "mawid_local_data_abc",
    },
    { host: "127.0.0.1", port: 5432, user: "postgres", ssl: false, database: "production" },
    {
      host: "127.0.0.1",
      port: 5432,
      user: "mawid_fixture_manager_a",
      ssl: false,
      database: "mawid_local_data_abc",
    },
  ]) {
    let connected = false;
    await assert.rejects(
      () =>
        applyLocalMigrations(
          {
            options,
            connect() {
              connected = true;
            },
          },
          [entry()],
        ),
      { code: "LOCAL_MIGRATION_TARGET_REQUIRED" },
    );
    assert.equal(connected, false);
  }
});

test("file hashing rejects invalid UTF-8 and preserves BOM and line endings", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mawid-migration-bytes-"));
  const file = path.join(directory, "20990101000001_fixture.sql");
  try {
    writeFileSync(file, Buffer.from([255]));
    assert.throws(() => readLocalMigrations(directory), { code: "MIGRATION_SOURCE_ENCODING" });
    const bytes = Buffer.from("\ufeffSELECT 1;\r\n", "utf8");
    writeFileSync(file, bytes);
    assert.equal(
      readLocalMigrations(directory)[0].sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
});
