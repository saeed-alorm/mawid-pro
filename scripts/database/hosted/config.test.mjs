import test from "node:test";
import assert from "node:assert/strict";
import { hostedConfig } from "./config.mjs";
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
    { STAGING_SESSION_DATABASE_URL: undefined },
  ])
    assert.throws(() => hostedConfig({ ...config(), ...change }));
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
