import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalFixture, IDS, USERS, AUTH_USERS, id } from "../api/fixture.mjs";
import { createSignedSessionFixture } from "../identity/signed-session-fixture.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalNotifications } from "../notifications/service.mjs";
import { SimulatedSender } from "../notifications/policy.mjs";
import { LocalBookingService } from "./service.mjs";

const fixture = await createLocalFixture({ bookingFixtures: true, authorizationFixtures: true });
const issuer = await createSignedSessionFixture(fixture);
const data = issuer.service;
const booking = new LocalBookingService(data, fixture.bookingConfig);
let now = Date.now();
const notifications = new LocalNotifications(data, booking, fixture.notificationConfig, {
  key: Buffer.alloc(32, 2),
  sender: new SimulatedSender(),
  now: () => now,
});
const server = await startLocalDataServer(data, { booking, notifications });
const { workspaceA: w, locationA: l, customerA: customer, professional, service } = IDS;
const base = `${server.origin}/v1/workspaces/${w}/locations/${l}/`;
const day = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
const start = day + "T08:00:00Z";
const tokens = new Map();
const result = async (user, path, status, body) => {
  if (!tokens.has(user)) tokens.set(user, (await issuer.issueSession(user)).token);
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: { authorization: "Bearer " + tokens.get(user), "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  assert.equal(response.status, status, JSON.stringify(value));
  return value;
};
const transition = (visit, action, extra = {}, user = USERS.managerA) =>
  result(user, `visit-core/visits/${visit.booking_id}/${action}`, 200, {
    operation_id: randomUUID(),
    expected_version: visit.version,
    ...extra,
  });
const invite = async (visit) =>
  (
    await fixture.admin.query(
      `SELECT o.scheduled_due_at AS due FROM mawid_core.outbox o JOIN mawid_core.booking_events e USING(workspace_id,event_id)
   WHERE e.booking_id=$1 AND e.version=$2 AND o.scheduled_kind='review_invitation'`,
      [visit.booking_id, visit.version],
    )
  ).rows[0]?.due;
const invites = async () =>
  (await result(USERS.customerA, "notifications/inbox?contract=2", 200)).items.filter(
    (n) => n.kind === "review_invitation",
  );
try {
  const segment = { service_id: service, professional_id: professional };
  const pending = await result(USERS.customerA, "visit-core/requests", 201, {
    customer_id: customer,
    operation_id: randomUUID(),
    start,
    segments: [segment, segment],
  });
  const confirmed = await transition(pending, "confirm");
  assert.equal(
    +(await invite(confirmed)),
    Date.parse(confirmed.segments.at(-1).assigned_end) + 120000,
  );
  const rescheduled = await transition(confirmed, "reschedule", { start: day + "T10:00:00Z" });
  now = +(await invite(confirmed));
  await notifications.runOnce();
  assert.equal((await invites()).length, 0);
  now = +(await invite(rescheduled)) - 1;
  await notifications.runOnce();
  assert.equal((await invites()).length, 0);
  now++;
  await notifications.runOnce();
  assert.equal((await invites()).length, 1);
  const cancelTarget = await result(USERS.customerA, "visit-core/requests", 201, {
    customer_id: customer,
    operation_id: randomUUID(),
    start: day + "T12:00:00Z",
    segments: [segment],
  });
  const cancelled = await transition(cancelTarget, "confirm");
  await transition(cancelled, "cancel", {}, USERS.customerA);
  now = +(await invite(cancelled));
  await notifications.runOnce();
  assert.equal((await invites()).length, 1);

  const reviewPath = `visit-core/visits/${rescheduled.booking_id}/reviews`;
  await result(USERS.customerA, reviewPath, 409);
  await result(AUTH_USERS.otherCustomerA, reviewPath, 404);
  await result(USERS.customerB, reviewPath, 404);
  await result(USERS.managerA, reviewPath, 404);

  // Keep the database's actual clock as the authorization boundary.
  await fixture.admin.query(
    `UPDATE mawid_core.outbox SET scheduled_due_at=clock_timestamp()-interval '1 minute'
     WHERE (workspace_id,event_id) IN (SELECT workspace_id,event_id FROM mawid_core.booking_events
     WHERE booking_id=$1 AND version=$2)`,
    [rescheduled.booking_id, rescheduled.version],
  );
  await fixture.admin.query("BEGIN");
  await fixture.admin.query(
    `UPDATE mawid_core.bookings SET assigned_start=assigned_start-interval '7 days',
      assigned_end=assigned_end-interval '7 days' WHERE booking_id=$1`,
    [rescheduled.booking_id],
  );
  await fixture.admin.query(
    `UPDATE mawid_core.visit_segments SET assigned_start=assigned_start-interval '7 days',
      assigned_end=assigned_end-interval '7 days' WHERE booking_id=$1`,
    [rescheduled.booking_id],
  );
  await fixture.admin.query(
    `UPDATE mawid_core.allocations SET period=tstzrange(lower(period)-interval '7 days',upper(period)-interval '7 days','[)')
     WHERE booking_id=$1`,
    [rescheduled.booking_id],
  );
  await fixture.admin.query("COMMIT");

  const eligible = await result(USERS.customerA, reviewPath, 200);
  assert.deepEqual(eligible.professional_ids, [professional]);
  const submit = (reviews, status) =>
    result(USERS.customerA, reviewPath, status, { operation_id: randomUUID(), reviews });
  await submit([{ professional_id: id(89), score: 5 }], 422);
  await submit([{ professional_id: professional, score: 4.5 }], 422);
  await submit(
    [{ professional_id: professional, score: 5, feedback: "Private fixture feedback" }],
    200,
  );
  await submit([{ professional_id: professional, score: 1 }], 409);
  const catalog = await result(USERS.customerA, "visit-core/view", 200);
  const ratings = catalog.professionals.find((p) => p.professional_id === professional);
  assert.deepEqual([ratings.rating_average, ratings.rating_count], [5, 1]);
  assert.ok(!JSON.stringify(catalog).includes("Private fixture feedback"));
  const management = await result(USERS.managerA, reviewPath + "-feedback", 200);
  assert.equal(management.reviews[0].feedback, "Private fixture feedback");
  await fixture.admin.query("SELECT mawid_core.anonymize_customer($1,$2)", [w, customer]);
  const erased = await result(USERS.managerA, reviewPath + "-feedback", 200);
  assert.equal(erased.reviews[0].feedback, null);
  await result(USERS.customerA, reviewPath, 404);
  console.log(
    "Signed review ownership, scheduling, revision suppression, uniqueness, ratings and erasure verified.",
  );
} finally {
  await server.close();
  await notifications.close();
  await booking.close();
  await data.close();
  await fixture.close();
}
