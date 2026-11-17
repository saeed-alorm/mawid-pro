import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createLocalFixture, IDS, id } from "../api/fixture.mjs";
import { applyLocalMigrations, readLocalMigrations } from "../migrations/runner.mjs";

const migrations = readLocalMigrations(
  fileURLToPath(new URL("../../../supabase/migrations", import.meta.url)),
);
const fixture = await createLocalFixture({ migrationCount: 10 });
const { admin } = fixture;
const key = [IDS.workspaceA, IDS.locationA, IDS.bookingA];
const row = async (sql, params = key) => (await admin.query(sql, params)).rows[0];
const where = "workspace_id=$1 AND location_id=$2 AND booking_id=$3";

try {
  await admin.query("BEGIN");
  await admin.query(
    `UPDATE mawid_core.bookings SET version=7,state='confirmed',
      assigned_professional_id=$4,assigned_start=requested_start,assigned_end=requested_end
      WHERE ${where}`,
    [...key, IDS.professional],
  );
  await admin.query(
    `INSERT INTO mawid_core.allocations(workspace_id,location_id,booking_id,professional_id,kind,period)
      SELECT workspace_id,location_id,booking_id,assigned_professional_id,'confirmed',
        tstzrange(assigned_start-interval '2 minutes',assigned_end+interval '3 minutes','[)')
      FROM mawid_core.bookings WHERE ${where}`,
    key,
  );
  await admin.query(
    `INSERT INTO mawid_core.booking_events(workspace_id,location_id,booking_id,actor_id,version,action)
      VALUES($1,$2,$3,$4,7,'confirm')`,
    [...key, id(105)],
  );
  await admin.query(
    `INSERT INTO mawid_core.operation_references(workspace_id,actor_id,operation_id,operation,input_hash)
      VALUES($1,$2,$3,'confirm',$4)`,
    [IDS.workspaceA, id(105), id(800), "0".repeat(64)],
  );
  await admin.query("COMMIT");

  const before = await row(`SELECT * FROM mawid_core.bookings WHERE ${where}`);
  await applyLocalMigrations(admin, migrations);
  const after = await row(`SELECT * FROM mawid_core.bookings WHERE ${where}`);
  assert.equal(after.segment_count, 1, "existing booking becomes a one-segment visit");
  delete after.segment_count;
  delete after.intake_source;
  delete after.entered_by;
  assert.deepEqual(after, before);

  const segment = await row(`SELECT * FROM mawid_core.visit_segments WHERE ${where}`);
  assert.equal(segment.position, 1);
  assert.equal(segment.service_id, IDS.service);
  assert.equal(segment.assigned_professional_id, IDS.professional);
  assert.deepEqual(segment.assigned_start, before.assigned_start);
  assert.deepEqual(segment.assigned_end, before.assigned_end);

  const allocation = await row(
    `SELECT segment_position,period::text FROM mawid_core.allocations WHERE ${where}`,
  );
  assert.equal(allocation.segment_position, 1);
  assert.match(allocation.period, /09:58:00/);
  assert.match(allocation.period, /10:33:00/);
  assert.equal(
    (await row(`SELECT version FROM mawid_core.booking_events WHERE ${where}`)).version,
    "7",
  );
  assert.equal(
    (
      await row(
        "SELECT count(*)::int AS n FROM mawid_core.operation_references WHERE operation_id=$1",
        [id(800)],
      )
    ).n,
    1,
  );

  await assert.rejects(
    admin.query(`DELETE FROM mawid_core.allocations WHERE ${where}`, key),
    /ALLOCATION_REQUIRED/,
  );
  console.log("Visit migration preserves existing identifiers, state, history and capacity.");
} finally {
  await fixture.close();
}
