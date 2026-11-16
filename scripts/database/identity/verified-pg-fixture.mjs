import { randomBytes } from "node:crypto";
import { Pool } from "pg";

export async function createVerifiedPool(fixture) {
  const password = randomBytes(32).toString("hex");
  await fixture.admin.query(
    `CREATE ROLE mawid_fixture_verified LOGIN PASSWORD '${password}';
     GRANT mawid_verified_actor TO mawid_fixture_verified`,
  );
  const pool = new Pool({
    ...fixture.configs[0],
    user: "mawid_fixture_verified",
    password,
    max: 1,
    statement_timeout: 5000,
    lock_timeout: 2000,
    options: "-c search_path=pg_catalog",
  });
  pool.on("error", () => {});
  return pool;
}

// Only the test operator may bind verified accounts to pre-seeded actors.
export async function bindFixtureIdentity(fixture, issuer, subject, user) {
  const expected = await fixture.admin.query(
    "SELECT actor_id FROM mawid_core.principals WHERE database_user=$1",
    [user],
  );
  if (expected.rowCount !== 1) throw new Error("UNKNOWN_FIXTURE_PRINCIPAL");
  const actorId = expected.rows[0].actor_id;
  await fixture.admin.query(
    `INSERT INTO mawid_core.identity_bindings(issuer,subject,actor_id) VALUES ($1,$2,$3)
     ON CONFLICT (issuer,subject) DO NOTHING`,
    [issuer, subject, actorId],
  );
  const {
    rows: [binding],
  } = await fixture.admin.query(
    "SELECT actor_id FROM mawid_core.identity_bindings WHERE issuer=$1 AND subject=$2",
    [issuer, subject],
  );
  if (binding.actor_id !== actorId) throw new Error("UNEXPECTED_FIXTURE_BINDING");
  return actorId;
}
