import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createLocalFixture, IDS, USERS, AUTH_USERS, id, IMAGE } from "./fixture.mjs";
import { LocalDataService } from "./data-service.mjs";
import { startLocalDataServer } from "./http-server.mjs";
import { createSignedSessionFixture } from "../identity/signed-session-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const A = IDS.workspaceA,
  B = IDS.workspaceB,
  L = IDS.locationA,
  L2 = id(12),
  C = IDS.customerA,
  C2 = id(33),
  GUESS = id(999);
const kinds = ["customers", "professionals", "services", "openings"];
const sessions = {},
  checks = [],
  coverage = [];
let fixture,
  service,
  server,
  currentCheck = "setup",
  serial = 0;
const logs = [];
const verifiedIdentity = process.argv.includes("--verified-identity");
const csv = (kind, key) =>
  ({
    customers:
      "external_key,display_name,contact\n" +
      key +
      ",Fictional imported customer,import@example.invalid\n",
    professionals: "external_key,display_name\n" + key + ",Fictional imported professional\n",
    services: "external_key,name,duration_minutes\n" + key + ",Fictional imported service,30\n",
    openings: "external_key,weekday,opens,closes\n" + key + ",1,09:00,19:00\n",
  })[kind];
async function call(op, as = "managerA", overrides = {}) {
  const workspace = overrides.workspace ?? A;
  const body = overrides.json ?? op.json;
  const source = overrides.csv ?? (op.kind ? csv(op.kind, "matrix-" + ++serial) : undefined);
  const token = overrides.token ?? sessions[as];
  const response = await fetch(
    server.origin + "/v1/workspaces/" + workspace + (overrides.path ?? op.path),
    {
      method: op.method ?? "GET",
      headers: {
        ...(as === null ? {} : { authorization: "Bearer " + token }),
        ...(body ? { "content-type": "application/json" } : {}),
        ...(source ? { "content-type": "text/csv" } : {}),
        ...overrides.headers,
      },
      body: body ? JSON.stringify(body) : source,
    },
  );
  const text = await response.text();
  const data = response.headers.get("content-type")?.startsWith("application/json")
    ? JSON.parse(text)
    : null;
  return { status: response.status, data, text, headers: response.headers };
}
function expect(result, status, code) {
  assert.equal(result.status, status);
  if (code) {
    assert.equal(result.data.error.code, code);
    assert.equal(result.data.error.message, code);
    assert.equal(result.headers.get("x-request-id"), result.data.error.request_id);
    assert.equal(result.headers.get("cache-control"), "no-store");
    assert.ok(!result.text.includes("@example.invalid"));
  }
  return result;
}
async function check(name, fn, operation = null, scenario = null) {
  currentCheck = name;
  await fn();
  checks.push({ name, passed: true, ...(operation ? { operation, scenario } : {}) });
  console.log("PASS " + name);
}
async function preview(kind, as = "managerA", location = L) {
  return expect(
    await call(
      { path: "/locations/" + location + "/imports/preview?kind=" + kind, method: "POST", kind },
      as,
    ),
    201,
  ).data;
}
const confirmation = (job) => ({
  path: "/imports/" + job.job_id + "/confirm",
  method: "POST",
  json: { confirmed: true, file_sha256: job.file_sha256 },
});
const exportRequest = (json = {}) => ({ path: "/exports", method: "POST", json });
async function exported(as = "managerA", json = {}) {
  return expect(await call(exportRequest(json), as), 201).data.job_id;
}
// Hash complete stored rows inside PostgreSQL; never return fixture contacts/staging to logs.
const fingerprintTables = [
  "organizations",
  "customer_profiles",
  "professionals",
  "services",
  "opening_intervals",
  "bookings",
  "allocations",
  "booking_events",
  "outbox",
  "operation_references",
  "idempotency_records",
  "import_jobs",
  "export_jobs",
  "transfer_audit",
  "erasure_requests",
  "maintenance_runs",
];
const dataFingerprint = async () => {
  const union = fingerprintTables
    .map(
      (table) =>
        "SELECT '" + table + "' AS entity,to_jsonb(t) AS payload FROM mawid_core." + table + " t",
    )
    .join(" UNION ALL ");
  return (
    await fixture.admin.query(
      "WITH stored AS (" +
        union +
        ") SELECT encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_array(entity,payload) ORDER BY entity,payload::text)::text,'[]'),'UTF8')),'hex') AS fingerprint FROM stored",
    )
  ).rows[0].fingerprint;
};

try {
  fixture = await createLocalFixture({ authorizationFixtures: true });
  service = new LocalDataService(fixture.configs);
  let issuer = service;
  if (verifiedIdentity) {
    await service.close();
    issuer = await createSignedSessionFixture(fixture.configs);
    service = issuer.service;
  }
  server = await startLocalDataServer(service, { log: (event) => logs.push(event) });
  for (const [key, user] of Object.entries({ ...USERS, ...AUTH_USERS }))
    sessions[key] = (await issuer.issueSession(user)).token;
  // Regression probes run before the matrix so boundary failures are unambiguous.
  await check("location-scoped staff cannot list tenant-wide profile contacts", async () =>
    expect(await call({ path: "/profiles" }, "locationManagerA"), 404, "NOT_FOUND"),
  );
  await check(
    "a location-filtered export excludes profiles from other locations and unbooked profiles",
    async () => {
      const job = await exported("managerA", { location_id: L });
      const result = expect(await call({ path: "/exports/" + job + "/download" }), 200);
      assert.deepEqual(
        result.data.profiles.map((p) => p.customer_id),
        [C],
      );
      assert.ok(result.data.bookings.every((b) => b.location_id === L));
    },
  );
  const jobs = Object.fromEntries(
    await Promise.all(kinds.map(async (kind) => [kind, await preview(kind)])),
  );
  const managerExport = await exported();
  const ops = [
    {
      name: "profiles.read",
      path: "/profiles",
      roles: { customerA: 200, adminA: 200, professionalA: 404, locationManagerA: 404 },
    },
    ...["services", "professionals", "openings", "bookings"].map((kind) => ({
      name: kind + ".read",
      path: "/locations/" + L + "/" + kind,
      roles: {
        customerA: kind === "bookings" ? 200 : 404,
        adminA: 200,
        professionalA: 200,
        locationManagerA: 200,
      },
    })),
    ...kinds.map((kind) => ({
      name: "imports.preview." + kind,
      path: "/locations/" + L + "/imports/preview?kind=" + kind,
      method: "POST",
      kind,
      roles: {
        customerA: 404,
        adminA: 404,
        professionalA: 404,
        locationManagerA: kind === "customers" ? 404 : 201,
      },
    })),
    ...kinds.map((kind) => ({
      ...confirmation(jobs[kind]),
      name: "imports.confirm." + kind,
      job: true,
      roles: { customerA: 404, adminA: 404, professionalA: 404, locationManagerA: 404 },
    })),
    {
      name: "imports.status",
      path: "/imports/" + jobs.customers.job_id,
      job: true,
      roles: { customerA: 404, adminA: 404, professionalA: 404, locationManagerA: 404 },
    },
    {
      ...exportRequest(),
      name: "exports.create.salon",
      roles: { customerA: 404, adminA: 404, professionalA: 404, locationManagerA: 404 },
    },
    {
      ...exportRequest({ customer_id: C }),
      name: "exports.create.customer",
      roles: { customerA: 201, adminA: 404, professionalA: 404, locationManagerA: 404 },
    },
    {
      name: "exports.status",
      path: "/exports/" + managerExport,
      job: true,
      roles: { customerA: 404, adminA: 404, professionalA: 404, locationManagerA: 404 },
    },
    ...["json", "csv"].map((format) => ({
      name: "exports.download." + format,
      path: "/exports/" + managerExport + "/download?format=" + format,
      job: true,
      roles: { customerA: 404, adminA: 404, professionalA: 404, locationManagerA: 404 },
    })),
  ];
  coverage.push(
    ...ops.map(({ name, method = "GET", path }) => ({
      operation: name,
      method,
      path: path.replaceAll(/[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}/g, ":id"),
    })),
  );
  for (const [scenario, as, override, expected, code] of [
    ["missing session", null, {}, 401, "SESSION_REQUIRED"],
    [
      "unknown session with forged actor and role",
      "customerA",
      {
        token: randomBytes(32).toString("base64url"),
        headers: { "x-actor-id": IDS.managerActorA, "x-role": "manager", "x-workspace-id": A },
      },
      401,
      "SESSION_REQUIRED",
    ],
    ["other tenant actor", "managerB", {}, 404, "NOT_FOUND"],
    ["forged workspace", "managerA", { workspace: B }, 404, "NOT_FOUND"],
  ]) {
    const before = await dataFingerprint();
    for (const op of ops)
      await check(
        op.name + ": " + scenario,
        async () => expect(await call(op, as, override), expected, code),
        op.name,
        scenario,
      );
    await check(scenario + ": denied requests produce no data, job or audit writes", async () =>
      assert.equal(await dataFingerprint(), before),
    );
  }
  for (const op of ops) {
    for (const [as, status] of Object.entries(op.roles))
      await check(
        op.name + ": role " + as,
        async () => {
          const result = expect(
            await call(op, as),
            status,
            status === 404 ? "NOT_FOUND" : undefined,
          );
          if (status === 200 && op.name.endsWith(".read")) {
            assert.ok(
              result.data.items.length > 0,
              "authorized read must return the seeded fixture data",
            );
            if (op.name === "profiles.read" && as === "adminA")
              assert.deepEqual(
                result.data.items.map((p) => p.customer_id).sort(),
                [C, C2, id(34)].sort(),
              );
            if (op.name === "bookings.read")
              assert.ok(result.data.items.every((b) => b.location_id === L));
          }
          if (op.name === "profiles.read" && as === "customerA")
            assert.deepEqual(
              result.data.items.map((p) => p.customer_id),
              [C],
            );
          if (op.name === "bookings.read" && as === "customerA")
            assert.ok(result.data.items.every((b) => b.customer_id === C));
        },
        op.name,
        "role " + as,
      );
  }
  for (const op of ops)
    await check(
      op.name + ": valid customer session cannot escalate through forged headers",
      async () => {
        const status = op.roles.customerA;
        const result = expect(
          await call(op, "customerA", {
            headers: {
              "x-role": "manager",
              "x-actor-id": IDS.managerActorA,
              "x-workspace-id": B,
              "x-user-metadata": JSON.stringify({ role: "manager" }),
            },
          }),
          status,
          status === 404 ? "NOT_FOUND" : undefined,
        );
        if (op.name === "profiles.read")
          assert.deepEqual(
            result.data.items.map((p) => p.customer_id),
            [C],
          );
        if (op.name === "bookings.read")
          assert.ok(result.data.items.every((b) => b.customer_id === C));
      },
      op.name,
      "forged headers on valid session",
    );
  for (const kind of kinds)
    await check("forged CSV scope fields are rejected for " + kind, async () => {
      const text = csv(kind, "forged-" + kind)
        .trimEnd()
        .split("\n");
      const forged =
        text[0] +
        ",workspace_id,actor_id,location_id\n" +
        text[1] +
        "," +
        B +
        "," +
        IDS.managerActorA +
        "," +
        L2 +
        "\n";
      const before = await dataFingerprint();
      expect(
        await call(
          { method: "POST", path: "/locations/" + L + "/imports/preview?kind=" + kind, kind },
          "managerA",
          { csv: forged },
        ),
        422,
        "INVALID_COLUMNS",
      );
      assert.equal(await dataFingerprint(), before);
    });
  await check("confirmation and export bodies cannot override actor or tenant scope", async () => {
    const before = await dataFingerprint();
    for (const field of ["workspace_id", "actor_id", "role", "user_id"]) {
      expect(
        await call(confirmation(jobs.customers), "managerA", {
          json: { ...confirmation(jobs.customers).json, [field]: B },
        }),
        422,
        "VALIDATION_FAILED",
      );
      expect(
        await call(exportRequest(), "managerA", { json: { [field]: B } }),
        422,
        "VALIDATION_FAILED",
      );
    }
    assert.equal(await dataFingerprint(), before);
  });
  for (const op of ops.filter((op) => op.job)) {
    await check(
      op.name + ": same-tenant other manager cannot take ownership",
      async () => expect(await call(op, "otherManagerA"), 404, "NOT_FOUND"),
      op.name,
      "other owner",
    );
    const path = op.path.replace(/\/(imports|exports)\/[a-f0-9-]+/, "/$1/" + GUESS);
    await check(
      op.name + ": guessed job has the same denial as another owner",
      async () => {
        const absent = expect(await call(op, "managerA", { path }), 404, "NOT_FOUND");
        const denied = expect(await call(op, "otherManagerA"), 404, "NOT_FOUND");
        assert.deepEqual(absent.data.error.code, denied.data.error.code);
        assert.equal(absent.data.error.message, denied.data.error.message);
      },
      op.name,
      "guessed job",
    );
  }
  for (const user of ["managerA", "adminA", "professionalA", "locationManagerA", "customerA"]) {
    await check(user + ": location B cannot be substituted into catalog reads", async () => {
      for (const kind of ["services", "professionals", "openings"])
        expect(
          await call({ path: "/locations/" + IDS.locationB + "/" + kind }, user),
          404,
          "NOT_FOUND",
        );
    });
  }
  await check("location staff cannot read bookings in an unassigned location", async () => {
    for (const user of ["locationManagerA", "professionalA"])
      expect(await call({ path: "/locations/" + L2 + "/bookings" }, user), 404, "NOT_FOUND");
  });
  await check("customer cannot page into another customer history in the same tenant", async () => {
    const result = expect(
      await call({ path: "/locations/" + L2 + "/bookings?after=" + IDS.bookingA }, "customerA"),
      200,
    );
    assert.deepEqual(result.data.items, []);
    const other = expect(await call({ path: "/profiles?after=" + C }, "customerA"), 200);
    assert.deepEqual(other.data.items, []);
    const own = expect(
      await call({ path: "/locations/" + L2 + "/bookings" }, "otherCustomerA"),
      200,
    );
    assert.deepEqual(
      own.data.items.map((b) => b.customer_id),
      [C2],
    );
  });
  for (const kind of kinds) {
    await check("authorized manager imports " + kind + " with an audit record", async () => {
      const job = await preview(kind);
      expect(await call(confirmation(job)), 200);
      const {
        rows: [row],
      } = await fixture.admin.query(
        "SELECT count(*)::integer AS n FROM mawid_core.transfer_audit WHERE job_id=$1",
        [job.job_id],
      );
      assert.equal(row.n, 1);
    });
  }
  for (const kind of ["professionals", "services", "openings"])
    await check("location manager imports own-location " + kind + " only", async () => {
      const job = await preview(kind, "locationManagerA");
      expect(await call({ path: "/imports/" + job.job_id }, "locationManagerA"), 200);
      expect(await call(confirmation(job), "locationManagerA"), 200);
      expect(
        await call(
          { path: "/locations/" + L2 + "/imports/preview?kind=" + kind, method: "POST", kind },
          "locationManagerA",
        ),
        404,
        "NOT_FOUND",
      );
    });
  await check(
    "location manager export contains authorized bookings but no global profile contacts",
    async () => {
      const job = await exported("locationManagerA", { location_id: L });
      const data = expect(
        await call({ path: "/exports/" + job + "/download" }, "locationManagerA"),
        200,
      ).data;
      assert.deepEqual(data.profiles, []);
      assert.ok(data.bookings.length > 0 && data.bookings.every((b) => b.location_id === L));
    },
  );
  await check(
    "location manager cannot broaden an export to the whole tenant or another location",
    async () => {
      expect(await call(exportRequest(), "locationManagerA"), 404, "NOT_FOUND");
      expect(await call(exportRequest({ location_id: L2 }), "locationManagerA"), 404, "NOT_FOUND");
    },
  );
  await check(
    "customer cannot export another same-tenant customer or a salon dataset",
    async () => {
      expect(await call(exportRequest({ customer_id: C2 }), "customerA"), 404, "NOT_FOUND");
      expect(await call(exportRequest(), "customerA"), 404, "NOT_FOUND");
    },
  );
  const ownExport = await exported("customerA", { customer_id: C });
  await check(
    "customer export status and both delivery formats reject another same-tenant customer",
    async () => {
      expect(await call({ path: "/exports/" + ownExport }, "customerA"), 200);
      const json = expect(
        await call({ path: "/exports/" + ownExport + "/download?format=json" }, "customerA"),
        200,
      );
      assert.deepEqual(
        json.data.profiles.map((p) => p.customer_id),
        [C],
      );
      const csv = expect(
        await call({ path: "/exports/" + ownExport + "/download?format=csv" }, "customerA"),
        200,
      );
      assert.ok(csv.text.includes("fictional-a@example.invalid"));
      assert.ok(
        !csv.text.includes("other-a@example.invalid") &&
          !csv.text.includes("unbooked-a@example.invalid"),
      );

      for (const suffix of ["", "/download?format=json", "/download?format=csv"])
        expect(
          await call({ path: "/exports/" + ownExport + suffix }, "otherCustomerA"),
          404,
          "NOT_FOUND",
        );
    },
  );
  await check(
    "customer-supplied location never expands own profile/history export scope",
    async () => {
      const job = await exported("customerA", { customer_id: C, location_id: IDS.locationB });
      const data = expect(
        await call({ path: "/exports/" + job + "/download" }, "customerA"),
        200,
      ).data;
      assert.deepEqual(
        data.profiles.map((p) => p.customer_id),
        [C],
      );
      assert.ok(data.bookings.every((b) => b.customer_id === C));
    },
  );
  await check("concurrent pooled reads cannot mix customer identities or workspaces", async () => {
    const actors = [
      ["customerA", A, C],
      ["otherCustomerA", A, C2],
      ["customerB", B, IDS.customerB],
    ];
    const requests = Array.from({ length: 30 }, (_, index) => actors[index % actors.length]).map(
      async ([actor, workspace, customer]) => {
        const result = expect(await call({ path: "/profiles" }, actor, { workspace }), 200);
        assert.deepEqual(
          result.data.items.map((p) => p.customer_id),
          [customer],
        );
      },
    );
    await Promise.all(requests);
  });
  await check("expired jobs disclose expiry only to their still-authorized owner", async () => {
    const expiringImport = await preview("services");
    const expiringExport = await exported();
    await fixture.admin.query(
      "UPDATE mawid_core.import_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=$1",
      [expiringImport.job_id],
    );
    await fixture.admin.query(
      "UPDATE mawid_core.export_jobs SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=$1",
      [expiringExport],
    );
    expect(await call(confirmation(expiringImport)), 409, "PREVIEW_EXPIRED");
    for (const format of ["json", "csv"])
      expect(
        await call({ path: "/exports/" + expiringExport + "/download?format=" + format }),
        409,
        "EXPORT_EXPIRED",
      );
    for (const actor of ["otherManagerA", "customerA", "managerB"]) {
      expect(await call(confirmation(expiringImport), actor), 404, "NOT_FOUND");
      expect(await call({ path: "/imports/" + expiringImport.job_id }, actor), 404, "NOT_FOUND");
      for (const suffix of ["", "/download?format=json", "/download?format=csv"])
        expect(
          await call({ path: "/exports/" + expiringExport + suffix }, actor),
          404,
          "NOT_FOUND",
        );
    }
  });
  const locationJob = await preview("services", "locationManagerA");
  const locationExport = await exported("locationManagerA", { location_id: L });
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE actor_id=$1",
    [id(106)],
  );
  await check(
    "location revocation invalidates reads, previews, saved confirmations, status and exports",
    async () => {
      const targets = [
        { path: "/locations/" + L + "/services" },
        { path: "/locations/" + L + "/bookings" },
        {
          path: "/locations/" + L + "/imports/preview?kind=services",
          method: "POST",
          kind: "services",
        },
        { path: "/imports/" + locationJob.job_id },
        confirmation(locationJob),
        exportRequest({ location_id: L }),
        { path: "/exports/" + locationExport },
        { path: "/exports/" + locationExport + "/download?format=json" },
        { path: "/exports/" + locationExport + "/download?format=csv" },
      ];
      const before = await dataFingerprint();
      for (const op of targets) expect(await call(op, "locationManagerA"), 404, "NOT_FOUND");
      assert.equal(await dataFingerprint(), before);
    },
  );
  const beforeRevoked = await dataFingerprint();
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE actor_id=$1",
    [IDS.managerActorA],
  );
  for (const op of ops)
    await check(
      op.name + ": revoked tenant membership",
      async () => expect(await call(op), 404, "NOT_FOUND"),
      op.name,
      "revoked membership",
    );
  await check("revoked membership cannot produce a write or audit side effect", async () =>
    assert.equal(await dataFingerprint(), beforeRevoked),
  );
  await fixture.admin.query("UPDATE mawid_core.memberships SET revoked_at=NULL WHERE actor_id=$1", [
    IDS.managerActorA,
  ]);
  const revoked = (await issuer.issueSession(USERS.managerA)).token;
  issuer.revokeSession(revoked);
  const expired = (await issuer.issueSession(USERS.managerA, 1)).token;
  await new Promise((resolve) => setTimeout(resolve, 10));
  for (const [scenario, token] of [
    ["revoked session", revoked],
    ["expired session", expired],
  ])
    for (const op of ops)
      await check(
        op.name + ": " + scenario,
        async () => expect(await call(op, "managerA", { token }), 401, "SESSION_REQUIRED"),
        op.name,
        scenario,
      );
  const narrowedCatalog = await preview("services", "managerA", L2);
  const narrowedExport = await exported("managerA");
  await fixture.admin.query("UPDATE mawid_core.memberships SET location_id=$1 WHERE actor_id=$2", [
    L,
    IDS.managerActorA,
  ]);
  await check(
    "narrowed membership loses global profiles, old-location import and whole-salon export",
    async () => {
      expect(await call({ path: "/profiles" }), 404, "NOT_FOUND");
      expect(await call({ path: "/locations/" + L + "/services" }), 200);
      expect(await call({ path: "/locations/" + L2 + "/services" }), 404, "NOT_FOUND");
      expect(await call(confirmation(narrowedCatalog)), 404, "NOT_FOUND");
      expect(await call({ path: "/exports/" + narrowedExport + "/download" }), 404, "NOT_FOUND");
    },
  );
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET location_id=NULL WHERE actor_id=$1",
    [IDS.managerActorA],
  );
  await fixture.admin.query(
    "UPDATE mawid_core.customer_profiles SET actor_id=NULL,contact=NULL,anonymized_at=clock_timestamp() WHERE workspace_id=$1 AND customer_id=$2",
    [A, C],
  );
  await check(
    "removed customer binding invalidates old profile/history and saved exports",
    async () => {
      for (const op of [
        { path: "/profiles" },
        { path: "/locations/" + L + "/bookings" },
        { path: "/exports/" + ownExport },
        { path: "/exports/" + ownExport + "/download?format=json" },
        { path: "/exports/" + ownExport + "/download?format=csv" },
        exportRequest({ customer_id: C }),
      ])
        expect(await call(op, "customerA"), 404, "NOT_FOUND");
    },
  );
  await check(
    "no generic SQL, booking mutation or profile identity-rebinding endpoints exist",
    async () => {
      for (const op of [
        { path: "/sql", method: "POST", json: { sql: "SELECT 1" } },
        { path: "/profiles", method: "POST", json: { actor_id: id(109) } },
        { path: "/locations/" + L + "/bookings", method: "POST", json: { state: "confirmed" } },
        { path: "/profiles", method: "DELETE" },
      ])
        expect(await call(op), 404, "NOT_FOUND");
    },
  );
  await check(
    "authorization-denial responses and logs never contain fixture secrets or profile contacts",
    async () => {
      assert.equal(logs.length, 0);
      const denied = expect(await call({ path: "/profiles" }, "managerB"), 404, "NOT_FOUND");
      assert.ok(!denied.text.includes(fixture.configs[0].password));
      assert.ok(!denied.text.includes("example.invalid"));
    },
  );
  const files = [
    "scripts/database/api/data-service.mjs",
    "scripts/database/api/http-server.mjs",
    "scripts/database/api/fixture.mjs",
    "scripts/database/api/verify-authorization.mjs",
    "scripts/database/csv.mjs",
    "package-lock.json",
    ...(verifiedIdentity
      ? [
          "scripts/database/identity/session-gate.mjs",
          "scripts/database/identity/verified-local-data.mjs",
          "scripts/database/identity/signed-session-fixture.mjs",
        ]
      : []),
    ...readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => "supabase/migrations/" + f),
  ];
  writeFileSync(
    path.join(
      root,
      verifiedIdentity
        ? "database/identity-authorization-verification.json"
        : "database/authorization-verification.json",
    ),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        postgres: (await fixture.admin.query("SHOW server_version")).rows[0].server_version,
        image: IMAGE,
        identity_transport: verifiedIdentity
          ? "ES256 test issuer with live session lookup"
          : "fictional opaque fixture sessions",
        operations: coverage,
        files: files.map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(path.join(root, name)))
            .digest("hex"),
        })),
        checks,
        limits: [
          "Covers the current local HTTP data API only, using fictional principals.",
          "Real identity/session strategy and live security verification remain issue #5.",
          "No hosted changes, client integration, booking mutation service, cleanup schedule or release proof is implied.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    checks.length +
      " local authorization checks passed across " +
      ops.length +
      " operation variants.",
  );
} catch (error) {
  console.error("LOCAL_AUTHORIZATION_VERIFICATION_FAILED", {
    check: currentCheck,
    code: /^[A-Z0-9_]{1,60}$/.test(error.code) ? error.code : "TEST_FAILED",
  });
  process.exitCode = 1;
} finally {
  try {
    await server?.close();
  } catch {}
  await service?.close();
  await fixture?.close();
}
