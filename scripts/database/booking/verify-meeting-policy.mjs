import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createLocalFixture, IDS, USERS, AUTH_USERS, id } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { createSignedSessionFixture } from "../identity/signed-session-fixture.mjs";
import { LocalBookingService } from "./service.mjs";
import { instant, canSelfCancel, isLateCancellation } from "./time.mjs";
import { LocalNotifications } from "../notifications/service.mjs";
import { SimulatedSender } from "../notifications/policy.mjs";

const signed = process.argv.includes("--verified-identity");
const { workspaceA: W, locationA: L, customerA: C, service: S, professional: P } = IDS;
const partners = [USERS.managerA, AUTH_USERS.otherManagerA];
const employees = [
  AUTH_USERS.professionalA,
  ...["two", "three", "four"].map((n) => `mawid_fixture_professional_${n}`),
];
const professionals = [P, id(42), id(43), id(44)];
const checks = [];
let fixture, data, issuer, booking, notifications, server;
const tokens = new Map();
async function check(name, run) {
  await run();
  checks.push({ name, passed: true });
  console.log("PASS " + name);
}
async function call(user, tail, input) {
  const response = await fetch(`${server.origin}/v1/workspaces/${W}/locations/${L}/${tail}`, {
    method: input ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${tokens.get(user)}`,
      ...(input ? { "content-type": "application/json" } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  return { status: response.status, value: await response.json() };
}
function expect(result, status) {
  assert.equal(result.status, status, JSON.stringify(result.value));
  return result.value;
}
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
function start(hour) {
  const wall = `${future}T${String(hour).padStart(2, "0")}:00:00`;
  try {
    instant(wall + "+02:00");
    return wall + "+02:00";
  } catch {
    return wall + "+03:00";
  }
}
const request = (professional = P, hour = 10) => ({
  operation_id: randomUUID(),
  customer_id: C,
  service_id: S,
  professional_id: professional,
  start: start(hour),
});
const action = (b, extra = {}) => ({
  operation_id: randomUUID(),
  expected_version: b.version,
  ...extra,
});
const detail = (b) => `booking-core/bookings/${b.booking_id}`;
try {
  fixture = await createLocalFixture({ authorizationFixtures: true, bookingFixtures: true });
  // Fictional operator setup: two independent partner identities and four employees.
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET roles=ARRAY['admin','manager'] WHERE workspace_id=$1 AND actor_id=ANY($2::uuid[])",
    [W, [id(101), id(107)]],
  );
  for (let i = 1; i < employees.length; i++) {
    const actor = id(109 + i),
      professional = professionals[i],
      user = employees[i];
    await fixture.admin.query(
      `CREATE ROLE ${user} LOGIN PASSWORD '${fixture.configs[0].password}'; GRANT mawid_local_actor TO ${user}`,
    );
    fixture.configs.push({ ...fixture.configs[0], user });
    await fixture.admin.query("INSERT INTO mawid_core.principals VALUES($1,$2)", [user, actor]);
    await fixture.admin.query(
      "INSERT INTO mawid_core.memberships(workspace_id,actor_id,location_id,roles) VALUES($1,$2,$3,ARRAY['professional'])",
      [W, actor, L],
    );
    await fixture.admin.query(
      "INSERT INTO mawid_core.professionals(workspace_id,location_id,professional_id,external_key,display_name) VALUES($1,$2,$3,$4,'Fictional employee')",
      [W, L, professional, `employee-${i}`],
    );
    await fixture.admin.query(
      "INSERT INTO mawid_core.professional_bindings VALUES($1,$2,$3,$4,NULL)",
      [W, L, actor, professional],
    );
    await fixture.admin.query("INSERT INTO mawid_core.eligibility VALUES($1,$2,$3,$4)", [
      W,
      L,
      professional,
      S,
    ]);
    await fixture.admin.query(
      "INSERT INTO mawid_core.professional_intervals(workspace_id,location_id,professional_id,kind,period) VALUES($1,$2,$3,'availability',tstzrange(clock_timestamp()-interval '1 day',clock_timestamp()+interval '180 days','[)'))",
      [W, L, professional],
    );
  }
  data = new LocalDataService(fixture.configs);
  issuer = data;
  if (signed) {
    await data.close();
    issuer = await createSignedSessionFixture(fixture);
    data = issuer.service;
  }
  booking = new LocalBookingService(data, fixture.bookingConfig);
  notifications = new LocalNotifications(data, booking, fixture.notificationConfig, {
    key: randomBytes(32),
    sender: new SimulatedSender(),
  });
  server = await startLocalDataServer(data, { booking, notifications });
  for (const { user } of fixture.configs) tokens.set(user, (await issuer.issueSession(user)).token);
  const rows = [];
  for (const professional of professionals) {
    let b = expect(
      await call(USERS.customerA, "booking-core/requests", request(professional)),
      201,
    );
    b = expect(await call(partners[0], detail(b) + "/confirm", action(b)), 200);
    rows.push(b);
  }
  const extraOwn = [];
  await check("booking worker can lock bindings but cannot rewrite them", async () => {
    await assert.rejects(
      booking.pool.query(
        "UPDATE mawid_core.professional_bindings SET revoked_at=clock_timestamp()",
      ),
      /row-level security/,
    );
  });
  await check("both partners have booking management capabilities", async () => {
    for (const partner of partners) {
      let b = expect(await call(partner, "booking-core/walk-ins", request(P, 12)), 201);
      extraOwn.push(b.booking_id);
      expect(await call(partner, detail(b) + "/cancel", action(b)), 200);
      b = expect(await call(USERS.customerA, "booking-core/requests", request(P, 13)), 201);
      extraOwn.push(b.booking_id);
      b = expect(
        await call(
          partner,
          detail(b) + "/propose",
          action(b, { professional_id: P, start: start(14) }),
        ),
        200,
      );
      expect(await call(partner, detail(b) + "/decline", action(b)), 200);
    }
  });
  for (let i = 0; i < employees.length; i++) {
    await check(
      `employee ${i + 1} sees only own appointments through RLS, lists and detail`,
      async () => {
        const user = employees[i],
          own = rows[i],
          other = rows[(i + 1) % rows.length];
        const expectedIds = [own.booking_id, ...(i === 0 ? extraOwn : [])].sort();
        const actor = await data.authenticate(`Bearer ${tokens.get(user)}`);
        const sql = await data.transaction(
          actor,
          async (c) =>
            (await c.query("SELECT booking_id FROM mawid_core.bookings ORDER BY booking_id")).rows,
        );
        assert.deepEqual(sql.map((r) => r.booking_id).sort(), expectedIds);
        const view = expect(await call(user, "booking-core/view"), 200);
        assert.deepEqual(view.bookings.map((r) => r.booking_id).sort(), expectedIds);
        assert.equal(view.customers.length, 0);
        assert.equal(view.bookings[0].overdue, undefined);
        assert.equal(view.bookings[0].can_cancel, false);
        const raw = expect(await call(user, "bookings"), 200);
        assert.deepEqual(raw.items.map((r) => r.booking_id).sort(), expectedIds);
        expect(await call(user, detail(own)), 200);
        const denied = expect(await call(user, detail(other)), 404);
        assert.equal(denied.error.code, "NOT_FOUND");
        expect(await call(user, `booking-core/bookings/${id(999)}`), 404);
        await assert.rejects(
          data.transaction(actor, (c) =>
            c.query("UPDATE mawid_core.professional_bindings SET professional_id=$1", [
              professionals[(i + 1) % professionals.length],
            ]),
          ),
          /permission denied/,
        );
      },
    );
    await check(`employee ${i + 1} cannot create or manage bookings`, async () => {
      const user = employees[i],
        own = rows[i];
      expect(await call(user, "booking-core/walk-ins", request(professionals[i], 15)), 403);
      for (const op of ["confirm", "decline", "cancel"])
        expect(await call(user, detail(own) + "/" + op, action(own)), 403);
      expect(
        await call(
          user,
          detail(own) + "/propose",
          action(own, { professional_id: professionals[i], start: start(15) }),
        ),
        403,
      );
    });
  }
  await check("unassigned requests do not appear in employee views", async () => {
    const input = request(P, 16);
    delete input.professional_id;
    const b = expect(await call(USERS.customerA, "booking-core/requests", input), 201);
    for (const employee of employees) expect(await call(employee, detail(b)), 404);
    expect(await call(partners[1], detail(b)), 200);
  });
  await check("notifications are appointment-scoped and recheck binding revocation", async () => {
    const user = employees[0],
      own = rows[0];
    expect(
      await call(user, "notifications/registrations", {
        installation_id: randomUUID(),
        application_id: "com.mawid.demo",
        environment: "development",
        locale: "en",
        token: "fictional-meeting-policy-token",
      }),
      200,
    );
    await fixture.admin.query(
      "UPDATE mawid_core.outbox SET deliver_after=clock_timestamp()-interval '1 minute'",
    );
    await notifications.materialize();
    const inbox = expect(await call(user, "notifications/inbox"), 200).items;
    assert.ok(inbox.length);
    assert.ok(inbox.every((n) => [own.booking_id, ...extraOwn].includes(n.booking_id)));
    const n = inbox.find((n) => n.own);
    assert.ok(n);
    expect(await call(user, `notifications/inbox/${n.notification_id}/open`, {}), 200);
    expect(await call(employees[1], `notifications/inbox/${n.notification_id}/open`, {}), 404);
    const forbiddenRequests = await fixture.admin.query(
      "SELECT count(*) AS n FROM mawid_core.notification_inbox n JOIN mawid_core.booking_events e USING(workspace_id,event_id) WHERE n.actor_id=$1 AND e.action='request'",
      [id(108)],
    );
    assert.equal(forbiddenRequests.rows[0].n, "0");
    const job = await notifications.claim();
    // Claim a destination-bearing job deterministically for this employee.
    const candidate = (
      await fixture.admin.query(
        "SELECT d.* FROM mawid_core.push_deliveries d JOIN mawid_core.notification_inbox n USING(notification_id) WHERE n.actor_id=$1 AND d.destination_id IS NOT NULL LIMIT 1",
        [id(108)],
      )
    ).rows[0];
    assert.ok(candidate);
    assert.ok(job);
    await fixture.admin.query(
      "UPDATE mawid_core.professional_bindings SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND actor_id=$2",
      [W, id(108)],
    );
    assert.equal((await notifications.prepare(candidate)).skip, "ACCESS_REVOKED");
    expect(await call(user, `notifications/inbox/${n.notification_id}/open`, {}), 404);
    assert.equal(expect(await call(user, "notifications/inbox"), 200).items.length, 0);
    assert.equal(expect(await call(user, "booking-core/view"), 200).bookings.length, 0);
    expect(await call(user, detail(own)), 404);
  });
  await check("one-hour boundary and appointment start are distinct", () => {
    assert.equal(canSelfCancel(0, 1), true);
    assert.equal(canSelfCancel(1, 1), false);
    assert.equal(isLateCancellation(0, 3600000), false);
    assert.equal(isLateCancellation(1000, 3600000), true);
    assert.equal(isLateCancellation(-1000, 3600000), false);
  });
  await check("late cancellation succeeds and its retry is counted once", async () => {
    const own = rows[0];
    await fixture.admin.query("BEGIN");
    await fixture.admin.query(
      "UPDATE mawid_core.bookings SET assigned_start=date_trunc('minute',clock_timestamp())+interval '20 minutes',assigned_end=date_trunc('minute',clock_timestamp())+interval '50 minutes' WHERE booking_id=$1",
      [own.booking_id],
    );
    await fixture.admin.query(
      "UPDATE mawid_core.allocations a SET period=tstzrange(b.assigned_start,b.assigned_end,'[)') FROM mawid_core.bookings b WHERE a.booking_id=b.booking_id AND b.booking_id=$1",
      [own.booking_id],
    );
    await fixture.admin.query("COMMIT");
    const hint = expect(await call(USERS.customerA, detail(own)), 200);
    assert.equal(hint.can_cancel, true);
    assert.equal(hint.cancellation_is_late, true);
    const payload = action(own),
      first = expect(await call(USERS.customerA, detail(own) + "/cancel", payload), 200);
    assert.equal(first.state, "cancelled");
    assert.deepEqual(
      expect(await call(USERS.customerA, detail(own) + "/cancel", payload), 200),
      first,
    );
    const actor = await data.authenticate(`Bearer ${tokens.get(partners[0])}`);
    assert.equal(
      (
        await data.transaction(actor, (c) =>
          c.query("SELECT mawid_core.cancellation_count($1,$2) AS n", [W, C]),
        )
      ).rows[0].n,
      "1",
    );
  });
  await check(
    "early and salon cancellations do not count; exact 60-minute SQL boundary is excluded",
    async () => {
      expect(await call(USERS.customerA, detail(rows[1]) + "/cancel", action(rows[1])), 200);
      expect(await call(partners[1], detail(rows[2]) + "/cancel", action(rows[2])), 200);
      const existing = await fixture.admin.query(
        "SELECT count(*) AS n FROM mawid_core.bookings WHERE state='cancelled'",
      );
      assert.ok(Number(existing.rows[0].n) >= 3);
      const at = new Date(Date.now() - 86400000);
      await fixture.admin.query(
        "INSERT INTO mawid_core.bookings(workspace_id,location_id,customer_id,service_id,requested_start,requested_end,assigned_start,assigned_end,state,cancelled_at,cancellation_actor) VALUES($1,$2,$3,$4,$5::timestamptz+interval '60 minutes',$5::timestamptz+interval '90 minutes',$5::timestamptz+interval '60 minutes',$5::timestamptz+interval '90 minutes','cancelled',$5,'customer')",
        [W, L, C, S, at],
      );
      const actor = await data.authenticate(`Bearer ${tokens.get(partners[0])}`);
      assert.equal(
        (
          await data.transaction(actor, (c) =>
            c.query("SELECT mawid_core.cancellation_count($1,$2) AS n", [W, C]),
          )
        ).rows[0].n,
        "1",
      );
    },
  );
  const sources = [
    "supabase/migrations/20261117132037_professional_scope_late_cancellation.sql",
    "scripts/database/api/fixture.mjs",
    "scripts/database/booking/service.mjs",
    "scripts/database/booking/time.mjs",
    "scripts/database/notifications/service.mjs",
    "scripts/database/booking/verify-meeting-policy.mjs",
  ];
  writeFileSync(
    `database/meeting-policy-${signed ? "signed" : "local"}-verification.json`,
    JSON.stringify(
      {
        mode: signed ? "signed-fixture-identities" : "synthetic-local-identities",
        scope:
          "two fictional partner managers, four own-only professionals; no hosted changes or device acceptance",
        checked_at: new Date().toISOString(),
        sources: Object.fromEntries(
          sources.map((p) => [p, createHash("sha256").update(readFileSync(p)).digest("hex")]),
        ),
        checks,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${checks.length} meeting-policy checks passed (${signed ? "signed" : "local"}).`);
} finally {
  await server?.close();
  await notifications?.close();
  await booking?.close();
  await data?.close();
  await fixture?.close();
}
