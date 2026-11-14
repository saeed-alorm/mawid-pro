import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalFixture, IDS, USERS, id, IMAGE } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalMaintenanceWorker, MAINTENANCE_LOCK } from "../maintenance/worker.mjs";
import { applyLocalMigrations, readLocalMigrations, FIXTURE_MARKER } from "./runner.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const source = readLocalMigrations(path.join(root, "supabase/migrations"));
let fixture,
  observer,
  service,
  server,
  worker,
  current = "setup";
const checks = [],
  temporary = [];
const q = async (sql, params = []) => (await fixture.admin.query(sql, params)).rows;
async function check(name, fn) {
  current = name;
  await fn();
  checks.push({ name, passed: true });
  console.log("PASS " + name);
}
const synthetic = (number, label, sql) => ({
  name: "2099010100" + String(number).padStart(4, "0") + "_" + label + ".sql",
  sql,
});
const seedFingerprint = async () =>
  (
    await q(
      "WITH original AS (SELECT 'profiles' AS kind,jsonb_build_array(workspace_id,customer_id,external_key,actor_id,display_name,contact,anonymized_at) AS payload FROM mawid_core.customer_profiles WHERE customer_id=ANY($1::uuid[]) UNION ALL SELECT 'bookings',to_jsonb(b) FROM mawid_core.bookings b WHERE booking_id=ANY($2::uuid[]) UNION ALL SELECT 'services',to_jsonb(s) FROM mawid_core.services s UNION ALL SELECT 'professionals',to_jsonb(p) FROM mawid_core.professionals p UNION ALL SELECT 'openings',to_jsonb(o) FROM mawid_core.opening_intervals o UNION ALL SELECT 'locations',to_jsonb(l) FROM mawid_core.locations l) SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(kind,payload) ORDER BY kind,payload::text)::text,'UTF8')),'hex') AS hash FROM original",
      [
        [IDS.customerA, IDS.customerB],
        [IDS.bookingA, IDS.bookingB],
      ],
    )
  )[0].hash;

const securityFingerprint = async () =>
  (
    await q(
      "WITH objects AS (SELECT 'table' AS kind,c.relname AS name,jsonb_build_array(c.relrowsecurity,c.relforcerowsecurity,c.relacl::text) AS value FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mawid_core' AND c.relkind='r' UNION ALL SELECT 'policy',c.relname||'.'||p.polname,jsonb_build_array(p.polcmd,p.polroles::text,pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid)) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mawid_core' UNION ALL SELECT 'function',p.proname||p.oid::text,jsonb_build_array(p.prosrc,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='mawid_core') SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(kind,name,value) ORDER BY kind,name)::text,'UTF8')),'hex') AS hash FROM objects",
    )
  )[0].hash;
const column = async (name) =>
  (
    await q(
      "SELECT column_default FROM information_schema.columns WHERE table_schema='mawid_core' AND table_name='customer_profiles' AND column_name=$1",
      [name],
    )
  )[0];
const history = async () =>
  q("SELECT version,name,sha256 FROM mawid_fixture_migrations.applied ORDER BY version");
async function readProfiles() {
  const response = await fetch(server.origin + "/v1/workspaces/" + IDS.workspaceA + "/profiles", {
    headers: { authorization: "Bearer " + service.issueSession(USERS.managerA).token },
  });
  assert.equal(response.status, 200);
  return response.json();
}
function ownerPool(database = fixture.admin.options.database) {
  const config = fixture.admin.options;
  return new Pool({
    host: config.host,
    port: config.port,
    ssl: false,
    user: "postgres",
    password: config.password,
    database,
    max: 1,
    idleTimeoutMillis: 500,
    connectionTimeoutMillis: 2000,
  });
}
async function freshDatabase() {
  const database = "mawid_local_data_" + randomBytes(8).toString("hex");
  await q('CREATE DATABASE "' + database + '"');
  await q('COMMENT ON DATABASE "' + database + "\" IS '" + FIXTURE_MARKER + "'");
  const pool = ownerPool(database);
  pool.on("error", () => {});
  temporary.push({ database, pool });
  return pool;
}
try {
  fixture = await createLocalFixture({ migrationCount: 1 });
  observer = ownerPool();
  observer.on("error", () => {});
  const initial = await seedFingerprint();
  await check("a previous synthetic schema has one committed migration journal row", async () => {
    assert.equal((await history()).length, 1);
    assert.equal((await history())[0].sha256, source[0].sha256);
  });
  await check("upgrade from the first real migration preserves both tenants data", async () => {
    const result = await applyLocalMigrations(fixture.admin, source);
    assert.equal(result.previously_applied, 1);
    assert.equal(result.applied.length, source.length - 1);
    assert.equal(await seedFingerprint(), initial);
  });
  await check("an already-applied exact manifest is a no-op", async () =>
    assert.deepEqual((await applyLocalMigrations(fixture.admin, source)).applied, []),
  );
  await check("changed applied migration bytes are refused without database writes", async () => {
    const before = await history();
    const edited = source.map((m, i) =>
      i === 0 ? { ...m, sql: m.sql + "\n-- changed applied bytes\n" } : m,
    );
    await assert.rejects(() => applyLocalMigrations(fixture.admin, edited), {
      code: "MIGRATION_CHECKSUM_MISMATCH",
    });
    assert.deepEqual(await history(), before);
    assert.equal(await seedFingerprint(), initial);
  });
  await check("missing or renamed applied versions are refused as divergent history", async () => {
    await assert.rejects(() => applyLocalMigrations(fixture.admin, source.slice(0, -1)), {
      code: "MIGRATION_HISTORY_DIVERGED",
    });
    const renamed = source.map((m, i) =>
      i === 0 ? { ...m, name: m.version + "_different_name.sql" } : m,
    );
    await assert.rejects(() => applyLocalMigrations(fixture.admin, renamed), {
      code: "MIGRATION_HISTORY_DIVERGED",
    });
  });
  service = new LocalDataService(fixture.configs);
  server = await startLocalDataServer(service);
  worker = new LocalMaintenanceWorker(fixture.maintenanceConfig, { log: () => {} });
  await worker.verifyPrincipal();
  await check("API actors cannot inspect or mutate the private migration journal", async () => {
    for (const user of [USERS.managerA, USERS.adminA, USERS.customerA])
      await assert.rejects(
        () =>
          service.transaction(user, (c) =>
            c.query("SELECT * FROM mawid_fixture_migrations.applied"),
          ),
        (e) => e.code === "42501",
      );
  });
  const expand = synthetic(
    1,
    "expand",
    "ALTER TABLE mawid_core.customer_profiles ADD COLUMN migration_note text NOT NULL DEFAULT 'fixture-v1';",
  );
  const failed = synthetic(
    2,
    "unapplied_retry",
    "ALTER TABLE mawid_core.customer_profiles ADD COLUMN uncommitted_probe text; UPDATE mawid_core.customer_profiles SET display_name='Fictional uncommitted change'; ALTER TABLE mawid_core.customer_profiles DISABLE ROW LEVEL SECURITY; DROP POLICY profiles_read ON mawid_core.customer_profiles; GRANT SELECT ON mawid_core.customer_profiles TO PUBLIC; CREATE OR REPLACE FUNCTION mawid_core.actor() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000999'::uuid $$; SELECT 1/0;",
  );
  const later = synthetic(
    3,
    "later_marker",
    "CREATE TABLE mawid_fixture_migrations.later_marker(id integer);",
  );
  const security = await securityFingerprint();
  let error;
  try {
    await applyLocalMigrations(fixture.admin, [...source, expand, failed, later]);
  } catch (e) {
    error = e;
  }
  await check("failure commits only earlier files and stops before later files", async () => {
    assert.equal(error?.code, "MIGRATION_APPLY_FAILED");
    assert.deepEqual(error.committed, [expand.name]);
    assert.equal(error.failed_name, failed.name);
    assert.equal(error.sqlstate, "22012");
    assert.ok(await column("migration_note"));
    assert.equal(await column("uncommitted_probe"), undefined);
    assert.equal((await history()).length, source.length + 1);
    assert.equal(
      (
        await q("SELECT to_regclass('mawid_fixture_migrations.later_marker')::text AS table_name")
      )[0].table_name,
      null,
    );
  });
  await check(
    "failed migration rolls back DML, RLS, policy, grants and function replacement",
    async () => {
      assert.equal(await seedFingerprint(), initial);
      assert.equal(await securityFingerprint(), security);
      assert.equal(
        (await history()).some((m) => m.name === failed.name),
        false,
      );
      assert.ok(!JSON.stringify(error).includes("Fictional uncommitted change"));
    },
  );
  const repaired = {
    ...failed,
    sql: "ALTER TABLE mawid_core.customer_profiles ADD COLUMN retry_probe text DEFAULT 'safe';",
  };
  const recovered = [...source, expand, repaired, later];
  await check(
    "an unpublished unapplied fixture can be corrected and retried from its exact committed prefix",
    async () => {
      const result = await applyLocalMigrations(fixture.admin, recovered);
      assert.deepEqual(result.applied, [repaired.name, later.name]);
      assert.equal((await history()).length, recovered.length);
      assert.ok(await column("retry_probe"));
      assert.equal(await seedFingerprint(), initial);
    },
  );
  await check(
    "the existing API projection still works across additive schema expansion",
    async () => {
      const result = await readProfiles();
      assert.equal(result.items[0].customer_id, IDS.customerA);
      assert.ok(!JSON.stringify(result).includes("migration_note"));
    },
  );
  const wrong = synthetic(
    4,
    "committed_behavior_bug",
    "ALTER TABLE mawid_core.customer_profiles ALTER COLUMN migration_note SET DEFAULT 'wrong-default';",
  );
  await applyLocalMigrations(fixture.admin, [...recovered, wrong]);
  const wrongRow = (await history()).at(-1);
  await q(
    "INSERT INTO mawid_core.customer_profiles(workspace_id,customer_id,external_key,display_name) VALUES($1,$2,'forward-fix-customer','Fictional added customer')",
    [IDS.workspaceA, id(700)],
  );
  const forward = synthetic(
    5,
    "forward_correction",
    "ALTER TABLE mawid_core.customer_profiles ALTER COLUMN migration_note SET DEFAULT 'fixture-v2'; UPDATE mawid_core.customer_profiles SET migration_note='fixture-v2' WHERE migration_note='wrong-default';",
  );
  const fixed = [...recovered, wrong, forward];
  await check(
    "an appended forward correction repairs a committed behavior bug without rewriting history",
    async () => {
      assert.equal(
        (
          await q("SELECT migration_note FROM mawid_core.customer_profiles WHERE customer_id=$1", [
            id(700),
          ])
        )[0].migration_note,
        "wrong-default",
      );
      const result = await applyLocalMigrations(fixture.admin, fixed);
      assert.deepEqual(result.applied, [forward.name]);
      assert.deepEqual(
        (await history()).find((m) => m.name === wrong.name),
        wrongRow,
      );
      assert.equal(
        (
          await q("SELECT migration_note FROM mawid_core.customer_profiles WHERE customer_id=$1", [
            id(700),
          ])
        )[0].migration_note,
        "fixture-v2",
      );
      assert.ok((await column("migration_note")).column_default.includes("fixture-v2"));
      assert.equal(await seedFingerprint(), initial);
    },
  );
  const rehearsal = synthetic(
    6,
    "dry_run_only",
    "ALTER TABLE mawid_core.customer_profiles ADD COLUMN dry_run_probe boolean; UPDATE mawid_core.customer_profiles SET display_name='Fictional dry run only'; ALTER TABLE mawid_core.customer_profiles DISABLE ROW LEVEL SECURITY; GRANT SELECT ON mawid_core.customer_profiles TO PUBLIC;",
  );
  await check(
    "dry run inventories pending DDL but rolls back data, privileges, schema and journal",
    async () => {
      const before = await history();
      const beforeSecurity = await securityFingerprint();
      const result = await applyLocalMigrations(fixture.admin, [...fixed, rehearsal], {
        dryRun: true,
      });
      assert.deepEqual(result.would_apply, [rehearsal.name]);
      assert.equal(result.inventory.journal_entries, fixed.length + 1);
      assert.deepEqual(await history(), before);
      assert.equal(await column("dry_run_probe"), undefined);
      assert.equal(await seedFingerprint(), initial);
      assert.equal(await securityFingerprint(), beforeSecurity);
    },
  );
  await check("a failing dry run leaves the committed schema and journal unchanged", async () => {
    const bad = { ...rehearsal, sql: rehearsal.sql + "SELECT 1/0;" };
    const before = await history();
    await assert.rejects(
      () => applyLocalMigrations(fixture.admin, [...fixed, bad], { dryRun: true }),
      { code: "MIGRATION_DRY_RUN_FAILED" },
    );
    assert.deepEqual(await history(), before);
    assert.equal(await column("dry_run_probe"), undefined);
    assert.equal(await seedFingerprint(), initial);
  });
  await check("migration and maintenance executors share the same exclusion lock", async () => {
    const holder = await observer.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock($1,$2)", MAINTENANCE_LOCK);
      await assert.rejects(() => applyLocalMigrations(fixture.admin, fixed), {
        code: "MIGRATION_BUSY",
      });
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    assert.equal((await applyLocalMigrations(fixture.admin, fixed)).applied.length, 0);
  });
  const interrupted = synthetic(
    6,
    "interrupted",
    "ALTER TABLE mawid_core.customer_profiles ADD COLUMN interrupted_probe text; SELECT pg_sleep(3);",
  );
  const interruptedManifest = [...fixed, interrupted];
  const interruption = applyLocalMigrations(fixture.admin, interruptedManifest).then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  let pid;
  for (let i = 0; i < 150; i++) {
    const result = await observer.query(
      "SELECT pid FROM pg_stat_activity WHERE datname=$1 AND application_name='mawid-local-migration-runner' AND wait_event='PgSleep'",
      [fixture.admin.options.database],
    );
    if (result.rows[0]) {
      pid = result.rows[0].pid;
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  await check("in-flight migration blocks another maintenance worker", async () => {
    assert.ok(pid);
    assert.equal((await worker.runOnce()).status, "skipped");
  });
  await observer.query("SELECT pg_terminate_backend($1)", [pid]);
  const stopped = await interruption;
  await check(
    "terminated connection rolls back pending DDL and leaves no applied record",
    async () => {
      assert.equal(stopped.error?.code, "MIGRATION_APPLY_FAILED");
      assert.equal(await column("interrupted_probe"), undefined);
      assert.equal((await history()).length, fixed.length);
      assert.equal(await seedFingerprint(), initial);
    },
  );
  await check("retry after connection loss applies only the uncommitted migration", async () => {
    const result = await applyLocalMigrations(fixture.admin, interruptedManifest);
    assert.deepEqual(result.applied, [interrupted.name]);
    assert.equal((await worker.runOnce()).status, "succeeded");
  });
  await fixture.restart();
  await check("restart preserves journal, data and idempotent migration replay", async () => {
    assert.equal((await history()).length, interruptedManifest.length);
    assert.deepEqual((await applyLocalMigrations(fixture.admin, interruptedManifest)).applied, []);
    assert.equal(await seedFingerprint(), initial);
    assert.ok((await readProfiles()).items.some((row) => row.customer_id === IDS.customerA));
  });
  const empty = await freshDatabase();
  await check(
    "missing extension prerequisite fails atomically from an empty database",
    async () => {
      await assert.rejects(() => applyLocalMigrations(empty, source), {
        code: "MIGRATION_APPLY_FAILED",
      });
      assert.equal(
        (
          await empty.query(
            "SELECT to_regnamespace('mawid_core')::text AS core,to_regnamespace('mawid_fixture_migrations')::text AS journal",
          )
        ).rows[0].core,
        null,
      );
      assert.equal(
        (await empty.query("SELECT to_regnamespace('mawid_fixture_migrations')::text AS journal"))
          .rows[0].journal,
        null,
      );
    },
  );
  await empty.query("CREATE EXTENSION btree_gist");
  await check(
    "dry run from empty verifies all real migrations and leaves no schemas behind",
    async () => {
      const result = await applyLocalMigrations(empty, source, { dryRun: true });
      assert.equal(result.would_apply.length, source.length);
      assert.ok(result.inventory.core_tables > 0);
      const row = (
        await empty.query(
          "SELECT to_regnamespace('mawid_core')::text AS core,to_regnamespace('mawid_fixture_migrations')::text AS journal",
        )
      ).rows[0];
      assert.equal(row.core, null);
      assert.equal(row.journal, null);
    },
  );
  await check("empty-to-current application commits each real checksum exactly once", async () => {
    const result = await applyLocalMigrations(empty, source);
    assert.equal(result.applied.length, source.length);
    const journal = (
      await empty.query("SELECT name,sha256 FROM mawid_fixture_migrations.applied ORDER BY version")
    ).rows;
    assert.deepEqual(
      journal,
      source.map(({ name, sha256 }) => ({ name, sha256 })),
    );
  });
  const collision = await freshDatabase();
  await collision.query(
    "CREATE SCHEMA mawid_fixture_migrations;CREATE TABLE mawid_fixture_migrations.unrelated(id integer);INSERT INTO mawid_fixture_migrations.unrelated VALUES(7);",
  );
  await check("unrecognized existing migration namespace is preserved and refused", async () => {
    await assert.rejects(() => applyLocalMigrations(collision, source), {
      code: "MIGRATION_LEDGER_COLLISION",
    });
    assert.equal(
      (await collision.query("SELECT id FROM mawid_fixture_migrations.unrelated")).rows[0].id,
      7,
    );
    assert.equal(
      (await collision.query("SELECT to_regnamespace('mawid_core')::text AS core")).rows[0].core,
      null,
    );
  });
  await check(
    "database without the explicit local fixture marker is refused before DDL",
    async () => {
      await collision.query('COMMENT ON DATABASE "' + collision.options.database + '" IS NULL');
      await assert.rejects(() => applyLocalMigrations(collision, source), {
        code: "LOCAL_MIGRATION_TARGET_REQUIRED",
      });
    },
  );
  const files = [
    "scripts/database/migrations/runner.mjs",
    "scripts/database/migrations/runner.test.mjs",
    "scripts/database/migrations/verify-recovery.mjs",
    "scripts/database/api/fixture.mjs",
    "package-lock.json",
    ...source.map((m) => "supabase/migrations/" + m.name),
  ];
  writeFileSync(
    path.join(root, "database/migration-recovery-verification.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        postgres: (await q("SHOW server_version"))[0].server_version,
        image: IMAGE,
        source_migrations: source.map(({ name, sha256 }) => ({ name, sha256 })),
        synthetic_scenarios:
          "In-memory fixture migrations only; not application release migrations.",
        files: files.map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(path.join(root, name)))
            .digest("hex"),
        })),
        checks,
        limits: [
          "Local PostgreSQL fixtures only; no hosted target, credentials or Supabase migration history changed.",
          "Session termination tests transaction interruption, not power-loss or provider-outage recovery.",
          "No automatic destructive down-migration or database restore is performed.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.length + " migration recovery integration checks passed.");
} catch (error) {
  console.error("MIGRATION_RECOVERY_VERIFICATION_FAILED", {
    check: current,
    type: error.name,
    location: error.stack
      ?.split(String.fromCharCode(10))
      .filter((line) => line.trim().startsWith("at "))
      .slice(0, 3)
      .join(" | "),
    code: /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : "TEST_FAILED",
    sqlstate: error.sqlstate ?? null,
  });
  process.exitCode = 1;
} finally {
  try {
    await server?.close();
  } catch {}
  await service?.close();
  await worker?.close();
  await observer?.end();
  for (const { database, pool } of temporary) {
    await pool.end();
    try {
      await fixture.admin.query('DROP DATABASE "' + database + '" WITH (FORCE)');
    } catch {
      console.error("LOCAL_RECOVERY_DATABASE_CLEANUP_FAILED");
    }
  }
  await fixture?.close();
}
