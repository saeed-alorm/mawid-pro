import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalFixture, IDS, USERS, id } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalBookingService } from "./service.mjs";
import { LocalNotifications } from "../notifications/service.mjs";
import { SimulatedSender } from "../notifications/policy.mjs";

const fixture = await createLocalFixture({ bookingFixtures: true });
const data = new LocalDataService(fixture.configs);
const booking = new LocalBookingService(data, fixture.bookingConfig);
let now = Date.now();
const workerOptions = { key: Buffer.alloc(32, 1), now: () => now, sender: new SimulatedSender() };
const notices = new LocalNotifications(data, booking, fixture.notificationConfig, workerOptions);
const secondWorker = new LocalNotifications(
  data,
  booking,
  fixture.notificationConfig,
  workerOptions,
);
const server = await startLocalDataServer(data, { booking });
const { workspaceA: w, locationA: l, professional: a, service: first, customerA: customer } = IDS;
const b = id(42);
const second = id(52);
const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + "T08:00:00Z";
const workspaceBase = "/v1/workspaces/" + w;
const base = workspaceBase + "/locations/" + l;
const draft = {
  customer_id: customer,
  start,
  segments: [
    { service_id: first, professional_id: a },
    { service_id: second, professional_id: b },
  ],
};
const request = async (user, suffix, body) => {
  const response = await fetch(
    server.origin + (suffix.startsWith("/exports") ? workspaceBase : base) + suffix,
    {
      method: body ? "POST" : "GET",
      headers: {
        authorization: "Bearer " + data.issueSession(user).token,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  return { status: response.status, body: await response.json() };
};
const action = (user, visit, verb, fields = {}) =>
  request(user, "/visit-core/visits/" + visit.booking_id + "/" + verb, {
    operation_id: randomUUID(),
    expected_version: visit.version,
    ...fields,
  });
const preview = (user, visit, fields = {}) =>
  request(user, "/visit-core/visits/" + visit.booking_id + "/reschedule-slots", {
    expected_version: visit.version,
    ...fields,
  });
const allocations = async (visit) =>
  (
    await fixture.admin.query(
      "SELECT segment_position,professional_id,period FROM mawid_core.allocations WHERE booking_id=$1 ORDER BY segment_position",
      [visit.booking_id],
    )
  ).rows;
const count = async (id) =>
  (
    await fixture.admin.query(
      "SELECT count(*)::int AS n FROM mawid_core.allocations WHERE booking_id=$1",
      [id],
    )
  ).rows[0].n;

try {
  await fixture.admin.query(
    "INSERT INTO mawid_core.professionals(workspace_id,location_id,professional_id,external_key,display_name) VALUES($1,$2,$3,'test-b','Fictional B')",
    [w, l, b],
  );
  await fixture.admin.query(
    "INSERT INTO mawid_core.services(workspace_id,location_id,service_id,external_key,name,duration_minutes,buffer_before) VALUES($1,$2,$3,'test-style','Fictional style',30,5)",
    [w, l, second],
  );
  await fixture.admin.query(
    "INSERT INTO mawid_core.eligibility VALUES($1,$2,$3,$4),($1,$2,$5,$4)",
    [w, l, b, second, a],
  );
  await fixture.admin.query(
    "INSERT INTO mawid_core.professional_intervals(workspace_id,location_id,professional_id,kind,period) VALUES($1,$2,$3,'availability',tstzrange(clock_timestamp(),clock_timestamp()+interval '7 days','[)'))",
    [w, l, b],
  );
  const available = await request(USERS.customerA, "/visit-core/availability", {
    start,
    segments: draft.segments,
  });
  assert.equal(available.status, 200, JSON.stringify(available));
  assert.equal(available.body.segments.length, 2);
  const input = { ...draft, operation_id: randomUUID() };
  const pending = await request(USERS.customerA, "/visit-core/requests", input);
  assert.equal(pending.status, 201, JSON.stringify(pending));
  assert.equal(pending.body.segments.length, 2);
  assert.deepEqual(await request(USERS.customerA, "/visit-core/requests", input), pending);
  assert.equal(await count(pending.body.booking_id), 0);
  const legacyDetail = "/booking-core/bookings/" + pending.body.booking_id;
  for (const [user, route] of [
    [USERS.customerA, legacyDetail],
    [USERS.customerA, "/booking-core/view"],
    [USERS.managerA, "/booking-core/view"],
    [USERS.managerA, "/bookings"],
  ]) {
    const legacy = await request(user, route);
    assert.equal(legacy.status, 409, JSON.stringify(legacy));
    assert.equal(legacy.body.error.code, "MULTI_SERVICE_VISITS_REQUIRE_UPDATE");
    assert.match(legacy.body.error.message, /update .*multi-service/i);
  }
  assert.equal((await request(USERS.customerB, legacyDetail)).status, 404);
  const legacyWrite = await request(USERS.managerA, legacyDetail + "/cancel", {
    operation_id: randomUUID(),
    expected_version: pending.body.version,
  });
  assert.equal(legacyWrite.status, 409);
  assert.equal(legacyWrite.body.error.code, "MULTI_SERVICE_VISITS_REQUIRE_UPDATE");
  const feedbackWrite = await action(USERS.managerA, pending.body, "reviews-feedback");
  assert.equal(feedbackWrite.status, 404, JSON.stringify(feedbackWrite));
  assert.equal(
    (await request(USERS.customerA, "/visit-core/visits/" + pending.body.booking_id)).body.version,
    pending.body.version,
  );
  const job = await request(USERS.customerA, "/exports", { customer_id: customer });
  assert.equal(job.status, 201, JSON.stringify(job));
  const download = "/exports/" + job.body.job_id + "/download";
  const exportV1 = await request(USERS.customerA, download);
  const exportV2 = await request(USERS.customerA, download + "?contract=2");
  assert.ok(exportV1.body.bookings.every((entry) => entry.booking_id !== pending.body.booking_id));
  assert.equal(
    exportV2.body.bookings.find((entry) => entry.booking_id === pending.body.booking_id).segments
      .length,
    2,
  );

  const competing = await request(USERS.managerA, "/visit-core/walk-ins", {
    customer_id: customer,
    operation_id: randomUUID(),
    start: start.replace("08:00", "08:30"),
    segments: [draft.segments[1]],
  });
  assert.equal(competing.status, 201, JSON.stringify(competing));
  const conflict = await action(USERS.managerA, pending.body, "confirm");
  assert.equal(conflict.status, 409, JSON.stringify(conflict));
  assert.equal(conflict.body.error.code, "SLOT_UNAVAILABLE");
  assert.equal(await count(pending.body.booking_id), 0);
  assert.equal((await action(USERS.managerA, competing.body, "cancel")).status, 200);
  const confirmed = await action(USERS.managerA, pending.body, "confirm");
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed));
  assert.equal(await count(confirmed.body.booking_id), 2);
  assert.equal(confirmed.body.segments[0].assigned_end, confirmed.body.segments[1].assigned_start);
  const cancelled = await action(USERS.customerA, confirmed.body, "cancel");
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
  assert.equal(await count(confirmed.body.booking_id), 0);

  const sameProfessional = await request(USERS.customerA, "/visit-core/availability", {
    start,
    segments: [draft.segments[0], { service_id: second, professional_id: a }],
  });
  assert.equal(sameProfessional.status, 200, JSON.stringify(sameProfessional));
  assert.equal(
    Date.parse(sameProfessional.body.segments[1].requested_start) -
      Date.parse(sameProfessional.body.segments[0].requested_end),
    300000,
  );
  const callerIntent = {
    operation_id: randomUUID(),
    source: "phone",
    caller: { name: "Fictional caller", phone: "+961 70 000 001" },
    start,
    segments: draft.segments,
  };
  const caller = await request(USERS.managerA, "/visit-core/caller-intake", callerIntent);
  assert.equal(caller.status, 201, JSON.stringify(caller));
  assert.deepEqual(
    await request(USERS.managerA, "/visit-core/caller-intake", callerIntent),
    caller,
  );
  const lookup = await request(USERS.managerA, "/visit-core/callers?q=96170000001");
  assert.deepEqual(
    lookup.body.items.map((item) => item.customer_id),
    [caller.body.customer_id],
  );
  const profile = (
    await fixture.admin.query(
      "SELECT actor_id,contact FROM mawid_core.customer_profiles WHERE customer_id=$1",
      [caller.body.customer_id],
    )
  ).rows[0];
  assert.deepEqual(profile, { actor_id: null, contact: "+96170000001" });
  const conflictingCaller = await request(USERS.managerA, "/visit-core/caller-intake", {
    ...callerIntent,
    operation_id: randomUUID(),
    caller: { name: "Uncommitted fictional caller" },
  });
  assert.equal(conflictingCaller.status, 409, JSON.stringify(conflictingCaller));
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS count FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND display_name=$2",
        [w, "Uncommitted fictional caller"],
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (await request(USERS.customerA, "/visit-core/caller-intake", callerIntent)).status,
    403,
  );
  assert.equal((await request(USERS.managerB, "/visit-core/callers?q=Fictional")).status, 404);
  const fresh = await request(USERS.customerA, "/visit-core/requests", {
    ...draft,
    start: start.replace("08:00", "11:00"),
    operation_id: randomUUID(),
  });
  assert.equal(fresh.status, 201, JSON.stringify(fresh));
  const due = (
    await fixture.admin.query(
      "SELECT response_due_at FROM mawid_core.bookings WHERE booking_id=$1",
      [fresh.body.booking_id],
    )
  ).rows[0].response_due_at;
  const reminderActors = async () =>
    (
      await fixture.admin.query(
        `SELECT n.actor_id FROM mawid_core.notification_inbox n
     JOIN mawid_core.booking_events e USING(workspace_id,event_id)
     WHERE e.booking_id=$1 AND n.kind='pending_reminder' ORDER BY n.actor_id`,
        [fresh.body.booking_id],
      )
    ).rows.map((row) => row.actor_id);
  now = +due - 1;
  await notices.runOnce();
  assert.deepEqual(await reminderActors(), []);
  now = +due;
  await Promise.all([notices.runOnce(), secondWorker.runOnce()]);
  assert.deepEqual(await reminderActors(), [id(101), id(105)]);
  await secondWorker.runOnce();
  assert.deepEqual(await reminderActors(), [id(101), id(105)]);
  const at = (hour) => start.replace("08:00", hour);
  const pendingAt = (hour) =>
    request(USERS.customerA, "/visit-core/requests", {
      ...draft,
      start: at(hour),
      operation_id: randomUUID(),
    });
  const candidates = await Promise.all([pendingAt("12:15"), pendingAt("12:15")]);
  for (const candidate of candidates) assert.equal(candidate.status, 201);
  const race = await Promise.all([
    action(USERS.managerA, candidates[0].body, "confirm"),
    action(USERS.adminA, candidates[1].body, "confirm"),
  ]);
  assert.deepEqual(race.map((result) => result.status).sort(), [200, 409]);
  const winner = race.find((result) => result.status === 200).body;
  const loser = candidates.find(
    (candidate) => candidate.body.booking_id !== winner.booking_id,
  ).body;
  assert.equal(await count(winner.booking_id), 2);
  assert.equal(await count(loser.booking_id), 0);
  const otherCustomer = await request(USERS.adminA, "/visit-core/caller-intake", {
    ...draft,
    customer_id: undefined,
    operation_id: randomUUID(),
    source: "walk-in",
    caller: { name: "Another fictional customer" },
    start: at("15:00"),
  });
  assert.equal(otherCustomer.status, 201, JSON.stringify(otherCustomer));
  const offer = await action(USERS.adminA, loser, "propose", { start: at("13:30") });
  assert.equal(offer.status, 200, JSON.stringify(offer));
  assert.equal(await count(loser.booking_id), 2);

  const original = await allocations(winner);
  await fixture.admin.query(
    "UPDATE mawid_core.services SET duration_minutes=90,buffer_before=20,buffer_after=15 WHERE workspace_id=$1 AND location_id=$2 AND service_id=$3",
    [w, l, second],
  );
  const savedPreview = await preview(USERS.managerA, winner);
  assert.equal(savedPreview.status, 200, JSON.stringify(savedPreview));
  const slotAt = (result, hour) =>
    result.body.items.find((item) => Date.parse(item.start) === Date.parse(at(hour)));
  const unchanged = slotAt(savedPreview, "12:15");
  assert.ok(
    unchanged,
    "include the off-grid saved start without conflicting with its own allocations",
  );
  assert.deepEqual(
    unchanged.segments.map((segment) => [
      segment.assigned_professional_id,
      segment.assigned_start,
      segment.assigned_end,
      segment.buffer_before_seconds,
      segment.buffer_after_seconds,
    ]),
    winner.segments.map((segment) => [
      segment.assigned_professional_id,
      segment.assigned_start,
      segment.assigned_end,
      segment.buffer_before_seconds,
      segment.buffer_after_seconds,
    ]),
  );
  assert.ok(slotAt(savedPreview, "12:00"), "allow a replacement overlapping old allocations");
  assert.equal(slotAt(savedPreview, "15:00"), undefined, "respect another customer's booking");
  assert.equal(slotAt(savedPreview, "13:30"), undefined, "respect another visit's offer hold");
  const changed = await preview(USERS.adminA, winner, { assignments: [null, a] });
  assert.equal(changed.status, 200, JSON.stringify(changed));
  const turnover = slotAt(changed, "12:15").segments;
  assert.deepEqual(
    turnover.map((segment) => segment.assigned_professional_id),
    [a, a],
  );
  assert.equal(
    Date.parse(turnover[1].assigned_start) - Date.parse(turnover[0].assigned_end),
    300000,
  );
  assert.equal((await preview(USERS.customerA, winner)).status, 403);
  assert.equal((await preview(USERS.managerB, winner)).status, 404);
  const stalePreview = await preview(USERS.managerA, winner, { expected_version: "1" });
  assert.equal(stalePreview.status, 409);
  assert.equal(stalePreview.body.error.code, "STALE_VERSION");
  assert.deepEqual(await allocations(winner), original, "preview must not mutate reservations");
  const reschedule = await action(USERS.managerA, winner, "reschedule", { start: at("13:30") });
  assert.equal(reschedule.status, 409, JSON.stringify(reschedule));
  assert.deepEqual(
    await allocations(winner),
    original,
    "failed replacement must retain the old reservations",
  );
  await fixture.admin.query("BEGIN");
  await fixture.admin.query(
    "UPDATE mawid_core.bookings SET offer_expires_at=clock_timestamp()-interval '1 minute' WHERE booking_id=$1",
    [loser.booking_id],
  );
  await fixture.admin.query(
    "UPDATE mawid_core.allocations a SET expires_at=b.offer_expires_at FROM mawid_core.bookings b WHERE a.booking_id=b.booking_id AND b.booking_id=$1",
    [loser.booking_id],
  );
  await fixture.admin.query("COMMIT");
  const expired = await action(USERS.customerA, offer.body, "accept");
  assert.equal(expired.status, 409, JSON.stringify(expired));
  assert.equal(expired.body.error.code, "OFFER_EXPIRED");
  assert.equal(await count(loser.booking_id), 0);
  const replacement = { operation_id: randomUUID(), start: at("13:30") };
  const moved = await action(USERS.managerA, winner, "reschedule", replacement);
  assert.equal(moved.status, 200, JSON.stringify(moved));
  assert.deepEqual(await action(USERS.managerA, winner, "reschedule", replacement), moved);
  assert.equal(
    (
      await fixture.admin.query(
        "SELECT count(*)::int AS total FROM mawid_core.booking_events WHERE booking_id=$1 AND action='reschedule'",
        [winner.booking_id],
      )
    ).rows[0].total,
    1,
  );
  assert.equal(await count(winner.booking_id), 2);
  assert.deepEqual(
    moved.body.segments.map((s) => s.assigned_start.slice(11, 16)),
    ["13:30", "14:00"],
  );
  await fixture.admin.query(
    "UPDATE mawid_core.services SET duration_minutes=30,buffer_before=5,buffer_after=0 WHERE workspace_id=$1 AND location_id=$2 AND service_id=$3",
    [w, l, second],
  );
  // Shift the fictional confirmed visit into the final half hour without
  // bypassing the allocation/segment commit constraints.
  const shift = Date.now() + 1800000 - Date.parse(moved.body.segments[0].assigned_start);
  await fixture.admin.query("BEGIN");
  for (const table of ["bookings", "visit_segments"]) {
    await fixture.admin.query(
      `UPDATE mawid_core.${table} SET assigned_start=assigned_start+$2::bigint*interval '1 millisecond',
       assigned_end=assigned_end+$2::bigint*interval '1 millisecond' WHERE booking_id=$1`,
      [winner.booking_id, shift],
    );
  }
  await fixture.admin.query(
    `UPDATE mawid_core.allocations SET period=tstzrange(
      lower(period)+$2::bigint*interval '1 millisecond',upper(period)+$2::bigint*interval '1 millisecond','[)')
      WHERE booking_id=$1`,
    [winner.booking_id, shift],
  );
  await fixture.admin.query("COMMIT");
  const cancellation = { operation_id: randomUUID(), expected_version: moved.body.version };
  const cancelledVisitPath = "/visit-core/visits/" + winner.booking_id + "/cancel";
  const late = await request(USERS.customerA, cancelledVisitPath, cancellation);
  assert.equal(late.status, 200, JSON.stringify(late));
  assert.deepEqual(await request(USERS.customerA, cancelledVisitPath, cancellation), late);
  const manager = await data.authenticate("Bearer " + data.issueSession(USERS.managerA).token);
  assert.equal(
    (
      await data.transaction(manager, (client) =>
        client.query("SELECT mawid_core.cancellation_count($1,$2) AS count", [w, customer]),
      )
    ).rows[0].count,
    "1",
  );
  await action(USERS.customerA, fresh.body, "withdraw");
  const otherReminder = await pendingAt("10:00");
  assert.equal(otherReminder.status, 201);
  await fixture.admin.query(
    "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND actor_id=$2",
    [w, id(105)],
  );
  const nextDue = (
    await fixture.admin.query(
      "SELECT response_due_at FROM mawid_core.bookings WHERE booking_id=$1",
      [otherReminder.body.booking_id],
    )
  ).rows[0].response_due_at;
  now = +nextDue + 1000;
  await secondWorker.runOnce();
  const recentReminders = (
    await fixture.admin.query(
      `SELECT n.actor_id FROM mawid_core.notification_inbox n JOIN mawid_core.booking_events e USING(workspace_id,event_id)
     WHERE e.booking_id=$1 AND n.kind='pending_reminder'`,
      [otherReminder.body.booking_id],
    )
  ).rows;
  assert.deepEqual(recentReminders, [{ actor_id: id(101) }]);
  console.log(
    "Visit chain, second-segment conflict, replay, buffers and atomic cancellation verified.",
  );
} finally {
  await server.close();
  await notices.close();
  await secondWorker.close();
  await booking.close();
  await data.close();
  await fixture.close();
}
