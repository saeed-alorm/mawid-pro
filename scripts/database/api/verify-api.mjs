import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createLocalFixture, IDS, USERS, id, IMAGE } from "./fixture.mjs";
import { LocalDataService } from "./data-service.mjs";
import { startLocalDataServer } from "./http-server.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const results = [];
let currentCheck = "fixture setup";
let fixture, service, server;
const logs = [];
const tokens = {};
const { workspaceA: A, workspaceB: B, locationA: L, customerA: C } = IDS;
const route = (tail, w = A) => "/v1/workspaces/" + w + tail;
async function boot() {
  service = new LocalDataService(fixture.configs);
  server = await startLocalDataServer(service, { log: (event) => logs.push(event) });
  for (const [key, user] of Object.entries(USERS)) tokens[key] = service.issueSession(user).token;
}
async function call(
  tail,
  { as = "managerA", method = "GET", json, csv, headers = {}, workspace = A } = {},
) {
  const response = await fetch(server.origin + route(tail, workspace), {
    method,
    headers: {
      ...(as ? { authorization: "Bearer " + tokens[as] } : {}),
      ...(json ? { "content-type": "application/json" } : {}),
      ...(csv !== undefined ? { "content-type": "text/csv" } : {}),
      ...headers,
    },
    body: json ? JSON.stringify(json) : csv,
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    data: response.headers.get("content-type")?.startsWith("application/json")
      ? JSON.parse(text)
      : null,
  };
}
const expect = async (promise, status, code) => {
  const value = await promise;
  assert.equal(value.status, status);
  if (code) {
    assert.equal(value.data.error.code, code);
    assert.match(value.data.error.request_id, /^[a-f0-9-]{36}$/);
    assert.equal(value.headers.get("x-request-id"), value.data.error.request_id);
  }
  return value;
};
async function check(name, fn) {
  currentCheck = name;
  await fn();
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
const preview = async (key, extra = "") =>
  (
    await expect(
      call("/locations/" + L + "/imports/preview?kind=customers", {
        method: "POST",
        csv:
          "external_key,display_name,contact\r\n" +
          key +
          ',"Fictional imported ' +
          key +
          '",fixture@example.invalid\r\n' +
          extra,
      }),
      201,
    )
  ).data;
const confirm = (job) =>
  call("/imports/" + job.job_id + "/confirm", {
    method: "POST",
    json: { file_sha256: job.file_sha256, confirmed: true },
  });
try {
  fixture = await createLocalFixture();
  await boot();
  await check("unauthenticated requests cannot choose a fictional identity", () =>
    expect(
      call("/profiles", { as: null, headers: { "x-actor-id": IDS.managerActorA } }),
      401,
      "SESSION_REQUIRED",
    ),
  );
  await check("cross-origin requests are rejected", () =>
    expect(
      call("/profiles", { headers: { origin: "https://untrusted.invalid" } }),
      403,
      "ORIGIN_DENIED",
    ),
  );
  await check("DNS-rebinding Host is rejected", async () => {
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(
        server.origin + route("/profiles"),
        { headers: { host: "untrusted.invalid", authorization: "Bearer " + tokens.managerA } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    assert.equal(status, 421);
  });
  await check("scoped reads use PostgreSQL identity and omit subject bindings", async () => {
    const result = await expect(call("/profiles"), 200);
    assert.equal(result.data.items.length, 1);
    assert.equal(result.data.items[0].customer_id, C);
    assert.ok(!result.text.includes("actor_id"));
    assert.equal(result.headers.get("cache-control"), "no-store");
  });
  await check("customer reads only their own profile", async () => {
    const result = await expect(call("/profiles", { as: "customerA" }), 200);
    assert.equal(result.data.items.length, 1);
    assert.equal(result.data.items[0].customer_id, C);
  });
  await check("another tenant returns uniform not-found", () =>
    expect(call("/profiles", { workspace: B }), 404, "NOT_FOUND"),
  );
  await check("pagination inputs cannot become SQL text", () =>
    expect(call("/profiles?after=1%27%3BDROP%20SCHEMA%20mawid_core"), 422, "VALIDATION_FAILED"),
  );
  await check("unknown and duplicate query fields are rejected", async () => {
    await expect(call("/profiles?role=manager"), 422, "VALIDATION_FAILED");
    await expect(call("/profiles?limit=1&limit=50"), 422, "VALIDATION_FAILED");
  });
  for (const kind of ["services", "professionals", "openings", "bookings"])
    await check("HTTP reads " + kind + " from PostgreSQL", async () => {
      const result = await expect(call("/locations/" + L + "/" + kind), 200);
      assert.equal(result.data.items.length, 1);
      assert.ok(!result.text.includes("response_due_at"));
    });
  await check("manager role does not come from a request header", () =>
    expect(
      call("/locations/" + L + "/imports/preview?kind=customers", {
        as: "customerA",
        method: "POST",
        csv: "invalid",
        headers: { "x-role": "manager" },
      }),
      404,
      "NOT_FOUND",
    ),
  );
  await check("admin does not inherit import permission", () =>
    expect(
      call("/locations/" + L + "/imports/preview?kind=customers", {
        as: "adminA",
        method: "POST",
        csv: "invalid",
      }),
      404,
      "NOT_FOUND",
    ),
  );
  let job = await preview("saved-through-http");
  await check("HTTP preview persists metadata without importing profiles", async () => {
    const status = await expect(call("/imports/" + job.job_id), 200);
    assert.equal(status.data.status, "previewed");
    assert.ok(!status.text.includes("staged_rows"));
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT count(*)::integer AS n FROM mawid_core.customer_profiles WHERE external_key='saved-through-http'",
        )
      ).rows[0].n,
      0,
    );
  });
  await check("confirmation rejects injected actor fields", () =>
    expect(
      call("/imports/" + job.job_id + "/confirm", {
        method: "POST",
        json: { file_sha256: job.file_sha256, confirmed: true, actor_id: IDS.managerActorA },
      }),
      422,
      "VALIDATION_FAILED",
    ),
  );
  await check("explicit confirmation cannot be omitted", () =>
    expect(
      call("/imports/" + job.job_id + "/confirm", {
        method: "POST",
        json: { file_sha256: job.file_sha256 },
      }),
      422,
      "VALIDATION_FAILED",
    ),
  );
  await check("manager commits a preview through HTTP", async () => {
    const value = await expect(confirm(job), 200);
    assert.equal(value.data.row_count, 1);
  });
  await check("HTTP reads the committed record and paginates without duplicates", async () => {
    const first = (await expect(call("/profiles?limit=1"), 200)).data;
    assert.equal(first.items.length, 1);
    assert.ok(first.next_after);
    const second = (await expect(call("/profiles?limit=1&after=" + first.next_after), 200)).data;
    assert.equal(second.items.length, 1);
    assert.notEqual(first.items[0].customer_id, second.items[0].customer_id);
    assert.equal(second.next_after, null);
  });
  await check("repeated confirmation returns a stable conflict", () =>
    expect(confirm(job), 409, "ALREADY_COMMITTED"),
  );
  await check("credential columns are rejected at the server boundary", () =>
    expect(
      call("/locations/" + L + "/imports/preview?kind=customers", {
        method: "POST",
        csv: "external_key,display_name,password\na,Fake,not-a-real-secret\n",
      }),
      422,
      "INVALID_COLUMNS",
    ),
  );
  await check("oversized CSV is bounded before staging", async () => {
    const value = await new Promise((resolve, reject) => {
      const req = httpRequest(
        server.origin + route("/locations/" + L + "/imports/preview?kind=customers"),
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + tokens.managerA,
            "content-type": "text/csv",
            "content-length": "5242881",
          },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => (text += chunk));
          res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(text) }));
        },
      );
      req.on("error", reject);
      req.flushHeaders();
    });
    assert.equal(value.status, 413);
    assert.equal(value.data.error.code, "FILE_LIMIT");
  });
  await check("customer export contains only own history", async () => {
    const exportJob = (
      await expect(
        call("/exports", { as: "customerA", method: "POST", json: { customer_id: C } }),
        201,
      )
    ).data;
    const value = await expect(
      call("/exports/" + exportJob.job_id + "/download", { as: "customerA" }),
      200,
    );
    assert.equal(value.data.profiles.length, 1);
    assert.equal(value.data.profiles[0].customer_id, C);
    assert.ok(value.data.bookings.every((row) => row.customer_id === C));
    assert.ok(!value.text.includes("actor_id"));
    await expect(
      call("/exports/" + exportJob.job_id + "/download", { as: "managerB" }),
      404,
      "NOT_FOUND",
    );
  });
  await check("manager export delivery is authenticated and formula-safe", async () => {
    await fixture.admin.query(
      "UPDATE mawid_core.customer_profiles SET display_name='=FICTIONAL()' WHERE workspace_id=$1 AND customer_id=$2",
      [A, C],
    );
    const exported = (await expect(call("/exports", { method: "POST", json: {} }), 201)).data;
    await expect(call("/exports/" + exported.job_id), 200);
    const result = await expect(call("/exports/" + exported.job_id + "/download?format=csv"), 200);
    assert.match(result.headers.get("content-type"), /^text\/csv/);
    assert.ok(result.text.includes('"\'=FICTIONAL()"'));
    assert.ok(!result.text.includes("fictional-b@example.invalid"));
  });
  job = await preview(
    "rollback-first",
    "rollback-second,Fictional second,fixture2@example.invalid\r\n",
  );
  await fixture.admin.query(
    "CREATE FUNCTION public.inject_api_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_key='rollback-second' THEN RAISE EXCEPTION 'FICTIONAL_PRIVATE_FAILURE private@example.invalid'; END IF; RETURN NEW; END $$;CREATE TRIGGER inject_api_failure BEFORE INSERT ON mawid_core.customer_profiles FOR EACH ROW EXECUTE FUNCTION public.inject_api_failure();",
  );
  await check(
    "HTTP failure rolls back every row, audit and job status without leaking database errors",
    async () => {
      const result = await expect(confirm(job), 500, "INTERNAL_ERROR");
      assert.ok(!result.text.includes("private@example.invalid"));
      assert.ok(!JSON.stringify(logs).includes("private@example.invalid"));
      assert.ok(!JSON.stringify(logs).includes(fixture.configs[0].password));
      const {
        rows: [row],
      } = await fixture.admin.query(
        "SELECT (SELECT count(*) FROM mawid_core.customer_profiles WHERE external_key LIKE 'rollback-%')::integer AS n,(SELECT count(*) FROM mawid_core.transfer_audit WHERE job_id=$1)::integer AS audit",
        [job.job_id],
      );
      assert.equal(row.n, 0);
      assert.equal(row.audit, 0);
      assert.equal((await expect(call("/imports/" + job.job_id), 200)).data.status, "previewed");
    },
  );
  await fixture.admin.query(
    "DROP TRIGGER inject_api_failure ON mawid_core.customer_profiles;DROP FUNCTION public.inject_api_failure();",
  );
  await check("retry after transaction rollback commits exactly once", async () =>
    assert.equal((await expect(confirm(job), 200)).data.row_count, 2),
  );
  const savedExport = (await expect(call("/exports", { method: "POST", json: {} }), 201)).data;
  job = await preview("revoke-test");
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE actor_id=$1",
    [IDS.managerActorA],
  );
  await check("membership revocation is enforced again on saved jobs and reads", async () => {
    await expect(call("/profiles"), 404, "NOT_FOUND");
    await expect(call("/imports/" + job.job_id), 404, "NOT_FOUND");
    await expect(confirm(job), 404, "NOT_FOUND");
    await expect(call("/exports/" + savedExport.job_id + "/download"), 404, "NOT_FOUND");
  });
  await fixture.admin.query("UPDATE mawid_core.memberships SET revoked_at=NULL WHERE actor_id=$1", [
    IDS.managerActorA,
  ]);
  const expired = service.issueSession(USERS.managerA, 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  await check("expired server sessions cannot be replayed", () =>
    expect(
      call("/profiles", { headers: { authorization: "Bearer " + expired.token } }),
      401,
      "SESSION_REQUIRED",
    ),
  );
  service.revokeSession(tokens.customerA);
  await check("explicitly revoked server sessions cannot be replayed", () =>
    expect(call("/profiles", { as: "customerA" }), 401, "SESSION_REQUIRED"),
  );
  const oldToken = tokens.managerA;
  await server.close();
  await service.close();
  await boot();
  await check("server restart retains committed PostgreSQL data", async () => {
    const result = await expect(call("/profiles"), 200);
    assert.ok(
      result.data.items.some((row) => row.display_name === "Fictional imported saved-through-http"),
    );
  });
  await check("server restart invalidates old synthetic sessions", () =>
    expect(
      call("/profiles", { headers: { authorization: "Bearer " + oldToken } }),
      401,
      "SESSION_REQUIRED",
    ),
  );
  await fixture.restart();
  await check("database restart retains records readable through HTTP", async () => {
    const result = await expect(call("/profiles"), 200);
    assert.ok(
      result.data.items.some((row) => row.display_name === "Fictional imported saved-through-http"),
    );
  });
  const files = [
    "scripts/database/api/data-service.mjs",
    "scripts/database/api/http-server.mjs",
    "scripts/database/api/fixture.mjs",
    "scripts/database/api/verify-api.mjs",
    "package-lock.json",
    ...readdirSync(path.join(root, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => "supabase/migrations/" + f),
  ];
  writeFileSync(
    path.join(root, "database/api-verification.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        postgres: (await fixture.admin.query("SHOW server_version")).rows[0].server_version,
        image: IMAGE,
        files: files.map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(path.join(root, name)))
            .digest("hex"),
        })),
        checks: results,
        limits: [
          "Fictional server-issued local sessions only; issue #5 real identity integration remains unverified.",
          "The public demo remains browser-local. This loopback API is not deployed or imported into the web bundle.",
          "Booking transitions are issue #7; exhaustive endpoint authorization coverage is the next step.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(results.length + " local API checks passed.");
} catch (error) {
  console.error("LOCAL_API_VERIFICATION_FAILED", {
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
