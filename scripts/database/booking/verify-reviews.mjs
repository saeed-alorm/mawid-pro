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
const run = booking.run.bind(booking);
let bookingTime;
// Keep real identity, transaction and database state while exercising exact clock boundaries.
booking.run = (user, workspace, location, fn) =>
  run(user, workspace, location, (context) => fn({ ...context, now: bookingTime ?? context.now }));
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
  await result(USERS.customerA, "notifications/registrations", 200, {
    installation_id: randomUUID(),
    application_id: "com.mawid.customer.platinum",
    environment: "development",
    locale: "en",
    token: "synthetic-signed-customer-review-destination",
  });
  await result(USERS.managerA, "notifications/registrations", 200, {
    installation_id: randomUUID(),
    application_id: "com.mawid.management",
    environment: "development",
    locale: "en",
    token: "synthetic-signed-management-review-destination",
  });
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
  const editPath = `visit-core/visits/${confirmed.booking_id}`;
  const reschedule = {
    operation_id: randomUUID(),
    expected_version: confirmed.version,
    start: day + "T10:00:00Z",
  };
  bookingTime = Date.parse(confirmed.segments[0].assigned_start) - 1;
  const rescheduled = await result(USERS.managerA, editPath + "/reschedule", 200, reschedule);
  assert.equal(rescheduled.can_reschedule, true);
  const history = async () =>
    (
      await fixture.admin.query(
        `SELECT version,action FROM mawid_core.booking_events WHERE booking_id=$1 ORDER BY version`,
        [rescheduled.booking_id],
      )
    ).rows;
  const pastEdit = {
    expected_version: rescheduled.version,
    start: day + "T11:30:00Z",
  };
  const beforeCutoffHistory = await history();
  assert.deepEqual(
    beforeCutoffHistory.map(({ action }) => action),
    ["request", "confirm", "reschedule"],
  );
  for (const time of [
    Date.parse(rescheduled.segments[0].assigned_start),
    Date.parse(rescheduled.segments[0].assigned_start) + 1,
    Date.parse(rescheduled.segments.at(-1).assigned_end) + 1,
  ]) {
    bookingTime = time;
    const denied = await result(USERS.managerA, editPath + "/reschedule", 409, {
      ...pastEdit,
      operation_id: randomUUID(),
    });
    assert.equal(denied.error.code, "RESCHEDULE_CUTOFF");
  }
  const deniedPreview = await result(USERS.managerA, editPath + "/reschedule-slots", 409, {
    expected_version: rescheduled.version,
  });
  assert.equal(deniedPreview.error.code, "RESCHEDULE_CUTOFF");
  assert.equal((await result(USERS.managerA, editPath, 200)).can_reschedule, false);
  assert.deepEqual(
    await result(USERS.managerA, editPath + "/reschedule", 200, reschedule),
    rescheduled,
  );
  await result(USERS.managerB, editPath + "/reschedule", 404, reschedule);
  assert.deepEqual(await history(), beforeCutoffHistory);
  bookingTime = undefined;
  now = +(await invite(confirmed));
  await notifications.runOnce();
  assert.equal((await invites()).length, 0);
  now = +(await invite(rescheduled)) - 1;
  await notifications.runOnce();
  assert.equal((await invites()).length, 0);
  now++;
  await notifications.runOnce();
  assert.equal((await invites()).length, 1);
  const reviewNotice = (await invites())[0];
  const reviewDestinations = (
    await fixture.admin.query(
      `SELECT p.application_id,d.* FROM mawid_core.push_deliveries d JOIN mawid_core.notification_inbox n USING(notification_id) JOIN mawid_core.push_destinations p USING(destination_id) WHERE n.notification_id=$1`,
      [reviewNotice.notification_id],
    )
  ).rows;
  assert.deepEqual(
    reviewDestinations.map((d) => d.application_id),
    ["com.mawid.customer.platinum"],
  );
  assert.equal(
    (await notifications.prepare(reviewDestinations[0])).application_id,
    "com.mawid.customer.platinum",
  );
  await result(
    USERS.customerA,
    `notifications/inbox/${reviewNotice.notification_id}/open?contract=2`,
    200,
    {},
  );
  await result(
    AUTH_USERS.otherCustomerA,
    `notifications/inbox/${reviewNotice.notification_id}/open?contract=2`,
    404,
    {},
  );
  await result(
    USERS.managerA,
    `notifications/inbox/${reviewNotice.notification_id}/open?contract=2`,
    404,
    {},
  );
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

  // Simulate validation beginning before the old start while the database
  // reaches the write after it. The scoped SQL update must reject the change.
  const historical = await result(USERS.managerA, editPath, 200);
  bookingTime = Date.parse(historical.segments[0].assigned_start) - 1;
  const crossedWhileValidating = await result(USERS.managerA, editPath + "/reschedule", 409, {
    ...pastEdit,
    operation_id: randomUUID(),
  });
  assert.equal(crossedWhileValidating.error.code, "RESCHEDULE_CUTOFF");
  assert.deepEqual(await history(), beforeCutoffHistory);
  bookingTime = undefined;

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
  const reviewedVisit = await result(USERS.managerA, editPath, 200);
  const reservations = async () =>
    (
      await fixture.admin.query(
        "SELECT segment_position,professional_id,period FROM mawid_core.allocations WHERE booking_id=$1 ORDER BY segment_position",
        [rescheduled.booking_id],
      )
    ).rows;
  const reviewedReservations = await reservations();
  bookingTime = Date.parse(reviewedVisit.segments[0].assigned_start) - 1;
  const reviewedEdit = await result(USERS.managerA, editPath + "/reschedule", 409, {
    ...pastEdit,
    operation_id: randomUUID(),
  });
  assert.equal(reviewedEdit.error.code, "VISIT_HAS_REVIEWS");
  const reviewedPreview = await result(USERS.managerA, editPath + "/reschedule-slots", 409, {
    expected_version: rescheduled.version,
  });
  assert.equal(reviewedPreview.error.code, "VISIT_HAS_REVIEWS");
  assert.equal((await result(USERS.managerA, editPath, 200)).can_reschedule, false);
  bookingTime = undefined;
  const replacement = await result(USERS.customerA, "visit-core/requests", 201, {
    customer_id: customer,
    operation_id: randomUUID(),
    start: day + "T14:00:00Z",
    segments: [segment],
  });
  assert.notEqual(replacement.booking_id, rescheduled.booking_id);
  assert.equal((await transition(replacement, "confirm")).state, "confirmed");
  assert.deepEqual(await reservations(), reviewedReservations);
  assert.deepEqual(await history(), beforeCutoffHistory);
  assert.deepEqual((await result(USERS.managerA, editPath, 200)).segments, reviewedVisit.segments);
  assert.deepEqual(await result(USERS.managerA, reviewPath + "-feedback", 200), management);
  const afterReplacement = (
    await result(USERS.customerA, "visit-core/view", 200)
  ).professionals.find((p) => p.professional_id === professional);
  assert.deepEqual([afterReplacement.rating_average, afterReplacement.rating_count], [5, 1]);
  await fixture.admin.query("SELECT mawid_core.anonymize_customer($1,$2)", [w, customer]);
  const erased = await result(USERS.managerA, reviewPath + "-feedback", 200);
  assert.equal(erased.reviews[0].feedback, null);
  await result(USERS.customerA, reviewPath, 404);
  await result(
    USERS.customerA,
    `notifications/inbox/${reviewNotice.notification_id}/open?contract=2`,
    404,
    {},
  );
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND actor_id=$2",
    [w, IDS.managerActorA],
  );
  await result(USERS.managerA, editPath + "/reschedule", 404, reschedule);
  console.log(
    "Signed review ownership, reschedule cutoff and replay, scheduling, revision suppression, ratings and erasure verified.",
  );
} finally {
  await server.close();
  await notifications.close();
  await booking.close();
  await data.close();
  await fixture.close();
}
