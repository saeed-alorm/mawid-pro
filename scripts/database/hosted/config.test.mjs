import test from "node:test";
import assert from "node:assert/strict";
import { hostedConfig } from "./config.mjs";
import { createHostedRuntime } from "./runtime.mjs";
import { createDataServer } from "../api/http-server.mjs";
import { BookingService } from "../booking/service.mjs";
import { Notifications } from "../notifications/service.mjs";
import { applicationAllows } from "../notifications/applications.mjs";
import { allowsHostedRoute } from "./rehearsal.mjs";
const config = () => ({
  MAWID_HOSTED_MODE: "staging",
  PILOT_ACCESS: "disabled",
  STAGING_SUBJECTS: "00000000-0000-0000-0000-000000000099",
  STAGING_AUTH_ISSUER: "https://fictional.supabase.co/auth/v1",
  MAWID_API_ORIGIN: "https://booking.example.invalid",
  MAWID_SESSION_POLICY:
    '{"maximumSessionMs":900000,"inactivityMs":900000,"maximumAccessSeconds":300}',
  MAWID_PUSH_KEY_BASE64: Buffer.alloc(32, 1).toString("base64"),
  MAWID_APPLICATION_SCOPES:
    '[{"application_id":"com.mawid.customer.platinum","workspace_id":"00000000-0000-0000-0000-000000000001","location_id":null}]',
  ...Object.fromEntries(
    Object.entries({
      SCOPED: "actor",
      SESSION: "session",
      BOOKING: "booking",
      NOTIFICATION: "notify",
    }).map(([name, role]) => [
      "STAGING_" + name + "_DATABASE_URL",
      `postgresql://mawid_staging_${role}.fictional:fictional@local.pooler.supabase.com:5432/postgres`,
    ]),
  ),
});
test("hosted config requires separate restricted server bindings and explicit staging policy", () => {
  assert.equal(hostedConfig(config()).issuer, "https://fictional.supabase.co/auth/v1");
  for (const change of [
    { PILOT_ACCESS: "enabled" },
    { STAGING_SUBJECTS: "not-a-uuid" },
    { MAWID_HOSTED_MODE: "development" },
    { STAGING_AUTH_ISSUER: "http://127.0.0.1" },
    { MAWID_API_ORIGIN: "https://user:secret@example.invalid" },
    { STAGING_SCOPED_DATABASE_URL: "postgresql://postgres:fictional@db.invalid/postgres" },
    { MAWID_PUSH_KEY_BASE64: "short" },
    { MAWID_APPLICATION_SCOPES: "[]" },
    { MAWID_HOSTED_NOTIFICATIONS: "false" },
    { MAWID_HOSTED_PROBE_ONLY: "yes" },
    { STAGING_SESSION_DATABASE_URL: undefined },
  ])
    assert.throws(() => hostedConfig({ ...config(), ...change }));
});
test("only explicit notification disablement permits booking staging without a sender", async () => {
  assert.throws(() => createHostedRuntime(config()), /HOSTED_FCM_SENDER_REQUIRED/);
  const httpOnly = {
    ...config(),
    MAWID_API_ORIGIN: "https://booking.account.workers.dev",
    MAWID_HOSTED_NOTIFICATIONS: "disabled",
    MAWID_HOSTED_PROBE_ONLY: "true",
    MAWID_APPLICATION_SCOPES: undefined,
    MAWID_PUSH_KEY_BASE64: undefined,
    STAGING_NOTIFICATION_DATABASE_URL: undefined,
  };
  assert.throws(() => hostedConfig({ ...httpOnly, MAWID_HOSTED_NOTIFICATIONS: "enabled" }));
  assert.throws(
    () => hostedConfig({ ...httpOnly, PILOT_ACCESS: "enabled" }),
    /HOSTED_STAGING_ONLY/,
  );
  const runtime = createHostedRuntime(httpOnly);
  try {
    assert.equal(runtime.config.origin, httpOnly.MAWID_API_ORIGIN);
    assert.equal(runtime.config.probeOnly, true);
    assert.deepEqual(Object.keys(runtime.config.pools), ["ACTOR", "IDENTITY", "BOOKING"]);
    assert.equal(runtime.notifications, undefined);
  } finally {
    await runtime.close();
  }
});
const hyperdriveProbe = () => ({
  ...config(),
  MAWID_HOSTED_NOTIFICATIONS: "disabled",
  MAWID_HOSTED_PROBE_ONLY: "true",
  MAWID_HOSTED_DB_TRANSPORT: "hyperdrive",
  MAWID_STAGING_ACTOR_HYPERDRIVE: {
    connectionString: "postgres://actor:fictional@binding.invalid:5432/opaque?sslmode=disable",
  },
  MAWID_STAGING_SESSION_HYPERDRIVE: {
    connectionString: "postgres://session:fictional@binding.invalid:5432/postgres",
  },
  MAWID_STAGING_BOOKING_HYPERDRIVE: {
    connectionString: "postgres://booking:fictional@binding.invalid:5432/postgres",
  },
  STAGING_SCOPED_DATABASE_URL: undefined,
  STAGING_SESSION_DATABASE_URL: undefined,
  STAGING_BOOKING_DATABASE_URL: undefined,
});
test("Hyperdrive is restricted to the notifications-off staging probe", () => {
  const probe = hyperdriveProbe();
  const actual = hostedConfig(probe);
  assert.equal(actual.notifications, undefined);
  for (const [pool, role] of [
    ["ACTOR", "ACTOR"],
    ["IDENTITY", "SESSION"],
    ["BOOKING", "BOOKING"],
  ]) {
    const key = `MAWID_STAGING_${role}_HYPERDRIVE`;
    assert.equal(actual.pools[pool].connectionString, probe[key].connectionString);
    assert.equal(actual.pools[pool].ssl, undefined);
    assert.throws(() => hostedConfig({ ...probe, [key]: undefined }), /INVALID_HYPERDRIVE_BINDING/);
    assert.throws(
      () => hostedConfig({ ...probe, [key]: { connectionString: "https://binding.invalid" } }),
      /INVALID_HYPERDRIVE_BINDING/,
    );
  }
  for (const change of [
    { MAWID_HOSTED_NOTIFICATIONS: "enabled" },
    { MAWID_HOSTED_PROBE_ONLY: "false" },
  ])
    assert.throws(() => hostedConfig({ ...probe, ...change }), /HYPERDRIVE_PROBE_ONLY/);
  assert.throws(
    () => hostedConfig({ ...config(), MAWID_HOSTED_DB_TRANSPORT: "unknown" }),
    /INVALID_HOSTED_DB_TRANSPORT/,
  );
});
const windowStart = "2026-11-20T14:00:00Z";
const windowEnd = "2026-11-20T15:00:00Z";
const rehearsal = {
  workspaceId: "00000000-0000-0000-0000-000000000001",
  locationId: "00000000-0000-0000-0000-000000000002",
  startsAt: windowStart,
  expiresAt: windowEnd,
};
const rehearsalEnv = () => ({
  ...hyperdriveProbe(),
  STAGING_SUBJECTS: [
    config().STAGING_SUBJECTS,
    "00000000-0000-0000-0000-000000000098",
    "00000000-0000-0000-0000-000000000097",
  ].join(","),
  MAWID_HOSTED_REHEARSAL: JSON.stringify(rehearsal),
});
test("rehearsal requires a scoped one-hour UTC window and exactly three approved subjects", () => {
  assert.equal(hostedConfig(rehearsalEnv()).probeOnly, true);
  for (const change of [
    { MAWID_HOSTED_PROBE_ONLY: "false" },
    { MAWID_HOSTED_NOTIFICATIONS: "enabled" },
    { MAWID_HOSTED_DB_TRANSPORT: "direct" },
    { STAGING_SUBJECTS: config().STAGING_SUBJECTS },
    {
      STAGING_SUBJECTS: [
        ...rehearsalEnv().STAGING_SUBJECTS.split(","),
        config().STAGING_SUBJECTS,
      ].join(","),
    },
    { MAWID_HOSTED_REHEARSAL: "null" },
    { MAWID_HOSTED_REHEARSAL: "{" },
  ])
    assert.throws(
      () => hostedConfig({ ...rehearsalEnv(), ...change }),
      /INVALID_BOOKING_REHEARSAL/,
    );
  for (const change of [
    { locationId: "" },
    { workspaceId: "wrong-tenant" },
    { extra: true },
    { startsAt: "2026-11-20T14:00:00+00:00" },
    { expiresAt: "2026-11-21T15:00:00Z" },
    { expiresAt: "2026-11-31T15:00:00Z" },
    { expiresAt: windowStart },
  ])
    assert.throws(
      () =>
        hostedConfig({
          ...rehearsalEnv(),
          MAWID_HOSTED_REHEARSAL: JSON.stringify({ ...rehearsal, ...change }),
        }),
      /INVALID_BOOKING_REHEARSAL/,
    );
});
test("rehearsal permits only the reviewed scope and method/path pairs", () => {
  const actual = hostedConfig(rehearsalEnv());
  const visit = "00000000-0000-0000-0000-000000000003";
  const scope = "/v1/workspaces/" + rehearsal.workspaceId + "/locations/" + rehearsal.locationId;
  const base = scope + "/visit-core";
  const detail = base + "/visits/" + visit;
  const now = Date.parse(windowStart);
  const allows = (method, path, at = now, settings = actual) =>
    allowsHostedRoute(settings, method, new URL(actual.origin + path), at);
  for (const [method, path] of [
    ["GET", "/v1/workspaces"],
    ["GET", "/v1/session?workspace_id=" + rehearsal.workspaceId],
    ["POST", base + "/requests"],
    ["POST", detail + "/confirm"],
    ["GET", detail],
    ["POST", detail + "/cancel"],
  ])
    assert.equal(allows(method, path), true);
  for (const [method, path] of [
    ["POST", "/v1/workspaces"],
    ["HEAD", detail],
    ["GET", base + "/requests"],
    ["GET", detail + "/confirm"],
    ["POST", detail],
    ["POST", detail + "/propose"],
    ["POST", detail + "/reschedule-slots"],
    ["POST", detail + "/reviews"],
    ["POST", base + "/availability"],
    ["GET", base + "/view"],
    ["GET", detail + "?after=anything"],
    ["POST", detail + "/confirm?"],
    ["POST", detail + "/cancel/"],
    ["POST", detail + "%2fconfirm"],
    ["POST", detail + "/%63onfirm"],
    ["POST", base + "/visits/not-a-uuid/confirm"],
    ["POST", scope + "/imports/preview"],
    ["POST", "/v1/workspaces/" + rehearsal.workspaceId + "/exports"],
    ["POST", scope + "/notifications/registrations"],
    ["POST", scope + "/booking-core/requests"],
    ["POST", (base + "/requests").replace(rehearsal.workspaceId, visit)],
    ["POST", (base + "/requests").replace(rehearsal.locationId, visit)],
  ])
    assert.equal(allows(method, path), false, method + " " + path);
  for (const at of [now - 1, Date.parse(windowEnd), Date.parse(windowEnd) + 1]) {
    assert.equal(allows("POST", detail + "/confirm", at), false);
    assert.equal(allows("GET", "/v1/workspaces", at), true);
  }
  assert.equal(allows("POST", detail + "/confirm", now, hostedConfig(hyperdriveProbe())), false);
  assert.equal(allows("POST", detail + "/confirm", now, hostedConfig(config())), true);
});
test("the Cloudflare adapter can enforce the header limit instead of the Node server", async () => {
  const service = { verifyPrincipals() {} };
  const nodeServer = await createDataServer(service);
  const workerServer = await createDataServer(service, { maxHeaderSize: null });
  assert.equal(nodeServer.maxHeaderSize, 16384);
  assert.equal(workerServer.maxHeaderSize, undefined);
});
test("default staging retains the FCM notification service", async () => {
  const runtime = createHostedRuntime(config(), { transport: "fcm", send() {} });
  try {
    assert.ok(runtime.config.pools.NOTIFICATIONS);
    assert.equal(runtime.config.probeOnly, false);
    assert.ok(runtime.notifications instanceof Notifications);
  } finally {
    await runtime.close();
  }
});
test("shared hosted services cannot use a fixture issuer or copied identity object", () => {
  assert.throws(() => new BookingService({ transaction() {} }, {}), /VERIFIED_DATA_REQUIRED/);
  assert.throws(
    () => new Notifications({}, {}, {}, { sender: { send() {} } }),
    /INVALID_NOTIFICATION_CONFIG/,
  );
});
test("native customer and management destinations stay separated for reminders and reviews", () => {
  const customer = { roles: [], customers: ["own"] },
    partner = { roles: ["manager"], customers: [] },
    employee = { roles: ["professional"], customers: [] };
  assert.equal(
    applicationAllows("com.mawid.customer.platinum", customer, "review_invitation"),
    true,
  );
  assert.equal(
    applicationAllows("com.mawid.customer.platinum", customer, "pending_reminder"),
    false,
  );
  for (const access of [partner, employee]) {
    assert.equal(applicationAllows("com.mawid.customer.platinum", access), false);
    assert.equal(applicationAllows("com.mawid.management", access, "review_invitation"), false);
    assert.equal(applicationAllows("com.mawid.management", access), true);
  }
  assert.equal(applicationAllows("com.mawid.management", customer), false);
});
