import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { privateSender } from "./private-sender.mjs";
import { templates } from "./policy.mjs";

const management = "com.mawid.management";
const platinum = "com.mawid.customer.platinum";
const endpoint = "https://fcm-sender.internal/send";
const audience =
  "//iam.googleapis.com/projects/104578849291/locations/global/workloadIdentityPools/mawid-staging/providers/fcm-sender";
const sts = "https://sts.googleapis.com/v1/token";
const iam =
  "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/mawid-staging-fcm@mawid-development.iam.gserviceaccount.com:generateAccessToken";
const fcm = "https://fcm.googleapis.com/v1/projects/mawid-development/messages:send";
const accessType = "urn:ietf:params:oauth:token-type:access_token";
const accepted = { status: "accepted" };
const denied = { status: "failed", code: "AUTHORIZATION" };
const bad = { status: "failed", code: "PAYLOAD" };
const tokenFor = (pkg) => `synthetic-device-token-${pkg}`;
const job = (applicationId = management) => ({
  applicationId,
  token: tokenFor(applicationId),
  environment: "staging",
  locale: "en",
  notificationId: randomUUID(),
  eventId: randomUUID(),
  deliveryId: randomUUID(),
  workspaceId: randomUUID(),
  locationId: randomUUID(),
});
const providerError = (status, errorCode, headers) =>
  Response.json(
    {
      error: {
        message: "synthetic-private-error",
        details: [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }],
      },
    },
    { status, headers },
  );

function fixture() {
  const calls = [],
    assertions = [],
    overrides = new Map();
  const destinations = new Map([management, platinum].map((pkg) => [tokenFor(pkg), pkg]));
  let clock = Date.UTC(2026, 0, 1);
  const env = {
    PILOT_ACCESS: "disabled",
    MAWID_FCM_LIVE: "enabled",
    FCM_WORKLOAD_IDENTITY: {
      getAssertion(value) {
        assertions.push(value);
        return `synthetic-assertion-${assertions.length}`;
      },
    },
  };
  const worker = privateSender({
    now: () => clock,
    request: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({
        url,
        body,
        headers: options.headers,
        redirect: options.redirect,
        method: options.method,
      });
      const override = overrides.get(url)?.shift();
      if (override instanceof Error) throw override;
      if (override) return override;
      if (url === sts)
        return Response.json({
          access_token: `federated-${assertions.length}`,
          issued_token_type: accessType,
          token_type: "Bearer",
        });
      if (url === iam)
        return Response.json({
          accessToken: `access-${assertions.length}`,
          expireTime: new Date(clock + 600000).toISOString(),
        });
      if (url !== fcm) throw Error("unexpected network destination");
      const { token, android } = body.message;
      if (!destinations.has(token)) return providerError(404, "UNREGISTERED");
      if (destinations.get(token) !== android.restrictedPackageName)
        return providerError(400, "INVALID_ARGUMENT");
      return Response.json({ name: "projects/mawid-development/messages/synthetic" });
    },
  });
  const raw = (body, url = endpoint, options = {}) =>
    worker.fetch(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        ...options,
      }),
      env,
    );
  async function send(payload) {
    const response = await raw(JSON.stringify(payload));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const text = await response.text();
    assert.ok(Buffer.byteLength(text) <= 1024);
    assert.doesNotMatch(text, /synthetic|Bearer|access-|federated-/);
    return JSON.parse(text);
  }
  return {
    env,
    calls,
    assertions,
    destinations,
    raw,
    send,
    advance(ms) {
      clock += ms;
    },
    next(url, ...items) {
      overrides.set(url, items);
    },
  };
}

test("private staging contract rejects other routes, environments, packages and caller-supplied payloads before minting", async () => {
  const fake = fixture();
  for (const mutation of [
    { environment: "development" },
    { applicationId: "com.mawid.demo" },
    { applicationId: "com.mawid.customer.cedar" },
    { locale: "fr" },
    { projectId: "different" },
    { notification: { title: "custom" } },
    { topic: "all" },
    { deliveryId: "not-a-uuid" },
    { token: "too-short" },
    { token: "x".repeat(9000) },
  ])
    assert.deepEqual(await fake.send({ ...job(), ...mutation }), bad);
  assert.deepEqual(await (await fake.raw("{")).json(), bad);
  assert.equal((await fake.raw(null, endpoint, { method: "GET" })).status, 404);
  assert.equal((await fake.raw("{}", "https://other.example.invalid/send")).status, 404);
  assert.deepEqual(
    await (await fake.raw("{}", endpoint, { headers: { "content-type": "text/plain" } })).json(),
    bad,
  );
  assert.equal(fake.calls.length + fake.assertions.length, 0);
});

test("live switch defaults closed; pilot or missing private identity refuses all Google calls", async () => {
  for (const vars of [
    { MAWID_FCM_LIVE: undefined },
    { MAWID_FCM_LIVE: "disabled" },
    { PILOT_ACCESS: "enabled" },
    { FCM_WORKLOAD_IDENTITY: undefined },
  ]) {
    const fake = fixture();
    Object.assign(fake.env, vars);
    assert.deepEqual(await fake.send(job()), denied);
    assert.equal(fake.calls.length + fake.assertions.length, 0);
  }
});

test("pins WIF audience, account, scope and project; restricts delivery in both package directions", async () => {
  const fake = fixture();
  for (const [pkg, other, locale] of [
    [management, platinum, "en"],
    [platinum, management, "ar"],
  ]) {
    const payload = { ...job(pkg), locale };
    assert.deepEqual(await fake.send(payload), accepted);
    const message = fake.calls.at(-1).body.message;
    assert.deepEqual(message.notification, templates[locale]);
    assert.equal(message.android.notification.tag, payload.notificationId);
    assert.equal(message.android.restrictedPackageName, pkg);
    assert.deepEqual(message.data, {
      notification_id: payload.notificationId,
      event_id: payload.eventId,
      delivery_id: payload.deliveryId,
      environment: "staging",
      schema: "1",
      application_id: pkg,
      workspace_id: payload.workspaceId,
      location_id: payload.locationId,
    });
    assert.deepEqual(await fake.send({ ...payload, token: tokenFor(other) }), bad);
  }
  assert.deepEqual(fake.assertions, [audience]);
  assert.deepEqual(
    fake.calls.map((call) => call.url),
    [sts, iam, fcm, fcm, fcm, fcm],
  );
  assert.ok(fake.calls.every((call) => call.redirect === "error" && call.method === "POST"));
  assert.equal(fake.calls[0].headers.authorization, undefined);
  assert.deepEqual(fake.calls[0].body, {
    audience,
    subjectToken: "synthetic-assertion-1",
    subjectTokenType: "urn:ietf:params:oauth:token-type:jwt",
    grantType: "urn:ietf:params:oauth:grant-type:token-exchange",
    requestedTokenType: accessType,
    scope: "https://www.googleapis.com/auth/iam",
  });
  assert.equal(fake.calls[1].headers.authorization, "Bearer federated-1");
  assert.deepEqual(fake.calls[1].body, {
    scope: ["https://www.googleapis.com/auth/firebase.messaging"],
    lifetime: "600s",
  });
  assert.ok(fake.calls.slice(2).every((call) => call.headers.authorization === "Bearer access-1"));
});

test("reuses the short-lived OAuth credential only until its refresh window", async () => {
  const fake = fixture();
  const payload = job();
  for (const delta of [0, 539999, 1, 600001]) {
    fake.advance(delta);
    assert.deepEqual(await fake.send(payload), accepted);
  }
  assert.deepEqual(
    fake.calls.filter((call) => call.url === fcm).map((call) => call.headers.authorization),
    ["Bearer access-1", "Bearer access-1", "Bearer access-2", "Bearer access-3"],
  );
});

test("unauthenticated remints once for the same delivery; repeated 401 or forbidden never loops", async () => {
  for (const [errors, expected, count] of [
    [[401], accepted, 2],
    [[401, 401], denied, 2],
    [[403], denied, 1],
  ]) {
    const fake = fixture();
    const payload = job();
    fake.next(fcm, ...errors.map((status) => providerError(status, "AUTH")));
    assert.deepEqual(await fake.send(payload), expected);
    assert.equal(fake.assertions.length, count);
    const attempts = fake.calls.filter((call) => call.url === fcm);
    assert.equal(attempts.length, count);
    for (const [index, attempt] of attempts.entries()) {
      assert.equal(attempt.headers.authorization, `Bearer access-${index + 1}`);
      assert.deepEqual(attempt.body, attempts[0].body);
    }
  }
});

test("only typed HTTP 404 UNREGISTERED retires the old destination; replacement works", async () => {
  const fake = fixture();
  const payload = job();
  fake.destinations.delete(payload.token);
  const replacement = `${payload.token}-rotated`;
  fake.destinations.set(replacement, management);
  assert.deepEqual(await fake.send(payload), { status: "invalid_token" });
  assert.deepEqual(await fake.send({ ...payload, token: replacement }), accepted);
  fake.next(
    fcm,
    providerError(400, "UNREGISTERED"),
    Response.json({ error: { details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 }),
    new Response("unknown", { status: 404 }),
  );
  for (let attempt = 0; attempt < 3; attempt++) assert.deepEqual(await fake.send(payload), bad);
});

test("quota, upstream outages, aborted transport and invalid acknowledgements return bounded safe outcomes", async () => {
  const fake = fixture();
  const payload = job();
  for (const [response, expected] of [
    [providerError(429, "QUOTA_EXCEEDED"), { status: "retry", code: "QUOTA", retryAfterMs: 60000 }],
    [
      providerError(503, "UNAVAILABLE", { "retry-after": "120" }),
      { status: "retry", code: "UNAVAILABLE", retryAfterMs: 120000 },
    ],
    [
      providerError(429, "QUOTA_EXCEEDED", { "retry-after": "99999999" }),
      { status: "retry", code: "QUOTA", retryAfterMs: 3600000 },
    ],
    [Error("synthetic-private-network-error"), { status: "retry", code: "TRANSPORT" }],
    [new DOMException("stop", "AbortError"), { status: "retry", code: "TRANSPORT" }],
    [
      Response.json({ name: "projects/other/messages/fake" }),
      { status: "retry", code: "UNAVAILABLE" },
    ],
    [new Response("x".repeat(17000)), { status: "retry", code: "UNAVAILABLE" }],
  ]) {
    fake.next(fcm, response);
    assert.deepEqual(await fake.send(payload), expected);
  }
});

test("no FCM request on federated exchange or account mint failure", async () => {
  for (const [url, response, expected] of [
    [sts, providerError(403, "DENIED"), denied],
    [iam, providerError(500, "UNAVAILABLE"), { status: "retry", code: "UNAVAILABLE" }],
    [sts, Response.json({ access_token: "bad" }), { status: "retry", code: "UNAVAILABLE" }],
    [
      iam,
      Response.json({ accessToken: "expired", expireTime: "2000-01-01T00:00:00Z" }),
      { status: "retry", code: "UNAVAILABLE" },
    ],
  ]) {
    const fake = fixture();
    fake.next(url, response);
    assert.deepEqual(await fake.send(job()), expected);
    assert.ok(!fake.calls.some((call) => call.url === fcm));
  }
});
