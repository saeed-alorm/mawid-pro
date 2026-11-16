import { createLocalJWKSet, createRemoteJWKSet, jwtVerify } from "jose";

export class SessionError extends Error {
  constructor(status = 401) {
    const code = status === 503 ? "TEMPORARILY_UNAVAILABLE" : "SESSION_REQUIRED";
    super(code);
    this.status = status;
    this.apiCode = code;
  }
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const positive = (n) => Number.isSafeInteger(n) && n > 0;

// The issuer, audience, keys and session reader are trusted server configuration.
// Token headers, user metadata and application/brand manifests supply none of them.
export class VerifiedSessions {
  #handles = new WeakMap();
  #keys;
  #read;
  #now;
  #issuer;
  #audience;
  #policy;

  constructor({ issuer, audience, jwks, readSession, policy, now = Date.now }) {
    const url = new URL(issuer);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      typeof audience !== "string" ||
      !audience ||
      audience.length > 128 ||
      typeof readSession !== "function" ||
      typeof now !== "function" ||
      !positive(policy?.maximumSessionMs) ||
      !positive(policy?.inactivityMs) ||
      !positive(policy?.maximumAccessSeconds) ||
      policy.maximumAccessSeconds > 3600 ||
      !Number.isInteger(policy.clockToleranceSeconds ?? 0) ||
      (policy.clockToleranceSeconds ?? 0) < 0 ||
      (policy.clockToleranceSeconds ?? 0) > 5
    )
      throw new Error("INVALID_IDENTITY_CONFIG");
    if (jwks instanceof URL) {
      if (jwks.protocol !== "https:" || jwks.username || jwks.password || jwks.hash)
        throw new Error("INVALID_IDENTITY_CONFIG");
      this.#keys = createRemoteJWKSet(jwks, { timeoutDuration: 2000 });
    } else {
      this.#keys = createLocalJWKSet(jwks);
    }
    this.#read = readSession;
    this.#now = now;
    this.#issuer = issuer;
    this.#audience = audience;
    this.#policy = { clockToleranceSeconds: 0, ...policy };
  }

  async #current(identity) {
    let now = this.#now();
    if (!Number.isFinite(now) || identity.tokenExpiresAt <= now) return null;
    let row;
    try {
      row = await this.#read({
        issuer: identity.issuer,
        subject: identity.subject,
        sessionId: identity.sessionId,
      });
    } catch {
      // Never surface provider, SQL or identity details in errors/logs.
      throw new SessionError(503);
    }
    // Lookup/network time counts toward expiry; returned activity may be newer
    // than the instant at which the lookup began.
    now = this.#now();
    if (!Number.isFinite(now) || identity.tokenExpiresAt <= now) return null;
    if (
      !row ||
      row.issuer !== identity.issuer ||
      row.subject !== identity.subject ||
      row.sessionId !== identity.sessionId ||
      row.revokedAt !== null ||
      row.disabled !== false ||
      row.bindingRevokedAt !== null ||
      !positive(row.bindingVersion) ||
      typeof row.principal !== "string" ||
      !row.principal ||
      row.principal.length > 255 ||
      !Number.isFinite(row.createdAt) ||
      !Number.isFinite(row.lastSeenAt) ||
      !Number.isFinite(row.expiresAt) ||
      row.createdAt > now + this.#policy.clockToleranceSeconds * 1000 ||
      row.lastSeenAt > now + this.#policy.clockToleranceSeconds * 1000 ||
      row.lastSeenAt < row.createdAt ||
      row.expiresAt <= now ||
      row.createdAt + this.#policy.maximumSessionMs <= now ||
      row.lastSeenAt + this.#policy.inactivityMs <= now
    )
      return null;
    if (
      identity.principal !== undefined &&
      (row.principal !== identity.principal || row.bindingVersion !== identity.bindingVersion)
    )
      return null;
    return row;
  }

  async authenticate(header) {
    if (
      typeof header !== "string" ||
      header.length > 8192 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(header)
    )
      return null;
    let payload;
    try {
      ({ payload } = await jwtVerify(header.slice(7), this.#keys, {
        issuer: this.#issuer,
        audience: this.#audience,
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["iss", "aud", "sub", "session_id", "iat", "exp"],
        maxTokenAge: this.#policy.maximumAccessSeconds,
        currentDate: new Date(this.#now()),
        clockTolerance: this.#policy.clockToleranceSeconds,
      }));
    } catch (e) {
      if (e.code === "ERR_JWKS_TIMEOUT" || e.code === "ERR_JOSE_GENERIC" || e instanceof TypeError)
        throw new SessionError(503);
      return null;
    }
    if (
      typeof payload.sub !== "string" ||
      !uuid.test(payload.sub) ||
      typeof payload.session_id !== "string" ||
      !uuid.test(payload.session_id) ||
      payload.role !== "authenticated" ||
      payload.is_anonymous === true ||
      !positive(payload.iat) ||
      !positive(payload.exp) ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > this.#policy.maximumAccessSeconds
    )
      return null;
    const identity = {
      issuer: this.#issuer,
      subject: payload.sub,
      sessionId: payload.session_id,
      tokenExpiresAt: payload.exp * 1000,
    };
    const row = await this.#current(identity);
    if (!row) return null;
    const handle = Object.freeze({});
    this.#handles.set(handle, {
      ...identity,
      principal: row.principal,
      bindingVersion: row.bindingVersion,
    });
    return handle;
  }

  async principal(handle) {
    return (await this.identity(handle)).principal;
  }

  async identity(handle) {
    const identity = handle && typeof handle === "object" ? this.#handles.get(handle) : null;
    if (!identity) throw new SessionError();
    if (!(await this.#current(identity))) {
      this.#handles.delete(handle);
      throw new SessionError();
    }
    const { issuer, subject, principal } = identity;
    return { issuer, subject, principal };
  }
}
