import test from "node:test";
import assert from "node:assert/strict";
import { FcmSender } from "./fcm.mjs";
import { randomUUID } from "node:crypto";
const input = () => ({
  token: "synthetic-registration-not-a-real-device-token",
  notificationId: randomUUID(),
  eventId: randomUUID(),
  deliveryId: randomUUID(),
  locale: "ar",
  applicationId: "com.mawid.customer.platinum",
  environment: "staging",
  workspaceId: randomUUID(),
  locationId: randomUUID(),
});
function sender(response) {
  return new FcmSender({
    projectId: "mawid-development",
    getAccessToken: async () => "synthetic-server-access",
    request: async () => response,
  });
}
const error = (status, code, headers = {}) =>
  new Response(
    JSON.stringify({
      error: {
        message: "synthetic private provider details",
        details: [
          { "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode: code },
        ],
      },
    }),
    { status, headers },
  );
test("FCM sends only generic EN/AR text and opaque IDs with stable replacement tag", async () => {
  const job = input();
  let wire;
  const s = new FcmSender({
    projectId: "mawid-development",
    getAccessToken: async () => "synthetic-server-access",
    request: async (url, options) => {
      assert.equal(url, "https://fcm.googleapis.com/v1/projects/mawid-development/messages:send");
      wire = JSON.parse(options.body);
      return new Response(
        JSON.stringify({ name: "projects/mawid-development/messages/synthetic" }),
      );
    },
  });
  assert.deepEqual(await s.send(job), { status: "accepted" });
  assert.equal(wire.message.notification.title, "تحديث من موعد");
  assert.equal(wire.message.android.notification.tag, job.notificationId);
  assert.equal(wire.message.android.notification.visibility, "PRIVATE");
  assert.equal(wire.message.android.restrictedPackageName, job.applicationId);
  assert.equal(wire.message.data.application_id, job.applicationId);
  assert.equal(wire.message.data.environment, job.environment);
  assert.equal(wire.message.data.workspace_id, job.workspaceId);
  assert.equal(wire.message.data.location_id, job.locationId);
  assert.deepEqual(Object.keys(wire.message.data).sort(), [
    "application_id",
    "delivery_id",
    "environment",
    "event_id",
    "location_id",
    "notification_id",
    "schema",
    "workspace_id",
  ]);
  assert.ok(!JSON.stringify(wire).includes("customer_id"));
});
test("only explicit UNREGISTERED invalidates a token; payload and authorization errors do not", async () => {
  assert.deepEqual(await sender(error(404, "UNREGISTERED")).send(input()), {
    status: "invalid_token",
  });
  assert.deepEqual(await sender(error(400, "INVALID_ARGUMENT")).send(input()), {
    status: "failed",
    code: "PAYLOAD",
  });
  assert.deepEqual(await sender(error(403, "SENDER_ID_MISMATCH")).send(input()), {
    status: "failed",
    code: "AUTHORIZATION",
  });
});
test("FCM overload respects retry-after and quota uses at least a minute", async () => {
  assert.deepEqual(
    await sender(error(503, "UNAVAILABLE", { "retry-after": "120" })).send(input()),
    { status: "retry", code: "UNAVAILABLE", retryAfterMs: 120000 },
  );
  assert.deepEqual(await sender(error(429, "QUOTA_EXCEEDED")).send(input()), {
    status: "retry",
    code: "QUOTA",
    retryAfterMs: 60000,
  });
});
test("transport exceptions and malformed acknowledgements are safe retry outcomes", async () => {
  const s = new FcmSender({
    projectId: "mawid-development",
    getAccessToken: async () => "synthetic-server-access",
    request: async () => {
      throw Error("synthetic sensitive provider detail");
    },
  });
  assert.deepEqual(await s.send(input()), { status: "retry", code: "TRANSPORT" });
  assert.deepEqual(await sender(new Response("{}", { status: 200 })).send(input()), {
    status: "retry",
    code: "UNAVAILABLE",
  });
});
