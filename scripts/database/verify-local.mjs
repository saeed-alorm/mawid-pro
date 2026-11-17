import { parseImport, exportCsv } from "./csv.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const container = "mawid-issue6-local-20261114";
const image =
  "postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536";
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const settings = JSON.parse(docker("inspect", container))[0];
assert.equal(settings.HostConfig.NetworkMode, "none");
assert.ok(
  !settings.HostConfig.PortBindings || Object.keys(settings.HostConfig.PortBindings).length === 0,
);
assert.equal(settings.Image, JSON.parse(docker("image", "inspect", image))[0].Id);
const db = "mawid_issue6_" + Date.now();
// Pass SQL on stdin without a shell, arguments, URL, password, or remote connection string.
function query(s, user = "postgres", database = db) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-q",
      "-A",
      "-t",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      user,
      "-d",
      database,
    ],
    { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, passed: true });
    console.log("PASS " + name);
  } catch (e) {
    results.push({ name, passed: false });
    console.error("FAIL " + name);
    throw e;
  }
}
function fails(s, code, user = "postgres") {
  let failure;
  try {
    query(s, user);
  } catch (e) {
    failure = e;
  }
  assert.ok(failure, "expected failure");
  assert.ok(String(failure.stderr).includes(code), "expected safe failure code " + code);
}
const id = (n) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
const W = id(1),
  B = id(2),
  L = id(11),
  L2 = id(12),
  BL = id(21),
  C = id(31),
  C2 = id(32),
  BC = id(33),
  P = id(41),
  S = id(51);
const q = (s) => "'" + s.replaceAll("'", "''") + "'";
const H = "a".repeat(64);
const actors = [
  ["mawid_test_manager", 101],
  ["mawid_test_customer", 102],
  ["mawid_test_other_customer", 103],
  ["mawid_test_admin", 104],
  ["mawid_test_b_manager", 105],
  ["mawid_test_revoked", 106],
  ["mawid_test_location_manager", 107],
];
const manager = "mawid_test_manager",
  customer = "mawid_test_customer",
  other = "mawid_test_other_customer";
const migrations = readdirSync(path.join(root, "supabase/migrations"))
  .filter((x) => x.endsWith(".sql"))
  .sort()
  .map((name) => ({
    name,
    sql: readFileSync(path.join(root, "supabase/migrations", name), "utf8"),
  }));
const manifest = migrations.map((m) => ({
  name: m.name,
  sha256: createHash("sha256").update(m.sql).digest("hex"),
}));
try {
  query("CREATE DATABASE " + db + ";", "postgres", "postgres");
  query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mawid_local_actor') THEN CREATE ROLE mawid_local_actor NOLOGIN; END IF; END $$;",
    "postgres",
    "postgres",
  );
  query(
    "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mawid_local_maintenance') THEN CREATE ROLE mawid_local_maintenance NOLOGIN; END IF; END $$;",
    "postgres",
    "postgres",
  );
  for (const [name] of actors)
    query(
      "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=" +
        q(name) +
        ") THEN CREATE ROLE " +
        name +
        " LOGIN; END IF; END $$; GRANT mawid_local_actor TO " +
        name +
        ";",
      "postgres",
      "postgres",
    );
  query(
    "CREATE EXTENSION btree_gist; CREATE TABLE public.local_migrations(name text PRIMARY KEY,sha256 text NOT NULL);",
  );
  for (let index = 0; index < migrations.length; index++) {
    const m = migrations[index];
    query(
      "BEGIN;" +
        m.sql +
        "INSERT INTO public.local_migrations VALUES(" +
        q(m.name) +
        "," +
        q(manifest[index].sha256) +
        ");COMMIT;",
    );
    if (index === 0) {
      query(
        "INSERT INTO mawid_core.organizations(workspace_id,name) VALUES(" +
          q(W) +
          ",'Fictional A'),(" +
          q(B) +
          ",'Fictional B');",
      );
      check("version-one synthetic inventory persists across later migrations", () =>
        assert.equal(query("SELECT count(*) FROM mawid_core.organizations;"), "2"),
      );
    }
  }
  query(
    "INSERT INTO mawid_core.locations VALUES(" +
      q(W) +
      "," +
      q(L) +
      ",'A','Asia/Beirut'),(" +
      q(W) +
      "," +
      q(L2) +
      ",'A2','Asia/Beirut'),(" +
      q(B) +
      "," +
      q(BL) +
      ",'B','Asia/Beirut');",
  );
  for (const [name, n] of actors)
    query("INSERT INTO mawid_core.principals VALUES(" + q(name) + "," + q(id(n)) + ");");
  for (const [actor, w, loc, roles, revoked] of [
    [101, W, null, ["manager"], false],
    [104, W, null, ["admin"], false],
    [105, B, null, ["manager"], false],
    [106, W, null, ["manager"], true],
    [107, W, L, ["manager"], false],
  ])
    query(
      "INSERT INTO mawid_core.memberships(workspace_id,actor_id,location_id,roles,revoked_at) VALUES(" +
        q(w) +
        "," +
        q(id(actor)) +
        "," +
        (loc ? q(loc) : "NULL") +
        ",ARRAY[" +
        roles.map(q).join(",") +
        "]," +
        (revoked ? "clock_timestamp()" : "NULL") +
        ");",
    );
  query(
    "INSERT INTO mawid_core.customer_profiles(workspace_id,customer_id,external_key,actor_id,display_name,contact) VALUES(" +
      q(W) +
      "," +
      q(C) +
      ",'customer-a'," +
      q(id(102)) +
      ",'Fictional customer A','fictional@example.invalid'),(" +
      q(W) +
      "," +
      q(C2) +
      ",'customer-a2'," +
      q(id(103)) +
      ",'Fictional customer A2',NULL),(" +
      q(B) +
      "," +
      q(BC) +
      ",'customer-b',NULL,'Fictional customer B',NULL);",
  );
  query(
    "INSERT INTO mawid_core.professionals(workspace_id,location_id,professional_id,external_key,display_name) VALUES(" +
      q(W) +
      "," +
      q(L) +
      "," +
      q(P) +
      ",'professional','Fictional A'),(" +
      q(B) +
      "," +
      q(BL) +
      "," +
      q(P) +
      ",'professional','Fictional B'); INSERT INTO mawid_core.services(workspace_id,location_id,service_id,external_key,name,duration_minutes) VALUES(" +
      q(W) +
      "," +
      q(L) +
      "," +
      q(S) +
      ",'service','Fictional service',30),(" +
      q(B) +
      "," +
      q(BL) +
      "," +
      q(S) +
      ",'service','Fictional service',30);",
  );
  const booking = (bid, w = W, l = L, c = C, state = "pending", start = "2030-01-01 10:00Z") =>
    "INSERT INTO mawid_core.bookings(workspace_id,location_id,booking_id,customer_id,service_id,requested_start,requested_end,state) VALUES(" +
    [w, l, id(bid), c, S].map(q).join(",") +
    "," +
    q(start) +
    "::timestamptz," +
    q(start) +
    "::timestamptz+interval '30 minutes'," +
    q(state) +
    ");";
  query(booking(61) + booking(62) + booking(63, B, BL, BC));
  check("all application tables force RLS", () =>
    assert.equal(
      query(
        "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mawid_core' AND c.relkind='r' AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);",
      ),
      "0",
    ),
  );
  check("PUBLIC cannot use private schema or execute application functions", () =>
    assert.equal(
      query(
        "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='mawid_core' AND a.grantee=0;",
      ),
      "0",
    ),
  );
  check("customer sees own rows only", () =>
    assert.equal(query("SELECT count(*) FROM mawid_core.customer_profiles;", customer), "1"),
  );
  check("tenant A manager cannot read tenant B", () =>
    assert.equal(
      query(
        "SELECT count(*) FROM mawid_core.customer_profiles WHERE workspace_id=" + q(B) + ";",
        manager,
      ),
      "0",
    ),
  );
  check("revoked membership sees no salon data", () =>
    assert.equal(
      query("SELECT count(*) FROM mawid_core.customer_profiles;", "mawid_test_revoked"),
      "0",
    ),
  );
  check("forged custom session claims do not change identity", () =>
    assert.equal(
      query(
        'SET request.jwt.claims=\'{"sub":"' +
          id(101) +
          "\"}'; SELECT count(*) FROM mawid_core.customer_profiles;",
        customer,
      ),
      "1",
    ),
  );
  check("wrong tenant writes denied by RLS", () =>
    fails(
      "INSERT INTO mawid_core.customer_profiles(workspace_id,external_key,display_name) VALUES(" +
        q(B) +
        ",'forged','Fictional');",
      "row-level security",
      manager,
    ),
  );
  check("cross-tenant customer references rejected", () =>
    fails(booking(64, W, L, BC), "foreign key"),
  );
  check("wrong-location service reference rejected", () =>
    fails(booking(65, W, L2, C), "foreign key"),
  );
  check("pending competitors reserve no allocation", () =>
    assert.equal(query("SELECT count(*) FROM mawid_core.allocations;"), "0"),
  );
  check("invalid timezone rejected", () =>
    fails(
      "INSERT INTO mawid_core.locations VALUES(" +
        q(W) +
        "," +
        q(id(99)) +
        ",'Invalid','No/Such_Zone');",
      "INVALID_TIMEZONE",
    ),
  );
  const preview = (rows, kind = "customers", user = manager, w = W, l = L) =>
    query(
      "SELECT mawid_core.preview_import(" +
        q(w) +
        "," +
        q(l) +
        "," +
        q(kind) +
        "," +
        q(H) +
        "," +
        q(JSON.stringify(rows)) +
        "::jsonb);",
      user,
    );
  const confirm = (job, user = manager, hash = H) =>
    query(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(hash) + ",true);",
      user,
    );
  const rows = [
    {
      external_key: "imported-a",
      display_name: "Fictional imported customer",
      contact: "import@example.invalid",
    },
  ];
  check("CSV byte hash and parsed records reach the transactional preview", () => {
    const csv = parseImport(
      new TextEncoder().encode(
        "external_key,display_name\r\ncsv-integrated,Fictional CSV customer\r\n",
      ),
      "customers",
    );
    const csvJob = query(
      "SELECT mawid_core.preview_import(" +
        q(W) +
        "," +
        q(L) +
        ",'customers'," +
        q(csv.fileSha256) +
        "," +
        q(JSON.stringify(csv.rows)) +
        "::jsonb);",
      manager,
    );
    assert.equal(confirm(csvJob, manager, csv.fileSha256), "1");
    assert.ok(
      exportCsv(["display_name"], [{ display_name: "=FICTIONAL()" }]).includes('"\'=FICTIONAL()"'),
    );
  });
  let job = preview(rows);
  check("preview writes no customer rows", () =>
    assert.equal(
      query("SELECT count(*) FROM mawid_core.customer_profiles WHERE external_key='imported-a';"),
      "0",
    ),
  );
  check("admin does not inherit manager import privilege", () =>
    fails(
      "SELECT mawid_core.preview_import(" +
        q(W) +
        "," +
        q(L) +
        ",'customers'," +
        q(H) +
        ",'[]'::jsonb);",
      "NOT_FOUND",
      "mawid_test_admin",
    ),
  );
  check("guessed preview cannot be read by another tenant", () =>
    assert.equal(
      query(
        "SELECT count(*) FROM mawid_core.import_jobs WHERE job_id=" + q(job) + ";",
        "mawid_test_b_manager",
      ),
      "0",
    ),
  );
  check("other actor cannot confirm a preview", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "NOT_FOUND",
      "mawid_test_b_manager",
    ),
  );
  check("explicit confirmation is required", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",false);",
      "CONFIRMATION_REQUIRED",
      manager,
    ),
  );
  check("changed file hash is rejected", () =>
    fails(
      "SELECT mawid_core.confirm_import(" +
        q(W) +
        "," +
        q(job) +
        "," +
        q("b".repeat(64)) +
        ",true);",
      "STALE_PREVIEW",
      manager,
    ),
  );
  check("valid import commits rows, audit, and clears staged data", () => {
    assert.equal(confirm(job), "1");
    assert.equal(
      query(
        "SELECT status||':'||(staged_rows IS NULL)::text FROM mawid_core.import_jobs WHERE job_id=" +
          q(job) +
          ";",
      ),
      "committed:true",
    );
    assert.equal(
      query("SELECT count(*) FROM mawid_core.transfer_audit WHERE job_id=" + q(job) + ";"),
      "1",
    );
  });
  check("repeated confirmation cannot duplicate rows", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "ALREADY_COMMITTED",
      manager,
    ),
  );
  check("existing-record duplicates fail before writes", () =>
    fails(
      "SELECT mawid_core.validate_import(" +
        q(W) +
        "," +
        q(L) +
        ",'customers'," +
        q(JSON.stringify(rows)) +
        "::jsonb);",
      "EXISTING_RECORD",
      manager,
    ),
  );
  check("intra-file duplicates fail", () =>
    fails(
      "SELECT mawid_core.validate_import(" +
        q(W) +
        "," +
        q(L) +
        ",'customers'," +
        q(
          JSON.stringify([
            { external_key: "duplicate", display_name: "A" },
            { external_key: "duplicate", display_name: "B" },
          ]),
        ) +
        "::jsonb);",
      "DUPLICATE_ROW",
      manager,
    ),
  );
  check("credential columns fail validation", () =>
    fails(
      "SELECT mawid_core.validate_import(" +
        q(W) +
        "," +
        q(L) +
        ",'customers'," +
        q(JSON.stringify([{ external_key: "bad", display_name: "A", password: "fictional" }])) +
        "::jsonb);",
      "INVALID_COLUMNS",
      manager,
    ),
  );
  job = preview([{ external_key: "stale-a", display_name: "A" }]);
  query(
    "UPDATE mawid_core.organizations SET configuration_version=configuration_version+1 WHERE workspace_id=" +
      q(W) +
      ";",
  );
  check("configuration changes invalidate preview", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "STALE_PREVIEW",
      manager,
    ),
  );
  job = preview([
    { external_key: "rollback-1", display_name: "A" },
    { external_key: "rollback-2", display_name: "B" },
  ]);
  query(
    "CREATE FUNCTION public.inject_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_key='rollback-2' THEN RAISE EXCEPTION 'INJECTED_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER inject_failure BEFORE INSERT ON mawid_core.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.inject_failure();",
  );
  check("mid-batch failure rolls back all rows, audit and preview status", () => {
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "INJECTED_FAILURE",
      manager,
    );
    assert.equal(
      query(
        "SELECT count(*) FROM mawid_core.customer_profiles WHERE external_key LIKE 'rollback-%';",
      ),
      "0",
    );
    assert.equal(
      query("SELECT count(*) FROM mawid_core.transfer_audit WHERE job_id=" + q(job) + ";"),
      "0",
    );
    assert.equal(
      query("SELECT status FROM mawid_core.import_jobs WHERE job_id=" + q(job) + ";"),
      "previewed",
    );
  });
  query(
    "DROP TRIGGER inject_failure ON mawid_core.customer_profiles; DROP FUNCTION public.inject_failure();",
  );
  check("same preview succeeds after a transient rollback", () => assert.equal(confirm(job), "2"));
  job = preview([{ external_key: "expired-a", display_name: "A" }]);
  query(
    "UPDATE mawid_core.import_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=" +
      q(job) +
      ";",
  );
  check("expired previews cannot commit", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "PREVIEW_EXPIRED",
      manager,
    ),
  );
  const exportJob = query(
    "SELECT mawid_core.request_export(" + q(W) + "," + q(L) + "," + q(C) + ");",
    customer,
  );
  check("customer export excludes other profiles and internal identity", () => {
    const data = JSON.parse(
      query("SELECT mawid_core.download_export(" + q(W) + "," + q(exportJob) + ");", customer),
    );
    assert.equal(data.profiles.length, 1);
    assert.equal(data.profiles[0].customer_id, C);
    assert.ok(!JSON.stringify(data).includes("actor_id"));
    assert.ok(data.bookings.every((b) => b.customer_id === C));
  });
  check("other customer cannot download guessed export", () =>
    fails(
      "SELECT mawid_core.download_export(" + q(W) + "," + q(exportJob) + ");",
      "NOT_FOUND",
      other,
    ),
  );
  check("customer cannot request salon-wide export", () =>
    fails(
      "SELECT mawid_core.request_export(" + q(W) + "," + q(L) + ",NULL);",
      "NOT_FOUND",
      customer,
    ),
  );
  check("wrong tenant export returns uniform not-found", () =>
    fails(
      "SELECT mawid_core.request_export(" + q(B) + "," + q(BL) + ",NULL);",
      "NOT_FOUND",
      manager,
    ),
  );
  const staffExport = query("SELECT mawid_core.request_export(" + q(W) + ",NULL,NULL);", manager);
  job = preview([{ external_key: "revoke-a", display_name: "A" }]);
  query(
    "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE actor_id=" +
      q(id(101)) +
      ";",
  );
  check("revocation blocks saved export delivery", () =>
    fails(
      "SELECT mawid_core.download_export(" + q(W) + "," + q(staffExport) + ");",
      "NOT_FOUND",
      manager,
    ),
  );
  check("revocation blocks previously authorized confirmation", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "NOT_FOUND",
      manager,
    ),
  );
  query("UPDATE mawid_core.memberships SET revoked_at=NULL WHERE actor_id=" + q(id(101)) + ";");
  query(
    "UPDATE mawid_core.export_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=" +
      q(exportJob) +
      ";",
  );
  check("export delivery expiry is enforced", () =>
    fails(
      "SELECT mawid_core.download_export(" + q(W) + "," + q(exportJob) + ");",
      "EXPORT_EXPIRED",
      customer,
    ),
  );
  check("raw booking mutations are not granted to actors", () =>
    fails("UPDATE mawid_core.bookings SET state='confirmed';", "permission denied", manager),
  );
  check("actor cannot escalate session identity", () =>
    fails("SET SESSION AUTHORIZATION mawid_test_b_manager;", "permission denied", manager),
  );
  // Durable capacity constraints are tested as migration/fixture owner, not as a fake live API.
  const allocate = (bid, w = W, l = L, from = "2030-01-01 11:00Z", to = "2030-01-01 11:30Z") =>
    "UPDATE mawid_core.bookings SET state='confirmed',assigned_professional_id=" +
    q(P) +
    ",assigned_start=" +
    q(from) +
    ",assigned_end=" +
    q(to) +
    " WHERE workspace_id=" +
    q(w) +
    " AND booking_id=" +
    q(id(bid)) +
    "; INSERT INTO mawid_core.allocations(workspace_id,location_id,booking_id,professional_id,kind,period) VALUES(" +
    [w, l, id(bid), P].map(q).join(",") +
    ",'confirmed',tstzrange(" +
    q(from) +
    "," +
    q(to) +
    ",'[)'));";
  query("BEGIN;" + allocate(61) + "COMMIT;");
  check("overlapping allocations are excluded", () =>
    fails("BEGIN;" + allocate(62) + "COMMIT;", "conflicting key"),
  );
  check("same professional and time in different tenants do not conflict", () =>
    query("BEGIN;" + allocate(63, B, BL) + "COMMIT;"),
  );
  check("adjacent half-open allocation succeeds", () =>
    query("BEGIN;" + allocate(62, W, L, "2030-01-01 11:30Z", "2030-01-01 12:00Z") + "COMMIT;"),
  );
  check("confirmed booking without allocation is rejected at commit", () =>
    fails(
      "BEGIN;" +
        booking(66) +
        "UPDATE mawid_core.bookings SET state='confirmed',assigned_professional_id=" +
        q(P) +
        ",assigned_start='2030-01-02 10:00Z',assigned_end='2030-01-02 10:30Z' WHERE booking_id=" +
        q(id(66)) +
        ";COMMIT;",
      "ALLOCATION_REQUIRED",
    ),
  );
  // Old histories are separate from active profile data; maintenance is ungranted.
  query(
    booking(70, W, L, C, "cancelled", "2020-01-01 10:00Z").replace("'cancelled'", "'pending'") +
      "UPDATE mawid_core.bookings SET state='cancelled',cancelled_at='2020-01-01',cancellation_actor='customer' WHERE booking_id=" +
      q(id(70)) +
      ";",
  );
  query(
    "INSERT INTO mawid_core.operation_references(workspace_id,actor_id,operation_id,operation,input_hash,created_at) VALUES(" +
      q(W) +
      "," +
      q(id(102)) +
      "," +
      q(id(80)) +
      ",'submit'," +
      q(H) +
      ",clock_timestamp()-interval '8 days'); INSERT INTO mawid_core.idempotency_records SELECT workspace_id,actor_id,operation_id,'{}'::jsonb,created_at FROM mawid_core.operation_references;",
  );
  check("location manager can import catalog in assigned location", () => {
    const localJob = preview(
      [{ external_key: "local-catalog", display_name: "Fictional local professional" }],
      "professionals",
      "mawid_test_location_manager",
    );
    assert.equal(confirm(localJob, "mawid_test_location_manager"), "1");
  });
  check("location manager cannot import in another location", () =>
    fails(
      "SELECT mawid_core.preview_import(" +
        q(W) +
        "," +
        q(L2) +
        ",'professionals'," +
        q(H) +
        "," +
        q(JSON.stringify([{ external_key: "wrong-location", display_name: "Fictional" }])) +
        "::jsonb);",
      "NOT_FOUND",
      "mawid_test_location_manager",
    ),
  );
  check("location manager cannot import tenant-wide customer profiles", () =>
    fails(
      "SELECT mawid_core.preview_import(" +
        q(W) +
        "," +
        q(L) +
        ",'customers'," +
        q(H) +
        "," +
        q(JSON.stringify([{ external_key: "wrong-scope", display_name: "Fictional" }])) +
        "::jsonb);",
      "NOT_FOUND",
      "mawid_test_location_manager",
    ),
  );
  check("services import enforces duration types", () =>
    fails(
      "SELECT mawid_core.validate_import(" +
        q(W) +
        "," +
        q(L) +
        ",'services'," +
        q(
          JSON.stringify([
            { external_key: "invalid-service", name: "Fictional", duration_minutes: "-1" },
          ]),
        ) +
        "::jsonb);",
      "INVALID_SERVICE",
      manager,
    ),
  );
  check("opening import rejects invalid local times", () =>
    fails(
      "SELECT mawid_core.validate_import(" +
        q(W) +
        "," +
        q(L) +
        ",'openings'," +
        q(
          JSON.stringify([
            { external_key: "invalid-opening", weekday: "1", opens: "25:00", closes: "26:00" },
          ]),
        ) +
        "::jsonb);",
      "INVALID_OPENING",
      manager,
    ),
  );
  for (const [kind, row] of [
    [
      "services",
      {
        external_key: "import-service",
        name: "Fictional imported service",
        duration_minutes: "30",
      },
    ],
    ["openings", { external_key: "import-opening", weekday: "1", opens: "09:00", closes: "19:00" }],
  ])
    check("valid " + kind + " import commits", () =>
      assert.equal(confirm(preview([row], kind)), "1"),
    );
  job = preview([{ external_key: "tamper", display_name: "Fictional" }]);
  query(
    "UPDATE mawid_core.import_jobs SET staged_rows=" +
      q(JSON.stringify([{ external_key: "tamper-changed", display_name: "Fictional" }])) +
      "::jsonb WHERE job_id=" +
      q(job) +
      ";",
  );
  check("altered staged payload cannot be confirmed", () =>
    fails(
      "SELECT mawid_core.confirm_import(" + q(W) + "," + q(job) + "," + q(H) + ",true);",
      "STALE_PREVIEW",
      manager,
    ),
  );
  for (let n = 0; n < 7; n++) {
    query(booking(200 + n));
    query(
      "UPDATE mawid_core.bookings SET state='cancelled',cancelled_at=clock_timestamp()-interval " +
        q(n === 4 ? "90 days 1 second" : n === 5 ? "1 day" : n === 6 ? "-1 day" : n + 1 + " days") +
        ",cancellation_actor=" +
        q(n === 5 ? "salon" : "customer") +
        " WHERE booking_id=" +
        q(id(200 + n)) +
        ";",
    );
  }
  // Cancellation flags now count only cancellations made inside the final hour.
  // Keep the original window/actor fixtures, with explicit assigned-time evidence.
  query(
    "UPDATE mawid_core.bookings SET assigned_start=cancelled_at+interval '30 minutes',assigned_end=cancelled_at+interval '60 minutes' WHERE booking_id IN (" +
      Array.from({ length: 7 }, (_, n) => q(id(200 + n))).join(",") +
      ");",
  );
  check("fourth-cancellation flag counts one booking once within salon rolling 90 days", () =>
    assert.equal(
      query("SELECT mawid_core.cancellation_count(" + q(W) + "," + q(C) + ");", manager),
      "4",
    ),
  );
  check("customer cannot retrieve staff-only cancellation flag", () =>
    assert.equal(
      query("SELECT mawid_core.cancellation_count(" + q(W) + "," + q(C) + ");", customer),
      "0",
    ),
  );
  query(booking(210));
  query(
    "UPDATE mawid_core.bookings SET requested_start=clock_timestamp()-interval '12 months 30 minutes 1 second',requested_end=clock_timestamp()-interval '12 months 1 second' WHERE booking_id=" +
      q(id(210)) +
      ";",
  );
  query(booking(211));
  query(
    "UPDATE mawid_core.bookings SET requested_start=clock_timestamp()-interval '12 months 29 minutes',requested_end=clock_timestamp()-interval '12 months'+interval '1 minute' WHERE booking_id=" +
      q(id(211)) +
      ";",
  );
  query(booking(212, W, L, C2, "pending", "2020-01-01 10:00Z"));
  query(
    "INSERT INTO mawid_core.legal_preservation VALUES(" +
      q(W) +
      "," +
      q(C2) +
      ",'Fictional documented test exception',clock_timestamp()+interval '1 day');",
  );
  check("documented preservation blocks requested erasure", () =>
    fails(
      "SELECT mawid_core.anonymize_customer(" + q(W) + "," + q(C2) + ");",
      "PRESERVATION_REVIEW_REQUIRED",
    ),
  );
  check("maintenance cannot be invoked by manager", () =>
    fails("SELECT mawid_core.maintain_local_data();", "permission denied", manager),
  );
  query("SELECT mawid_core.maintain_local_data();");
  check(
    "twelve-month boundary and documented preservation are separate from backup retention",
    () => {
      assert.equal(
        query("SELECT count(*) FROM mawid_core.bookings WHERE booking_id=" + q(id(210)) + ";"),
        "0",
      );
      assert.equal(
        query("SELECT count(*) FROM mawid_core.bookings WHERE booking_id=" + q(id(211)) + ";"),
        "1",
      );
      assert.equal(
        query("SELECT count(*) FROM mawid_core.bookings WHERE booking_id=" + q(id(212)) + ";"),
        "1",
      );
    },
  );
  check("retention removes old history and expired staging, preserving stable intents", () => {
    assert.equal(
      query("SELECT count(*) FROM mawid_core.bookings WHERE booking_id=" + q(id(70)) + ";"),
      "0",
    );
    assert.equal(query("SELECT count(*) FROM mawid_core.idempotency_records;"), "0");
    assert.equal(query("SELECT count(*) FROM mawid_core.operation_references;"), "1");
    assert.equal(
      query(
        "SELECT count(*) FROM mawid_core.import_jobs WHERE expires_at<=clock_timestamp() AND staged_rows IS NOT NULL;",
      ),
      "0",
    );
  });
  query("SELECT mawid_core.anonymize_customer(" + q(W) + "," + q(C) + ");");
  check("erasure removes binding and contact without retaining deleted content", () => {
    assert.equal(
      query(
        "SELECT (contact IS NULL AND actor_id IS NULL AND display_name='Deleted customer')::text FROM mawid_core.customer_profiles WHERE customer_id=" +
          q(C) +
          ";",
      ),
      "true",
    );
    assert.equal(query("SELECT count(*) FROM mawid_core.customer_profiles;", customer), "0");
  });
  query(
    "UPDATE mawid_core.customer_profiles SET display_name='Restored fictional old value',contact='old@example.invalid',actor_id=" +
      q(id(102)) +
      " WHERE customer_id=" +
      q(C) +
      "; SELECT mawid_core.reconcile_deletions();",
  );
  check("deletion ledger reconciles restored profile content", () =>
    assert.equal(
      query(
        "SELECT (contact IS NULL AND actor_id IS NULL)::text FROM mawid_core.customer_profiles WHERE customer_id=" +
          q(C) +
          ";",
      ),
      "true",
    ),
  );
  check("offer expiry is capped at appointment start rather than buffered allocation start", () => {
    query(
      "BEGIN;" +
        booking(302) +
        "UPDATE mawid_core.bookings SET state='proposed',assigned_professional_id=" +
        q(P) +
        ",assigned_start='2030-01-04 10:00Z',assigned_end='2030-01-04 10:30Z',offer_expires_at='2030-01-04 10:00Z' WHERE booking_id=" +
        q(id(302)) +
        ";INSERT INTO mawid_core.allocations(workspace_id,location_id,booking_id,professional_id,kind,period,expires_at) VALUES(" +
        [W, L, id(302), P].map(q).join(",") +
        ",'offer',tstzrange('2030-01-04 09:55Z','2030-01-04 10:35Z','[)'),'2030-01-04 10:00Z');COMMIT;",
    );
  });
  docker("restart", container);
  for (let i = 0; i < 30; i++) {
    try {
      query("SELECT 1;");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  check("committed fictional records survive PostgreSQL restart", () =>
    assert.equal(
      query("SELECT count(*) FROM mawid_core.customer_profiles WHERE external_key='imported-a';"),
      "1",
    ),
  );
  check("migration manifest survives restart with exact checksums", () =>
    assert.equal(query("SELECT count(*) FROM public.local_migrations;"), String(migrations.length)),
  );
  check("all migrations also apply from an empty schema in a rollback-only rehearsal", () => {
    const inventory = query(
      "BEGIN; DROP SCHEMA mawid_core CASCADE; " +
        migrations.map((m) => m.sql).join("\n") +
        "SELECT count(*) FROM mawid_core.organizations; ROLLBACK;",
    );
    assert.equal(inventory, "0");
    assert.equal(query("SELECT count(*) FROM mawid_core.organizations;"), "2");
  });
  writeFileSync(
    path.join(root, "database/verification.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        database: query("SHOW server_version;"),
        image,
        base: "b3af265048b4f22c29981ad943e4a34eb317085c",
        migrations: manifest,
        checks: results,
        limits: [
          "Fictional local database principals only; no real Auth/session proof.",
          "Booking transition engine, response clocks, notification dispatch, independent-session races and target builds remain separate acceptance.",
          "No hosted migration, live backup, APK, account, deployment or external write.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(results.length + " database checks passed.");
} finally {
  try {
    query("DROP DATABASE " + db + " WITH (FORCE);", "postgres", "postgres");
  } catch {
    console.error("Local test database cleanup needs attention: " + db);
  }
}
