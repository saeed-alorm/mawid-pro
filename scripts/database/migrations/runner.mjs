import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { MAINTENANCE_LOCK } from "../maintenance/worker.mjs";
export const FIXTURE_MARKER = "mawid-fictional-local-fixture-v1";
const LEDGER = "mawid_fixture_migrations";
const LEDGER_MARKER = "mawid-local-migration-journal-v1";
export class LocalMigrationError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.code = code;
    Object.assign(this, details);
  }
}
// Recognize top-level statements without treating comments or function/string bodies
// as executable transaction control. This is a safety check for trusted SQL, not a sandbox.
export function assertTransactionalSql(sql) {
  let plain = "",
    i = 0;
  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i + 2);
      i = end < 0 ? sql.length : end + 1;
      plain += " ";
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) {
          depth++;
          i += 2;
        } else if (sql.startsWith("*/", i)) {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) throw new LocalMigrationError("MIGRATION_SQL_UNTERMINATED");
      plain += " ";
      continue;
    }
    const c = sql[i];
    if (c === "'" || c === '"') {
      const escape =
        c === "'" && /[eE]/.test(sql[i - 1] ?? "") && !/[a-zA-Z0-9_$]/.test(sql[i - 2] ?? "");
      i++;
      let closed = false;
      while (i < sql.length) {
        if (escape && sql[i] === "\\") {
          i += 2;
          continue;
        }
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      if (!closed) throw new LocalMigrationError("MIGRATION_SQL_UNTERMINATED");
      plain += " ? ";
      continue;
    }
    if (c === "$") {
      const tag = /^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        if (end < 0) throw new LocalMigrationError("MIGRATION_SQL_UNTERMINATED");
        i = end + tag.length;
        plain += " ? ";
        continue;
      }
    }
    plain += c;
    i++;
  }
  for (const statement of plain
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (
      /^(BEGIN|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE|DISCARD)\b|^START\s+TRANSACTION\b|^PREPARE\s+TRANSACTION\b|^(SET|RESET)\s+(SESSION\s+AUTHORIZATION|ROLE)\b/i.test(
        statement,
      )
    )
      throw new LocalMigrationError("MIGRATION_TRANSACTION_CONTROL");
    if (
      /^VACUUM\b|^(CREATE|DROP)\s+DATABASE\b|^ALTER\s+SYSTEM\b|^(CREATE\s+(UNIQUE\s+)?INDEX|DROP\s+INDEX)\s+CONCURRENTLY\b|^REINDEX\b.*\bCONCURRENTLY\b/i.test(
        statement,
      )
    )
      throw new LocalMigrationError("MIGRATION_NONTRANSACTIONAL_SQL");
  }
}
export function prepareManifest(entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    throw new LocalMigrationError("MIGRATION_MANIFEST_INVALID");
  let previous = "";
  return entries.map((entry) => {
    const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(entry.name ?? "");
    if (
      !match ||
      match[1] <= previous ||
      typeof entry.sql !== "string" ||
      entry.sql.trim() === "" ||
      Buffer.byteLength(entry.sql) > 5 * 1024 * 1024
    )
      throw new LocalMigrationError("MIGRATION_MANIFEST_INVALID");
    if (Buffer.from(entry.sql, "utf8").toString("utf8") !== entry.sql)
      throw new LocalMigrationError("MIGRATION_SOURCE_ENCODING");
    previous = match[1];
    assertTransactionalSql(entry.sql);
    return {
      name: entry.name,
      version: match[1],
      sql: entry.sql,
      sha256: createHash("sha256").update(entry.sql).digest("hex"),
    };
  });
}
export function readLocalMigrations(directory) {
  return prepareManifest(
    readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => {
        const bytes = readFileSync(path.join(directory, name));
        const sql = bytes.toString("utf8");
        if (!Buffer.from(sql, "utf8").equals(bytes))
          throw new LocalMigrationError("MIGRATION_SOURCE_ENCODING");
        return { name, sql };
      }),
  );
}
function localPool(pool) {
  const c = pool?.options;
  if (
    c?.host !== "127.0.0.1" ||
    c.user !== "postgres" ||
    c.ssl !== false ||
    !Number.isInteger(c.port) ||
    c.port < 1 ||
    c.port > 65535 ||
    !/^mawid_local_data_[a-f0-9]+$/.test(c.database) ||
    c.connectionString
  )
    throw new LocalMigrationError("LOCAL_MIGRATION_TARGET_REQUIRED");
}
async function bootstrap(client) {
  const {
    rows: [schema],
  } = await client.query(
    "SELECT obj_description(oid,'pg_namespace') AS marker FROM pg_namespace WHERE nspname=$1",
    [LEDGER],
  );
  if (schema && schema.marker !== LEDGER_MARKER)
    throw new LocalMigrationError("MIGRATION_LEDGER_COLLISION");
  if (!schema) {
    await client.query(
      "CREATE SCHEMA mawid_fixture_migrations; REVOKE ALL ON SCHEMA mawid_fixture_migrations FROM PUBLIC;",
    );
    await client.query(
      "COMMENT ON SCHEMA mawid_fixture_migrations IS 'mawid-local-migration-journal-v1'; CREATE TABLE mawid_fixture_migrations.applied(version text PRIMARY KEY,name text NOT NULL UNIQUE,sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),applied_at timestamptz NOT NULL DEFAULT clock_timestamp()); ALTER TABLE mawid_fixture_migrations.applied ENABLE ROW LEVEL SECURITY; ALTER TABLE mawid_fixture_migrations.applied FORCE ROW LEVEL SECURITY;",
    );
  }
  return (
    await client.query(
      "SELECT version,name,sha256 FROM mawid_fixture_migrations.applied ORDER BY version",
    )
  ).rows;
}
function checkHistory(applied, manifest) {
  if (applied.length > manifest.length) throw new LocalMigrationError("MIGRATION_HISTORY_DIVERGED");
  for (let i = 0; i < applied.length; i++) {
    if (applied[i].version !== manifest[i].version || applied[i].name !== manifest[i].name)
      throw new LocalMigrationError("MIGRATION_HISTORY_DIVERGED");
    if (applied[i].sha256 !== manifest[i].sha256)
      throw new LocalMigrationError("MIGRATION_CHECKSUM_MISMATCH", {
        failed_name: manifest[i].name,
      });
  }
}
export async function applyLocalMigrations(pool, entries, { dryRun = false } = {}) {
  localPool(pool);
  const manifest = prepareManifest(entries);
  const committed = [];
  let client,
    held = false,
    broken = false,
    transaction = false,
    current;
  const connectionError = () => {
    broken = true;
  };
  try {
    client = await pool.connect();
    client.on("error", connectionError);
    const {
      rows: [identity],
    } = await client.query(
      "SELECT current_database() AS database,current_user AS actor,(SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database()) AS marker",
    );
    if (
      identity.database !== pool.options.database ||
      identity.actor !== "postgres" ||
      identity.marker !== FIXTURE_MARKER
    )
      throw new LocalMigrationError("LOCAL_MIGRATION_TARGET_REQUIRED");
    const {
      rows: [lock],
    } = await client.query("SELECT pg_try_advisory_lock($1,$2) AS acquired", MAINTENANCE_LOCK);
    if (!lock.acquired) throw new LocalMigrationError("MIGRATION_BUSY");
    held = true;
    await client.query("BEGIN");
    transaction = true;
    const applied = await bootstrap(client);
    checkHistory(applied, manifest);
    const pending = manifest.slice(applied.length);
    for (let i = 0; i < pending.length; i++) {
      current = pending[i];
      if (i > 0 && !dryRun) {
        await client.query("BEGIN");
        transaction = true;
      }
      await client.query(
        "SET LOCAL lock_timeout='2s'; SET LOCAL statement_timeout='30s'; SET LOCAL standard_conforming_strings=on; SET LOCAL application_name='mawid-local-migration-runner';",
      );
      await client.query(current.sql);
      await client.query(
        "INSERT INTO mawid_fixture_migrations.applied(version,name,sha256) VALUES($1,$2,$3)",
        [current.version, current.name, current.sha256],
      );
      if (!dryRun) {
        await client.query("COMMIT");
        transaction = false;
        committed.push(current.name);
      }
    }
    const inventory = (
      await client.query(
        "SELECT (SELECT count(*)::integer FROM information_schema.tables WHERE table_schema='mawid_core') AS core_tables,(SELECT count(*)::integer FROM mawid_fixture_migrations.applied) AS journal_entries",
      )
    ).rows[0];
    if (transaction) {
      await client.query("ROLLBACK");
      transaction = false;
    }
    return {
      mode: dryRun ? "dry_run" : "applied",
      previously_applied: applied.length,
      applied: committed,
      would_apply: dryRun ? pending.map((m) => m.name) : [],
      inventory,
    };
  } catch (error) {
    if (client && transaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        broken = true;
      }
      transaction = false;
    }
    if (error instanceof LocalMigrationError) throw error;
    throw new LocalMigrationError(dryRun ? "MIGRATION_DRY_RUN_FAILED" : "MIGRATION_APPLY_FAILED", {
      failed_name: current?.name ?? null,
      committed: [...committed],
      sqlstate: /^[A-Z0-9]{5}$/.test(error.code) ? error.code : null,
    });
  } finally {
    if (client && held) {
      try {
        const {
          rows: [lock],
        } = await client.query("SELECT pg_advisory_unlock($1,$2) AS released", MAINTENANCE_LOCK);
        if (!lock.released) broken = true;
      } catch {
        broken = true;
      }
    }
    if (client) {
      if (broken) client.once("end", () => client.off("error", connectionError));
      client.release(broken);
      if (!broken) client.off("error", connectionError);
    }
  }
}
