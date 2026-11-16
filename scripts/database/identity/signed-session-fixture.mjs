import { randomUUID } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { VerifiedSessions } from "./session-gate.mjs";
import { VerifiedDataService } from "./verified-data.mjs";
import { bindFixtureIdentity, createVerifiedPool } from "./verified-pg-fixture.mjs";

// Test issuer only. Never imported by a client, live listener or sign-in endpoint.
export async function createSignedSessionFixture(fixture) {
  const issuer = "https://signed-fixture.example.invalid/auth/v1";
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: randomUUID(), alg: "ES256", use: "sig" };
  const accounts = new Map();
  for (const { user } of fixture.configs) {
    const subject = randomUUID();
    const actor = await bindFixtureIdentity(fixture, issuer, subject, user);
    accounts.set(user, { subject, actor });
  }
  const rows = new Map(),
    tokens = new Map();
  const gate = new VerifiedSessions({
    issuer,
    audience: "authenticated",
    jwks: { keys: [jwk] },
    policy: { maximumAccessSeconds: 300, maximumSessionMs: 900000, inactivityMs: 900000 },
    readSession: async ({ issuer: requested, subject, sessionId }) => {
      const row = rows.get(sessionId);
      return requested === issuer && row?.subject === subject ? row : null;
    },
  });
  const service = new VerifiedDataService(await createVerifiedPool(fixture), gate);
  return {
    service,
    async issueSession(user, ttlMs = 900000) {
      const account = accounts.get(user);
      if (!account || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 900000)
        throw new Error("INVALID_SIGNED_FIXTURE_SESSION");
      const now = Date.now(),
        sessionId = randomUUID(),
        { subject, actor } = account;
      rows.set(sessionId, {
        issuer,
        subject,
        sessionId,
        principal: actor,
        bindingVersion: 1,
        bindingRevokedAt: null,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: now + ttlMs,
        revokedAt: null,
        disabled: false,
      });
      const token = await new SignJWT({
        sub: subject,
        session_id: sessionId,
        role: "authenticated",
        is_anonymous: false,
      })
        .setProtectedHeader({ alg: "ES256", kid: jwk.kid, typ: "JWT" })
        .setIssuer(issuer)
        .setAudience("authenticated")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      tokens.set(token, sessionId);
      return { token, expires_at: new Date(now + ttlMs).toISOString() };
    },
    revokeSession(token) {
      const row = rows.get(tokens.get(token));
      if (row) row.revokedAt = Date.now();
    },
  };
}
