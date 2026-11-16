import assert from "node:assert/strict";
import { test, before } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { VerifiedSessions, SessionError } from "./session-gate.mjs";

const issuer = "https://identity.example.invalid/auth/v1";
const subject = "00000000-0000-0000-0000-000000000102";
const sessionId = "00000000-0000-0000-0000-000000000201";
const policy = { maximumSessionMs: 86400000, inactivityMs: 3600000, maximumAccessSeconds: 300 };
let keys, foreign, jwk;
before(async () => {
  keys = await generateKeyPair("ES256");
  foreign = await generateKeyPair("ES256");
  jwk = { ...(await exportJWK(keys.publicKey)), kid: "fixture", alg: "ES256", use: "sig" };
});

async function fixture() {
  let now = Date.parse("2026-11-16T10:00:00Z");
  const row = {
    issuer,
    subject,
    sessionId,
    principal: "mawid_fixture_customer_a",
    bindingVersion: 1,
    createdAt: now - 1000,
    lastSeenAt: now - 1000,
    expiresAt: now + 86400000,
    revokedAt: null,
    bindingRevokedAt: null,
    disabled: false,
  };
  let missing = false,
    unavailable = false,
    reads = 0;
  const inputs = [];
  const config = {
    issuer,
    audience: "authenticated",
    jwks: { keys: [jwk] },
    policy,
    now: () => now,
    readSession: async (input) => {
      inputs.push(input);
      reads++;
      if (unavailable) throw new Error("provider-secret-must-not-escape");
      return missing ? null : row;
    },
  };
  const gate = new VerifiedSessions(config);
  const token = (claims = {}, options = {}) =>
    new SignJWT({
      iss: issuer,
      aud: "authenticated",
      sub: subject,
      session_id: sessionId,
      role: "authenticated",
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + 300,
      ...claims,
    })
      .setProtectedHeader({ alg: "ES256", kid: "fixture", typ: "JWT", ...options.header })
      .sign(options.key ?? keys.privateKey);
  return {
    row,
    gate,
    config,
    token,
    inputs,
    reads: () => reads,
    advance: (ms) => {
      now += ms;
    },
    remove: () => {
      missing = true;
    },
    fail: () => {
      unavailable = true;
    },
  };
}

test("a verified token yields an opaque handle and a server-bound principal", async () => {
  const f = await fixture();
  const raw = await f.token({ user_metadata: { role: "admin", workspace_id: "another-shop" } });
  const handle = await f.gate.authenticate("Bearer " + raw);
  assert.ok(handle && Object.isFrozen(handle));
  assert.deepEqual(handle, {});
  assert.equal(await f.gate.principal(handle), f.row.principal);
  assert.deepEqual(f.inputs, Array(2).fill({ issuer, subject, sessionId }));
  assert.ok(!JSON.stringify(f.inputs).includes(raw));
});

for (const [name, claims] of [
  ["foreign issuer", { iss: "https://foreign.example.invalid" }],
  ["foreign audience", { aud: "other-service" }],
  ["expired token", { exp: Math.floor(Date.parse("2026-11-16T10:00:00Z") / 1000) - 1 }],
  ["future issued-at", { iat: Math.floor(Date.parse("2026-11-16T10:00:00Z") / 1000) + 1 }],
  ["missing session", { session_id: undefined }],
  ["invalid subject", { sub: "not-a-subject-uuid" }],
  ["array session claim", { session_id: [sessionId] }],
  ["anonymous user", { is_anonymous: true }],
  ["privileged service role", { role: "service_role" }],
  ["client-selected admin role", { role: "admin" }],
  ["overlong token lifetime", { exp: Math.floor(Date.parse("2026-11-16T10:00:00Z") / 1000) + 301 }],
])
  test("rejects " + name + " before session lookup", async () => {
    const f = await fixture();
    assert.equal(await f.gate.authenticate("Bearer " + (await f.token(claims))), null);
    assert.equal(f.reads(), 0);
  });

test("foreign signatures, unknown keys, unsigned and malformed credentials are denied", async () => {
  const f = await fixture();
  for (const raw of [
    await f.token({}, { key: foreign.privateKey }),
    await f.token({}, { header: { kid: "untrusted" } }),
    "eyJhbGciOiJub25lIn0.e30.",
    "abc.def.ghi",
    "x".repeat(8193),
  ])
    assert.equal(await f.gate.authenticate("Bearer " + raw), null);
  for (const header of [undefined, null, [], "Basic abc", "Bearer abc", "Bearer a.b.c extra"])
    assert.equal(await f.gate.authenticate(header), null);
  assert.equal(f.reads(), 0);
});

for (const [name, changes] of [
  ["revoked session", { revokedAt: 1 }],
  ["disabled identity", { disabled: true }],
  ["removed binding", { bindingRevokedAt: 1 }],
  ["different subject", { subject: sessionId }],
  ["different session", { sessionId: subject }],
  ["different issuer", { issuer: "foreign" }],
  ["expired server session", { expiresAt: Date.parse("2026-11-16T10:00:00Z") }],
  ["expired absolute lifetime", { createdAt: Date.parse("2026-11-15T10:00:00Z") }],
  [
    "expired inactivity window",
    {
      createdAt: Date.parse("2026-11-16T08:00:00Z"),
      lastSeenAt: Date.parse("2026-11-16T09:00:00Z"),
    },
  ],
  ["missing lifetime", { expiresAt: null }],
  ["future activity", { lastSeenAt: Infinity }],
])
  test("rejects " + name + " using current server state", async () => {
    const f = await fixture();
    Object.assign(f.row, changes);
    assert.equal(await f.gate.authenticate("Bearer " + (await f.token())), null);
  });

for (const [name, changes] of [
  ["session revocation", { revokedAt: 1 }],
  ["principal reassignment", { principal: "mawid_fixture_manager_a" }],
  ["binding replacement", { bindingVersion: 2 }],
])
  test(name + " invalidates an existing handle", async () => {
    const f = await fixture();
    const handle = await f.gate.authenticate("Bearer " + (await f.token()));
    Object.assign(f.row, changes);
    await assert.rejects(
      f.gate.principal(handle),
      (e) => e instanceof SessionError && e.status === 401,
    );
  });

test("deleted sessions and access-token expiry invalidate existing handles", async () => {
  for (const method of ["remove", "advance"]) {
    const f = await fixture();
    const handle = await f.gate.authenticate("Bearer " + (await f.token()));
    f[method](300000);
    await assert.rejects(f.gate.principal(handle), { message: "SESSION_REQUIRED" });
  }
});

test("strings, copied handles and handles from another gate cannot select an actor", async () => {
  const f = await fixture(),
    other = await fixture();
  const handle = await other.gate.authenticate("Bearer " + (await other.token()));
  for (const forged of [f.row.principal, {}, JSON.parse(JSON.stringify(handle)), handle])
    await assert.rejects(f.gate.principal(forged), { message: "SESSION_REQUIRED" });
  assert.equal(f.reads(), 0);
});

test("session-store outages fail closed with a redacted retryable error", async () => {
  const f = await fixture();
  f.fail();
  await assert.rejects(
    f.gate.authenticate("Bearer " + (await f.token())),
    (e) => e instanceof SessionError && e.status === 503 && e.message === "TEMPORARILY_UNAVAILABLE",
  );
});

test("expiry during a session lookup is denied before returning an authenticated handle", async () => {
  const f = await fixture();
  const gate = new VerifiedSessions({
    ...f.config,
    readSession: async () => {
      f.advance(300000);
      return f.row;
    },
  });
  assert.equal(await gate.authenticate("Bearer " + (await f.token())), null);
});

test("a bounded issuer clock allowance does not extend access-token expiry", async () => {
  const f = await fixture();
  const gate = new VerifiedSessions({
    ...f.config,
    policy: { ...policy, clockToleranceSeconds: 2 },
  });
  const second = Math.floor(f.config.now() / 1000);
  f.row.createdAt = f.config.now() + 1000;
  f.row.lastSeenAt = f.row.createdAt;
  const handle = await gate.authenticate(
    "Bearer " + (await f.token({ iat: second + 1, exp: second + 301 })),
  );
  assert.ok(handle);
  f.advance(301000);
  await assert.rejects(gate.principal(handle), { message: "SESSION_REQUIRED" });
});

test("invalid trust configuration and unbounded session policies fail at construction", async () => {
  const f = await fixture();
  for (const changes of [
    { issuer: "http://identity.example.invalid" },
    { issuer: "https://user:secret@identity.example.invalid" },
    { audience: "" },
    { readSession: undefined },
    { policy: {} },
    { policy: { ...policy, maximumAccessSeconds: 3601 } },
    { policy: { ...policy, clockToleranceSeconds: 6 } },
    { jwks: new URL("http://untrusted.example.invalid/jwks") },
  ])
    assert.throws(() => new VerifiedSessions({ ...f.config, ...changes }));
});
