import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createLocalFixture, IDS, USERS, id } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalBookingService } from "./service.mjs";

const fixture = await createLocalFixture({ bookingFixtures: true });
const data = new LocalDataService(fixture.configs);
const booking = new LocalBookingService(data, fixture.bookingConfig);
const server = await startLocalDataServer(data, { booking });
const { workspaceA: w, locationA: l, professional: a, service: first, customerA: customer } = IDS;
const b = id(42);
const second = id(52);
const start = new Date(Date.now() + 86400000).toISOString().slice(0, 10) + "T08:00:00Z";
const base = "/v1/workspaces/" + w + "/locations/" + l;
const draft = {
  customer_id: customer,
  start,
  segments: [
    { service_id: first, professional_id: a },
    { service_id: second, professional_id: b },
  ],
};
const request = async (user, suffix, body) => {
  const response = await fetch(server.origin + base + suffix, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + data.issueSession(user).token,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json() };
};
const action = (user, visit, verb, fields = {}) =>
  request(user, "/visit-core/visits/" + visit.booking_id + "/" + verb, {
    operation_id: randomUUID(),
    expected_version: visit.version,
    ...fields,
  });
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
  assert.equal(
    (await request(USERS.customerA, "/booking-core/bookings/" + pending.body.booking_id)).status,
    404,
  );
  const legacy = await request(USERS.managerA, "/booking-core/view");
  assert.equal(
    legacy.body.bookings.some((visit) => visit.booking_id === pending.body.booking_id),
    false,
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
  assert.equal(
    (await request(USERS.customerA, "/visit-core/caller-intake", callerIntent)).status,
    403,
  );
  assert.equal((await request(USERS.managerB, "/visit-core/callers?q=Fictional")).status, 404);
  console.log(
    "Visit chain, second-segment conflict, replay, buffers and atomic cancellation verified.",
  );
} finally {
  await server.close();
  await booking.close();
  await data.close();
  await fixture.close();
}
