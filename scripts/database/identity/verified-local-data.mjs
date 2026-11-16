import { LocalDataService } from "../api/data-service.mjs";
import { SessionError, VerifiedSessions } from "./session-gate.mjs";

// Exercises verified identities against the existing disposable RLS fixture.
// Per-actor database logins remain fictional; this is not a hosted connection factory.
export class VerifiedLocalDataService extends LocalDataService {
  #gate;
  #principals;
  constructor(configs, gate) {
    super(configs);
    if (!(gate instanceof VerifiedSessions)) throw new Error("VERIFIED_SESSIONS_REQUIRED");
    this.#gate = gate;
    this.#principals = new Set(configs.map((config) => config.user));
  }
  issueSession() {
    throw new Error("FICTIONAL_SESSION_ISSUER_DISABLED");
  }
  revokeSession() {
    throw new Error("PROVIDER_REVOCATION_REQUIRED");
  }
  authenticate(header) {
    return this.#gate.authenticate(header);
  }
  async assertSession(handle) {
    const principal = await this.#gate.principal(handle);
    if (!this.#principals.has(principal)) throw new SessionError();
    return principal;
  }
  async transaction(handle, fn) {
    const principal = await this.assertSession(handle);
    return super.transaction(principal, async (client) => {
      // Check again after a pooled connection wait, and before its commit.
      await this.assertSession(handle);
      const result = await fn(client);
      await this.assertSession(handle);
      return result;
    });
  }
}
