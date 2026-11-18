import test from "node:test";
import assert from "node:assert/strict";
import { hostedConfig } from "./config.mjs";
import { createHostedRuntime } from "./runtime.mjs";
import { BookingService } from "../booking/service.mjs";
import { Notifications } from "../notifications/service.mjs";
import { applicationAllows } from "../notifications/applications.mjs";
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
