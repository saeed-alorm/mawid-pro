import assert from "node:assert/strict";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalFixture, IDS, USERS, id, IMAGE } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalMaintenanceWorker, MAINTENANCE_LOCK } from "./worker.mjs";
import { MaintenanceScheduler } from "./scheduler.mjs";
import { startMaintainedLocalServer } from "./runtime.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const A = IDS.workspaceA,
  B = IDS.workspaceB,
  C = IDS.customerA,
  BC = IDS.customerB,
  L = IDS.locationA;
let fixture,
  worker,
  service,
  server,
  scheduler,
  probe,
  current = "setup";
const checks = [],
  logs = [];
let serial = 0;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function check(name, fn) {
  current = name;
  await fn();
  checks.push({ name, passed: true });
  console.log("PASS " + name);
}
const q = async (text, args = []) => (await fixture.admin.query(text, args)).rows;
async function request(as, sql, args = []) {
  return service.transaction(USERS[as], (client) => client.query(sql, args));
}
async function preview(w = A, loc = L, as = "managerA") {
  const key = "maintenance-" + ++serial;
  const result = await request(
    as,
    "SELECT mawid_core.preview_import($1,$2,$3,$4,$5::jsonb) AS id",
    [
      w,
      loc,
      "customers",
      "a".repeat(64),
      JSON.stringify([
        {
          external_key: key,
          display_name: "Fictional staged person",
          contact: "staged@example.invalid",
        },
      ]),
    ],
  );
  return result.rows[0].id;
}
async function customer(w, c, key) {
  await q(
    "INSERT INTO mawid_core.customer_profiles(workspace_id,customer_id,external_key,display_name,contact) VALUES($1,$2,$3,$4,$5)",
    [w, c, key, "Fictional erasure target", "erase@example.invalid"],
  );
}
async function api(pathname, token) {
  const result = await fetch(server.origin + "/v1/workspaces/" + A + pathname, {
    headers: { authorization: "Bearer " + token },
  });
  return { status: result.status, text: await result.text() };
}
async function waitFor(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await pause(20);
  }
  throw new Error("SCHEDULE_TIMEOUT");
}
try {
  fixture = await createLocalFixture();
  service = new LocalDataService(fixture.configs);
  worker = new LocalMaintenanceWorker(fixture.maintenanceConfig, {
    log: (event) => logs.push(event),
  });
  probe = new Pool({ ...fixture.maintenanceConfig, max: 1, idleTimeoutMillis: 500 });
  probe.on("error", () => {});
  await check("worker is neither owner, superuser, RLS bypass nor an API actor", () =>
    worker.verifyPrincipal(),
  );
  for (const actor of ["managerA", "adminA", "customerA", "managerB", "customerB"])
    await check(actor + " cannot execute maintenance or inspect its protected tables", async () => {
      for (const sql of [
        "SELECT mawid_core.perform_local_maintenance()",
        "SELECT mawid_core.maintain_local_data()",
        "SELECT mawid_core.reconcile_deletions()",
        "SELECT * FROM mawid_core.maintenance_runs",
        "SELECT * FROM mawid_core.erasure_requests",
      ])
        await assert.rejects(
          () => request(actor, sql),
          (error) => error.code === "42501",
        );
      await assert.rejects(
        () => request(actor, "SELECT mawid_core.queue_erasure($1,$2)", [A, C]),
        (error) => error.code === "42501",
      );
    });
  await check("maintenance credentials cannot start the HTTP identity adapter", async () => {
    const wrong = new LocalDataService([fixture.maintenanceConfig]);
    try {
      await assert.rejects(() => startLocalDataServer(wrong));
    } finally {
      await wrong.close();
    }
    assert.throws(() => service.issueSession("mawid_fixture_maintenance"), /INVALID_LOCAL_SESSION/);
  });
  await check("worker cannot read raw import payloads or membership tables", async () => {
    for (const sql of [
      "SELECT staged_rows FROM mawid_core.import_jobs",
      "SELECT * FROM mawid_core.memberships",
    ])
      await assert.rejects(
        () => probe.query(sql),
        (error) => error.code === "42501",
      );
  });
  let requestId = await worker.queueErasure(A, C);
  await check(
    "trusted erasure queue is idempotent and rejects a cross-tenant customer ID",
    async () => {
      assert.equal(await worker.queueErasure(A, C), requestId);
      await assert.rejects(
        () => worker.queueErasure(B, C),
        (error) => error.code === "P0002",
      );
    },
  );
  await q(
    "INSERT INTO mawid_core.legal_preservation VALUES($1,$2,'Fictional documented test purpose',clock_timestamp()+interval '1 day')",
    [B, BC],
  );
  await worker.queueErasure(B, BC);
  const first = await worker.runOnce();
  await check(
    "one worker transaction anonymizes approved requests and marks held requests for review",
    async () => {
      assert.equal(first.status, "succeeded");
      assert.equal(first.counts.erased, 1);
      assert.equal(first.counts.preservation_review, 1);
      const rows = await q(
        "SELECT workspace_id,status FROM mawid_core.erasure_requests ORDER BY workspace_id",
      );
      assert.deepEqual(
        rows.map((row) => row.status),
        ["completed", "needs_review"],
      );
      assert.equal(
        (
          await q(
            "SELECT contact IS NULL AND actor_id IS NULL AS erased FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2",
            [A, C],
          )
        )[0].erased,
        true,
      );
      assert.equal(
        (
          await q(
            "SELECT contact IS NOT NULL AS retained FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2",
            [B, BC],
          )
        )[0].retained,
        true,
      );
    },
  );
  await check(
    "legal hold removal alone does not silently approve a held deletion request",
    async () => {
      await q(
        "DELETE FROM mawid_core.legal_preservation WHERE workspace_id=$1 AND customer_id=$2",
        [B, BC],
      );
      assert.equal((await worker.runOnce()).status, "succeeded");
      assert.equal(
        (await q("SELECT status FROM mawid_core.erasure_requests WHERE workspace_id=$1", [B]))[0]
          .status,
        "needs_review",
      );
    },
  );
  await q("UPDATE mawid_core.erasure_requests SET status='pending' WHERE workspace_id=$1", [B]);
  await worker.runOnce();
  await check("operator-reviewed requeue applies erasure after the hold is resolved", async () =>
    assert.equal(
      (
        await q(
          "SELECT contact IS NULL AS erased FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2",
          [B, BC],
        )
      )[0].erased,
      true,
    ),
  );
  await q(
    "UPDATE mawid_core.customer_profiles SET contact='restored@example.invalid',display_name='Restored fictional name',actor_id=$1,external_key='restored-a',anonymized_at=NULL WHERE workspace_id=$2 AND customer_id=$3",
    [IDS.customerActorA, A, C],
  );
  const customerToken = service.issueSession(USERS.customerA).token;
  server = await startMaintainedLocalServer(service, worker);
  await check(
    "startup reconciles erased data before the HTTP listener serves customers",
    async () => {
      assert.equal((await api("/profiles", customerToken)).status, 404);
      const row = (
        await q(
          "SELECT contact,actor_id,display_name FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2",
          [A, C],
        )
      )[0];
      assert.equal(row.contact, null);
      assert.equal(row.actor_id, null);
      assert.equal(row.display_name, "Deleted customer");
    },
  );
  await check(
    "repeated reconciliation does not rewrite profiles or invalidate configuration",
    async () => {
      const before = (
        await q(
          "SELECT configuration_version FROM mawid_core.organizations WHERE workspace_id=$1",
          [A],
        )
      )[0].configuration_version;
      assert.equal((await worker.runOnce()).status, "succeeded");
      assert.equal((await worker.runOnce()).status, "succeeded");
      assert.equal(
        (
          await q(
            "SELECT configuration_version FROM mawid_core.organizations WHERE workspace_id=$1",
            [A],
          )
        )[0].configuration_version,
        before,
      );
    },
  );
  await check("failed or busy startup maintenance blocks the API listener", async () => {
    for (const status of ["failed", "skipped"]) {
      let reached = false;
      await assert.rejects(
        () =>
          startMaintainedLocalServer(
            {
              verifyPrincipals: async () => {
                reached = true;
              },
            },
            { verifyPrincipal: async () => {}, runOnce: async () => ({ status }) },
          ),
        /MAINTENANCE_STARTUP_BLOCKED/,
      );
      assert.equal(reached, false);
    }
  });
  const expired = await preview();
  const active = await preview();
  const corrupt = await preview(B, IDS.locationB, "managerB");
  await q(
    "UPDATE mawid_core.import_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=$1",
    [expired],
  );
  await q(
    "UPDATE mawid_core.import_jobs SET expires_at=clock_timestamp()-interval '1 second',status='committed' WHERE job_id=$1",
    [corrupt],
  );
  const exportId = (
    await request("managerA", "SELECT mawid_core.request_export($1,NULL,NULL) AS id", [A])
  ).rows[0].id;
  await q(
    "UPDATE mawid_core.export_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=$1",
    [exportId],
  );
  for (const [n, age] of [
    [901, "7 days 1 second"],
    [902, "6 days"],
  ]) {
    await q(
      "INSERT INTO mawid_core.operation_references(workspace_id,actor_id,operation_id,operation,input_hash,created_at) VALUES($1,$2,$3,'fictional','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',clock_timestamp()-$4::interval)",
      [A, IDS.customerActorA, id(n), age],
    );
    await q(
      "INSERT INTO mawid_core.idempotency_records SELECT workspace_id,actor_id,operation_id,'{}'::jsonb,created_at FROM mawid_core.operation_references WHERE operation_id=$1",
      [id(n)],
    );
  }
  const newTarget = id(903);
  await customer(A, newTarget, "queued-failure-target");
  await worker.queueErasure(A, newTarget);
  await q(
    "CREATE FUNCTION public.inject_maintenance_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FICTIONAL_PRIVATE maintenance@example.invalid'; END $$;CREATE TRIGGER inject_maintenance_failure BEFORE UPDATE ON mawid_core.import_jobs FOR EACH ROW EXECUTE FUNCTION public.inject_maintenance_failure();",
  );
  const failed = await worker.runOnce();
  await check(
    "mid-run failure rolls back erasure, staging and retries while recording a safe failure",
    async () => {
      assert.equal(failed.status, "failed");
      assert.equal(
        (
          await q("SELECT status FROM mawid_core.erasure_requests WHERE customer_id=$1", [
            newTarget,
          ])
        )[0].status,
        "pending",
      );
      assert.equal(
        (
          await q(
            "SELECT contact IS NOT NULL AS retained FROM mawid_core.customer_profiles WHERE customer_id=$1",
            [newTarget],
          )
        )[0].retained,
        true,
      );
      assert.equal(
        (
          await q("SELECT has_staged_rows FROM mawid_core.import_jobs WHERE job_id=$1", [expired])
        )[0].has_staged_rows,
        true,
      );
      assert.equal(
        (await q("SELECT count(*)::integer AS n FROM mawid_core.idempotency_records"))[0].n,
        2,
      );
      assert.equal(
        (
          await q("SELECT status,error_code FROM mawid_core.maintenance_runs WHERE run_id=$1", [
            failed.run_id,
          ])
        )[0].error_code,
        "MAINTENANCE_FAILED",
      );
      assert.ok(!JSON.stringify(logs).includes("example.invalid"));
      assert.ok(!JSON.stringify(logs).includes(fixture.maintenanceConfig.password));
    },
  );
  await q(
    "DROP TRIGGER inject_maintenance_failure ON mawid_core.import_jobs;DROP FUNCTION public.inject_maintenance_failure();",
  );
  await check("a later retry commits the entire retained pending batch", async () => {
    const result = await worker.runOnce();
    assert.equal(result.status, "succeeded");
    assert.equal(result.counts.erased, 1);
    assert.equal(result.counts.expired_imports, 2);
    assert.equal(result.counts.pruned_retries, 1);
    assert.equal(result.counts.expired_exports, 1);
  });
  await check(
    "expired staging clears across tenants and statuses; unexpired previews survive",
    async () => {
      const rows = await q(
        "SELECT job_id,has_staged_rows,status FROM mawid_core.import_jobs WHERE job_id=ANY($1::uuid[])",
        [[expired, active, corrupt]],
      );
      const map = new Map(rows.map((row) => [row.job_id, row]));
      assert.equal(map.get(expired).has_staged_rows, false);
      assert.equal(map.get(expired).status, "expired");
      assert.equal(map.get(corrupt).has_staged_rows, false);
      assert.equal(map.get(corrupt).status, "committed");
      assert.equal(map.get(active).has_staged_rows, true);
    },
  );
  await check("pruned retry outcomes do not remove durable operation references", async () => {
    assert.equal(
      (await q("SELECT count(*)::integer AS n FROM mawid_core.operation_references"))[0].n,
      2,
    );
    assert.equal(
      (await q("SELECT count(*)::integer AS n FROM mawid_core.idempotency_records"))[0].n,
      1,
    );
  });
  await q(
    "INSERT INTO mawid_core.legal_preservation VALUES($1,$2,'Fictional history preservation test',clock_timestamp()+interval '1 day')",
    [B, BC],
  );
  for (const [bid, w, l, c, age, cancelled] of [
    [911, A, L, C, "13 months", false],
    [912, A, L, C, "11 months", false],
    [913, B, IDS.locationB, BC, "13 months", false],
    [914, A, L, C, "13 months", true],
  ]) {
    await q(
      "INSERT INTO mawid_core.bookings(workspace_id,location_id,booking_id,customer_id,service_id,requested_start,requested_end,state,cancelled_at,cancellation_actor) VALUES($1,$2,$3,$4,$5,clock_timestamp()-$6::interval,clock_timestamp()-$6::interval+interval '30 minutes',$7,CASE WHEN $8 THEN clock_timestamp()-interval '1 day' ELSE NULL END,CASE WHEN $8 THEN 'customer' ELSE NULL END)",
      [w, l, id(bid), c, IDS.service, age, cancelled ? "cancelled" : "pending", cancelled],
    );
  }
  const allocationOwner = await fixture.admin.connect();
  try {
    await allocationOwner.query("BEGIN");
    await allocationOwner.query(
      "UPDATE mawid_core.bookings SET state='confirmed',assigned_professional_id=$1,assigned_start=requested_start,assigned_end=requested_end WHERE booking_id=$2",
      [IDS.professional, id(911)],
    );
    await allocationOwner.query(
      "INSERT INTO mawid_core.allocations(workspace_id,location_id,booking_id,professional_id,kind,period) SELECT workspace_id,location_id,booking_id,assigned_professional_id,'confirmed',tstzrange(assigned_start,assigned_end,'[)') FROM mawid_core.bookings WHERE booking_id=$1",
      [id(911)],
    );
    await allocationOwner.query("COMMIT");
  } catch (error) {
    await allocationOwner.query("ROLLBACK");
    throw error;
  } finally {
    allocationOwner.release();
  }
  await q(
    "INSERT INTO mawid_core.booking_events(workspace_id,location_id,event_id,booking_id,version,actor_id,action) VALUES($1,$2,$3,$4,1,$5,'fictional_submitted')",
    [A, L, id(915), id(911), IDS.customerActorA],
  );
  await q(
    "INSERT INTO mawid_core.outbox(workspace_id,event_id,deliver_after) VALUES($1,$2,clock_timestamp())",
    [A, id(915)],
  );
  await worker.runOnce();
  await check(
    "twelve-month cleanup removes expired history and dependent events/outbox only",
    async () => {
      assert.equal(
        (
          await q("SELECT count(*)::integer AS n FROM mawid_core.bookings WHERE booking_id=$1", [
            id(911),
          ])
        )[0].n,
        0,
      );
      assert.equal(
        (
          await q("SELECT count(*)::integer AS n FROM mawid_core.allocations WHERE booking_id=$1", [
            id(911),
          ])
        )[0].n,
        0,
      );
      for (const bid of [912, 913, 914])
        assert.equal(
          (
            await q("SELECT count(*)::integer AS n FROM mawid_core.bookings WHERE booking_id=$1", [
              id(bid),
            ])
          )[0].n,
          1,
        );
      assert.equal(
        (
          await q(
            "SELECT count(*)::integer AS n FROM mawid_core.booking_events WHERE event_id=$1",
            [id(915)],
          )
        )[0].n,
        0,
      );
      assert.equal(
        (
          await q("SELECT count(*)::integer AS n FROM mawid_core.outbox WHERE event_id=$1", [
            id(915),
          ])
        )[0].n,
        0,
      );
    },
  );
  await check("independent workers skip an already-held transaction lock", async () => {
    const holder = await fixture.admin.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock($1,$2)", MAINTENANCE_LOCK);
      const other = new LocalMaintenanceWorker(fixture.maintenanceConfig, {
        log: (event) => logs.push(event),
      });
      try {
        assert.equal((await worker.runOnce()).status, "skipped");
        assert.equal((await other.runOnce()).status, "skipped");
      } finally {
        await other.close();
      }
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    assert.equal((await worker.runOnce()).status, "succeeded");
  });
  await check("the same worker cannot overlap two manual runs", async () => {
    const first = worker.runOnce();
    const second = await worker.runOnce();
    assert.equal(second.status, "skipped");
    assert.equal((await first).status, "succeeded");
  });
  const scheduled = await preview();
  await q(
    "UPDATE mawid_core.import_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=$1",
    [scheduled],
  );
  scheduler = new MaintenanceScheduler(worker, { intervalMs: 25, retryBaseMs: 10, maxRetryMs: 50 });
  scheduler.start();
  await check("a real timer executes cleanup without a manual maintenance call", async () => {
    await waitFor(
      async () =>
        !(
          await q("SELECT has_staged_rows FROM mawid_core.import_jobs WHERE job_id=$1", [scheduled])
        )[0].has_staged_rows,
    );
  });
  await scheduler.stop();
  scheduler = undefined;
  await check("stopping the schedule drains work and prevents later runs", async () => {
    const n = (await q("SELECT count(*)::integer AS n FROM mawid_core.maintenance_runs"))[0].n;
    await pause(80);
    assert.equal(
      (await q("SELECT count(*)::integer AS n FROM mawid_core.maintenance_runs"))[0].n,
      n,
    );
  });
  const restartTarget = id(920);
  await customer(A, restartTarget, "restart-target");
  await worker.queueErasure(A, restartTarget);
  await fixture.restart();
  await check(
    "database restart preserves the erasure queue and ledger, then resumes maintenance",
    async () => {
      assert.equal((await worker.runOnce()).status, "succeeded");
      assert.equal(
        (
          await q("SELECT status FROM mawid_core.erasure_requests WHERE customer_id=$1", [
            restartTarget,
          ])
        )[0].status,
        "completed",
      );
      assert.ok(
        (await q("SELECT count(*)::integer AS n FROM mawid_core.deletion_ledger"))[0].n >= 3,
      );
    },
  );
  const token = service.issueSession(USERS.managerA).token;
  await check("no maintenance or erasure-queue endpoint is exposed to API clients", async () => {
    for (const suffix of ["/maintenance/run", "/erasure_requests"]) {
      const response = await fetch(server.origin + "/v1/workspaces/" + A + suffix, {
        method: "POST",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ customer_id: C }),
      });
      assert.equal(response.status, 404);
    }
  });
  await check(
    "run evidence contains only counters, timestamps and stable safe errors",
    async () => {
      const rows = await q("SELECT status,counts,error_code FROM mawid_core.maintenance_runs");
      assert.ok(rows.some((row) => row.status === "failed"));
      assert.ok(rows.some((row) => row.status === "succeeded"));
      const text = JSON.stringify(rows);
      assert.ok(!text.includes("example.invalid"));
      assert.ok(!text.includes(fixture.maintenanceConfig.password));
    },
  );
  await check(
    "a queued erasure for a temporarily missing profile prevents later resurrection",
    async () => {
      const missing = id(930);
      await customer(A, missing, "temporarily-missing");
      await worker.queueErasure(A, missing);
      await q("DELETE FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2", [
        A,
        missing,
      ]);
      const result = await worker.runOnce();
      assert.equal(result.status, "succeeded");
      assert.equal(result.counts.missing, 1);
      assert.equal(
        (
          await q(
            "SELECT count(*)::integer AS n FROM mawid_core.deletion_ledger WHERE workspace_id=$1 AND customer_id=$2",
            [A, missing],
          )
        )[0].n,
        1,
      );
      await customer(A, missing, "restored-missing-profile");
      assert.equal((await worker.runOnce()).status, "succeeded");
      assert.equal(
        (
          await q(
            "SELECT contact IS NULL AND actor_id IS NULL AS erased FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2",
            [A, missing],
          )
        )[0].erased,
        true,
      );
    },
  );
  const files = [
    "scripts/database/maintenance/worker.mjs",
    "scripts/database/maintenance/scheduler.mjs",
    "scripts/database/maintenance/runtime.mjs",
    "scripts/database/maintenance/verify-maintenance.mjs",
    "scripts/database/api/fixture.mjs",
    "scripts/database/api/serve-local.mjs",
    "package-lock.json",
    ...readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => "supabase/migrations/" + f),
  ];
  writeFileSync(
    path.join(root, "database/maintenance-verification.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        postgres: (await q("SHOW server_version"))[0].server_version,
        image: IMAGE,
        files: files.map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(path.join(root, name)))
            .digest("hex"),
        })),
        checks,
        limits: [
          "Scheduled only while the fictional local runner is active; no hosted/background OS automation is installed.",
          "Requests enter through a trusted local operator queue, not a real customer authentication flow.",
          "An independent protected deletion-ledger copy and off-device recovery remain operational work.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.length + " maintenance integration checks passed.");
} catch (error) {
  console.error("MAINTENANCE_VERIFICATION_FAILED", {
    check: current,
    code: /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : "TEST_FAILED",
  });
  process.exitCode = 1;
} finally {
  await scheduler?.stop();
  try {
    await server?.close();
  } catch {}
  await service?.close();
  await worker?.close();
  await probe?.end();
  await fixture?.close();
}
