import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { createLocalFixture, IDS, USERS, AUTH_USERS } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { LocalBookingService } from "./service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { instant, responseDeadline, nextReview, holdExpiry, canSelfCancel } from "./time.mjs";

const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
let fixture, data, booking, server;
const {
  workspaceA: W,
  workspaceB: B,
  locationA: L,
  customerA: C,
  service: S,
  professional: P,
} = IDS;
const tokens = {};
const root = `/v1/workspaces/${W}/locations/${L}/booking-core/`;
async function call(path, as = "customerA", input, base = root) {
  const res = await fetch(server.origin + base + path, {
    method: input ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + tokens[as],
      ...(input ? { "content-type": "application/json" } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  const value = await res.json();
  return { status: res.status, value };
}
const expect = async (p, status, code) => {
  const r = await p;
  assert.equal(r.status, status, JSON.stringify(r.value));
  if (code) assert.equal(r.value.error.code, code);
  return r.value;
};
// Deterministic future local dates; production time always comes from PostgreSQL.
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const at = (hour) => {
  const wall = `${future}T${String(hour).padStart(2, "0")}:00:00`;
  try {
    instant(wall + "+02:00");
    return wall + "+02:00";
  } catch {
    return wall + "+03:00";
  }
};
const request = (hour = 10, extra = {}) => ({
  operation_id: randomUUID(),
  customer_id: C,
  service_id: S,
  professional_id: P,
  start: at(hour),
  ...extra,
});
const act = (b, extra = {}) => ({
  operation_id: randomUUID(),
  expected_version: b.version,
  ...extra,
});
try {
  await check(
    "Beirut DST gaps, invalid dates and offset-free input are rejected; fold offsets resolve distinct instants",
    () => {
      assert.throws(() => instant("2027-03-28T00:30:00+02:00"));
      assert.throws(() => instant("2027-02-30T10:00:00Z"));
      assert.throws(() => instant("2027-10-30T23:30:00"));
      assert.equal(
        instant("2027-10-30T23:30:00+02:00") - instant("2027-10-30T23:30:00+03:00"),
        3600000,
      );
    },
  );
  await check(
    "opening-minute clock pauses across close and does not double count closed hours",
    () => {
      const p = [
        [0, 5 * 60000],
        [14 * 3600000, 24 * 3600000],
      ];
      assert.equal(responseDeadline(p, 0), 14 * 3600000 + 10 * 60000);
      assert.equal(nextReview(p, 6 * 60000), 14 * 3600000);
    },
  );
  await check("offer hold crosses midnight and self-cancel includes exactly 30 minutes", () => {
    const close = Date.parse("2027-01-10T23:55:00+02:00");
    assert.equal(holdExpiry(close, close + 7200000), close + 3600000);
    assert.equal(holdExpiry(close, close + 60000), close + 60000);
    assert.equal(canSelfCancel(0, 1800000), true);
    assert.equal(canSelfCancel(1, 1800000), false);
  });
  fixture = await createLocalFixture({ authorizationFixtures: true, bookingFixtures: true });
  data = new LocalDataService(fixture.configs);
  booking = new LocalBookingService(data, fixture.bookingConfig);
  server = await startLocalDataServer(data, { booking });
  for (const [name, user] of Object.entries({ ...USERS, ...AUTH_USERS }))
    tokens[name] = data.issueSession(user).token;
  let a, b;
  await check("customer availability is advisory and does not reserve capacity", async () => {
    const r = await expect(
      call(`availability?service_id=${S}&start=${encodeURIComponent(at(10))}`),
      200,
    );
    assert.equal(r.confirmed, false);
    assert.equal(
      (await fixture.admin.query("SELECT count(*) FROM mawid_core.allocations")).rows[0].count,
      "0",
    );
  });
  await check("two competing pending requests persist without allocating a slot", async () => {
    a = await expect(call("requests", "customerA", request()), 201);
    b = await expect(call("requests", "customerA", request()), 201);
    assert.equal(a.state, "pending");
    assert.equal(a.overdue, undefined);
    assert.equal(
      (await fixture.admin.query("SELECT count(*) FROM mawid_core.allocations")).rows[0].count,
      "0",
    );
  });
  await check("cross-workspace, cross-customer and role-forging writes are denied", async () => {
    await expect(call("requests", "customerB", request()), 404, "NOT_FOUND");
    await expect(
      call("requests", "customerA", request(11, { customer_id: IDS.customerB })),
      403,
      "ACTION_DENIED",
    );
    await expect(
      call(`bookings/${a.booking_id}/confirm`, "managerA", act(a)),
      403,
      "ACTION_DENIED",
    );
    await expect(
      call(`bookings/${a.booking_id}/confirm`, "customerA", act(a, { role: "admin" })),
      422,
      "VALIDATION_FAILED",
    );
    await expect(call(`bookings/${a.booking_id}`, "otherCustomerA"), 404, "NOT_FOUND");
    await expect(
      call("requests", "managerB", request(), `/v1/workspaces/${B}/locations/${L}/booking-core/`),
      404,
      "NOT_FOUND",
    );
  });
  await check("independent connections racing to confirm produce exactly one winner", async () => {
    const replies = await Promise.all([
      call(`bookings/${a.booking_id}/confirm`, "adminA", act(a)),
      call(`bookings/${b.booking_id}/confirm`, "adminA", act(b)),
    ]);
    assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
    const winner = replies.find((r) => r.status === 200).value;
    a = winner;
    assert.equal(
      (await fixture.admin.query("SELECT count(*) FROM mawid_core.allocations")).rows[0].count,
      "1",
    );
  });
  await check(
    "identical retries replay once; changed payload and stale versions conflict",
    async () => {
      const payload = request(11);
      const first = await expect(call("requests", "customerA", payload), 201);
      assert.deepEqual(await expect(call("requests", "customerA", payload), 201), first);
      await expect(
        call("requests", "customerA", { ...payload, start: at(12) }),
        409,
        "IDEMPOTENCY_CONFLICT",
      );
      const confirmed = await expect(
        call(`bookings/${first.booking_id}/confirm`, "adminA", act(first)),
        200,
      );
      await expect(
        call(`bookings/${first.booking_id}/cancel`, "adminA", act(first)),
        409,
        "STALE_VERSION",
      );
      await expect(
        call(`bookings/${confirmed.booking_id}/cancel`, "customerA", act(confirmed)),
        200,
      );
    },
  );
  await check(
    "Any assignment requires a manager and reserves nothing until admin confirms",
    async () => {
      const any = await expect(
        call("requests", "customerA", request(12, { professional_id: undefined })),
        201,
      );
      await expect(
        call(`bookings/${any.booking_id}/confirm`, "adminA", act(any)),
        409,
        "ASSIGNMENT_REQUIRED",
      );
      await expect(
        call(`bookings/${any.booking_id}/assign`, "adminA", act(any, { professional_id: P })),
        403,
        "ACTION_DENIED",
      );
      const assigned = await expect(
        call(`bookings/${any.booking_id}/assign`, "managerA", act(any, { professional_id: P })),
        200,
      );
      assert.equal(assigned.state, "pending");
      await expect(call(`bookings/${assigned.booking_id}/confirm`, "adminA", act(assigned)), 200);
    },
  );
  await check(
    "proposal holds one concrete interval and customer acceptance confirms atomically",
    async () => {
      let item = await expect(call("requests", "customerA", request(13)), 201);
      item = await expect(
        call(
          `bookings/${item.booking_id}/propose`,
          "adminA",
          act(item, { professional_id: P, start: at(14) }),
        ),
        200,
      );
      assert.equal(item.state, "proposed");
      assert.ok(+new Date(item.offer_expires_at) - +new Date(item.server_time) <= 3600000);
      await expect(
        call(`availability?service_id=${S}&start=${encodeURIComponent(at(14))}`),
        409,
        "SLOT_UNAVAILABLE",
      );
      item = await expect(call(`bookings/${item.booking_id}/accept`, "customerA", act(item)), 200);
      assert.equal(item.state, "confirmed");
    },
  );
  await check(
    "expired holds are resolved by server time without waiting for a cleanup job",
    async () => {
      let item = await expect(call("requests", "customerA", request(15)), 201);
      item = await expect(
        call(
          `bookings/${item.booking_id}/propose`,
          "adminA",
          act(item, { professional_id: P, start: at(15) }),
        ),
        200,
      );
      await fixture.admin.query("BEGIN");
      await fixture.admin.query(
        "UPDATE mawid_core.bookings SET offer_expires_at=now()-interval '1 second' WHERE booking_id=$1",
        [item.booking_id],
      );
      await fixture.admin.query(
        "UPDATE mawid_core.allocations SET expires_at=now()-interval '1 second' WHERE booking_id=$1",
        [item.booking_id],
      );
      await fixture.admin.query("COMMIT");
      const expiredReplies = await Promise.all([
        call(`bookings/${item.booking_id}/accept`, "customerA", act(item)),
        call(`bookings/${item.booking_id}/accept`, "customerA", act(item)),
      ]);
      for (const reply of expiredReplies) {
        assert.equal(reply.status, 409);
        assert.equal(reply.value.error.code, "OFFER_EXPIRED");
      }
      assert.equal((await expect(call(`bookings/${item.booking_id}`), 200)).state, "expired");
      await expect(call(`availability?service_id=${S}&start=${encodeURIComponent(at(15))}`), 200);
    },
  );
  await check("staff walk-ins share the capacity path and require admin permission", async () => {
    await expect(call("walk-ins", "managerA", request(16)), 403, "ACTION_DENIED");
    const walk = await expect(call("walk-ins", "adminA", request(16)), 201);
    assert.equal(walk.state, "confirmed");
    await expect(call("walk-ins", "adminA", request(16)), 409, "SLOT_UNAVAILABLE");
  });
  await check(
    "breaks, absence, eligibility and buffers are revalidated on transitions",
    async () => {
      let pending = await expect(call("requests", "customerA", request(9)), 201);
      await fixture.admin.query(
        "INSERT INTO mawid_core.professional_intervals(workspace_id,location_id,professional_id,kind,period) VALUES($1,$2,$3,'break',tstzrange($4::timestamptz,$4::timestamptz+interval '1 hour','[)'))",
        [W, L, P, at(9)],
      );
      await expect(
        call(`bookings/${pending.booking_id}/confirm`, "adminA", act(pending)),
        409,
        "SLOT_UNAVAILABLE",
      );
      await fixture.admin.query("DELETE FROM mawid_core.professional_intervals WHERE kind='break'");
      await fixture.admin.query(
        "DELETE FROM mawid_core.eligibility WHERE workspace_id=$1 AND location_id=$2",
        [W, L],
      );
      await expect(
        call(`bookings/${pending.booking_id}/confirm`, "adminA", act(pending)),
        409,
        "SLOT_UNAVAILABLE",
      );
      await fixture.admin.query("INSERT INTO mawid_core.eligibility VALUES($1,$2,$3,$4)", [
        W,
        L,
        P,
        S,
      ]);
      pending = await expect(
        call(`bookings/${pending.booking_id}/confirm`, "adminA", act(pending)),
        200,
      );
      assert.equal(pending.state, "confirmed");
    },
  );
  await check("absence, buffers and holiday exceptions reject unavailable requests", async () => {
    await fixture.admin.query(
      "INSERT INTO mawid_core.professional_intervals(workspace_id,location_id,professional_id,kind,period) VALUES($1,$2,$3,'absence',tstzrange($4::timestamptz,$4::timestamptz+interval '1 hour','[)'))",
      [W, L, P, at(18)],
    );
    await expect(call("requests", "customerA", request(18)), 409, "SLOT_UNAVAILABLE");
    await fixture.admin.query("DELETE FROM mawid_core.professional_intervals WHERE kind='absence'");
    await fixture.admin.query(
      "UPDATE mawid_core.services SET buffer_after=60 WHERE workspace_id=$1 AND location_id=$2",
      [W, L],
    );
    await expect(call("requests", "customerA", request(18)), 409, "SLOT_UNAVAILABLE");
    await fixture.admin.query(
      "UPDATE mawid_core.services SET buffer_after=0 WHERE workspace_id=$1 AND location_id=$2",
      [W, L],
    );
    await fixture.admin.query(
      "INSERT INTO mawid_core.schedule_exceptions(workspace_id,location_id,local_date) VALUES($1,$2,$3)",
      [W, L, future],
    );
    await expect(call("requests", "customerA", request(18)), 409, "SLOT_UNAVAILABLE");
    await fixture.admin.query("DELETE FROM mawid_core.schedule_exceptions");
  });
  await check(
    "failure after booking update rolls back allocation, version, audit, outbox and retry intent",
    async () => {
      const item = await expect(call("requests", "customerA", request(18)), 201);
      const payload = act(item);
      await fixture.admin.query(
        "CREATE FUNCTION public.fail_booking_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'INJECTED_PRIVATE_FAILURE'; END $$; CREATE TRIGGER fail_booking_outbox BEFORE INSERT ON mawid_core.outbox FOR EACH ROW EXECUTE FUNCTION public.fail_booking_outbox()",
      );
      const result = await call(`bookings/${item.booking_id}/confirm`, "adminA", payload);
      assert.equal(result.status, 500);
      assert.ok(!JSON.stringify(result.value).includes("INJECTED_PRIVATE_FAILURE"));
      assert.equal((await expect(call(`bookings/${item.booking_id}`), 200)).version, item.version);
      await fixture.admin.query(
        "DROP TRIGGER fail_booking_outbox ON mawid_core.outbox; DROP FUNCTION public.fail_booking_outbox()",
      );
      const confirmed = await expect(
        call(`bookings/${item.booking_id}/confirm`, "adminA", payload),
        200,
      );
      await expect(call(`bookings/${item.booking_id}/cancel`, "customerA", act(confirmed)), 200);
    },
  );
  await check(
    "withdrawal and decline release proposal holds and terminal transitions cannot repeat",
    async () => {
      for (const action of ["withdraw", "decline"]) {
        let item = await expect(call("requests", "customerA", request(18)), 201);
        item = await expect(
          call(
            `bookings/${item.booking_id}/propose`,
            "adminA",
            act(item, { professional_id: P, start: at(18) }),
          ),
          200,
        );
        item = await expect(
          call(
            `bookings/${item.booking_id}/${action}`,
            action === "withdraw" ? "customerA" : "adminA",
            act(item),
          ),
          200,
        );
        await expect(
          call(
            `bookings/${item.booking_id}/${action}`,
            action === "withdraw" ? "customerA" : "adminA",
            act(item),
          ),
          409,
          "INVALID_TRANSITION",
        );
        await expect(call(`availability?service_id=${S}&start=${encodeURIComponent(at(18))}`), 200);
      }
    },
  );
  await check(
    "overdue stays pending; customer omits the warning; passed start requires a future proposal",
    async () => {
      let item = await expect(call("requests", "customerA", request(18)), 201);
      await fixture.admin.query(
        "UPDATE mawid_core.bookings SET requested_start=clock_timestamp()-interval '1 minute',requested_end=clock_timestamp()+interval '29 minutes',response_due_at=clock_timestamp()-interval '1 minute' WHERE booking_id=$1",
        [item.booking_id],
      );
      const customer = await expect(call(`bookings/${item.booking_id}`), 200);
      assert.equal(customer.state, "pending");
      assert.equal(customer.overdue, undefined);
      const staff = await expect(call(`bookings/${item.booking_id}`, "adminA"), 200);
      assert.equal(staff.overdue, true);
      await expect(
        call(`bookings/${item.booking_id}/confirm`, "adminA", act(item)),
        422,
        "FUTURE_TIME_REQUIRED",
      );
      item = await expect(
        call(
          `bookings/${item.booking_id}/propose`,
          "adminA",
          act(item, { professional_id: P, start: at(18) }),
        ),
        200,
      );
      await expect(call(`bookings/${item.booking_id}/withdraw`, "customerA", act(item)), 200);
    },
  );
  await check(
    "four confirmed customer cancellations count once each without banning new requests",
    async () => {
      for (let i = 0; i < 4; i++) {
        let item = await expect(call("requests", "customerA", request(18)), 201);
        item = await expect(call(`bookings/${item.booking_id}/confirm`, "adminA", act(item)), 200);
        const payload = act(item);
        const outcome = await expect(
          call(`bookings/${item.booking_id}/cancel`, "customerA", payload),
          200,
        );
        assert.deepEqual(
          await expect(call(`bookings/${item.booking_id}/cancel`, "customerA", payload), 200),
          outcome,
        );
      }
      const count = await data.transaction(
        USERS.adminA,
        async (c) =>
          (await c.query("SELECT mawid_core.cancellation_count($1,$2) AS n", [W, C])).rows[0].n,
      );
      assert.ok(Number(count) >= 4);
      await expect(call("requests", "customerA", request(18)), 201);
    },
  );
  await check(
    "submission push and response target are calculated from actual opening periods",
    async () => {
      const item = await expect(call("requests", "customerA", request(18)), 201);
      const row = (
        await fixture.admin.query(
          "SELECT b.submitted_at,b.response_due_at,o.deliver_after FROM mawid_core.bookings b JOIN mawid_core.booking_events e USING(workspace_id,location_id,booking_id) JOIN mawid_core.outbox o USING(workspace_id,event_id) WHERE b.booking_id=$1",
          [item.booking_id],
        )
      ).rows[0];
      const periods = await booking.run(USERS.customerA, W, L, (x) =>
        booking.periods(x, +row.submitted_at),
      );
      assert.equal(+row.deliver_after, nextReview(periods, +row.submitted_at));
      assert.equal(+row.response_due_at, responseDeadline(periods, +row.submitted_at));
    },
  );
  await check(
    "pruned outcomes leave stable intent and cannot recreate an old request",
    async () => {
      const payload = request(18);
      await expect(call("requests", "customerA", payload), 201);
      await fixture.admin.query(
        "UPDATE mawid_core.idempotency_records SET created_at=clock_timestamp()-interval '8 days' WHERE operation_id=$1",
        [payload.operation_id],
      );
      await expect(call("requests", "customerA", payload), 409, "OPERATION_RETIRED");
      await fixture.admin.query(
        "DELETE FROM mawid_core.idempotency_records WHERE operation_id=$1",
        [payload.operation_id],
      );
      await expect(call("requests", "customerA", payload), 409, "OPERATION_RETIRED");
    },
  );
  await check("revocation blocks replay of previously successful requests", async () => {
    const payload = request(17);
    await expect(call("requests", "customerA", payload), 201);
    await fixture.admin.query(
      "UPDATE mawid_core.customer_profiles SET actor_id=NULL WHERE workspace_id=$1 AND customer_id=$2",
      [W, C],
    );
    await expect(call("requests", "customerA", payload), 404, "NOT_FOUND");
  });
  await check(
    "every committed core version has one audit event and one outbox record",
    async () => {
      const r = (
        await fixture.admin.query(
          "SELECT count(*) AS n FROM mawid_core.booking_events e LEFT JOIN mawid_core.outbox o USING(workspace_id,event_id) WHERE o.event_id IS NULL",
        )
      ).rows[0];
      assert.equal(r.n, "0");
      const missing = (
        await fixture.admin.query(
          "SELECT b.booking_id FROM mawid_core.bookings b JOIN mawid_core.booking_events e USING(workspace_id,location_id,booking_id) GROUP BY b.workspace_id,b.location_id,b.booking_id HAVING count(e.event_id)<>b.version",
        )
      ).rows;
      assert.deepEqual(missing, []);
    },
  );
  await check(
    "worker is not superuser/BYPASSRLS and actor cannot mutate bookings directly",
    async () => {
      await booking.verify();
      await assert.rejects(
        data.transaction(USERS.customerA, (c) =>
          c.query("UPDATE mawid_core.bookings SET state='confirmed'"),
        ),
        /permission denied/,
      );
    },
  );
  writeFileSync(
    new URL("../../../database/booking-verification.json", import.meta.url),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        postgres: (await fixture.admin.query("SHOW server_version")).rows[0].server_version,
        files: [
          "scripts/database/booking/service.mjs",
          "scripts/database/booking/time.mjs",
          "scripts/database/booking/verify.mjs",
          "scripts/database/api/http-server.mjs",
          "scripts/database/api/fixture.mjs",
          "scripts/database/api/serve-local.mjs",
          ...readdirSync(new URL("../../../supabase/migrations/", import.meta.url))
            .filter((n) => n.endsWith(".sql"))
            .map((n) => "supabase/migrations/" + n),
        ].map((name) => ({
          name,
          sha256: createHash("sha256")
            .update(readFileSync(new URL("../../../" + name, import.meta.url)))
            .digest("hex"),
        })),
        checks: results,
        limits: [
          "Fictional local sessions; no client, device, notification-provider or production acceptance.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(results.length + " booking checks passed.");
} finally {
  await server?.close();
  await booking?.close();
  await data?.close();
  await fixture?.close();
}
