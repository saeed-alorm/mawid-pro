import { dataTransaction, ScopedDataService } from "../api/data-service.mjs";
import { SessionError, VerifiedSessions } from "./session-gate.mjs";

export async function setVerifiedIdentity(client, { issuer, subject }) {
  await client.query(
    "SELECT set_config('mawid.verified_issuer',$1,true),set_config('mawid.verified_subject',$2,true)",
    [issuer, subject],
  );
}

// The pool is configured on the server and uses a single, restricted login.
export class VerifiedDataService extends ScopedDataService {
  #gate;
  #pool;
  constructor(pool, gate) {
    super();
    if (!(gate instanceof VerifiedSessions)) throw new Error("VERIFIED_SESSIONS_REQUIRED");
    this.#gate = gate;
    this.#pool = pool;
  }

  async verifyPrincipals() {
    const {
      rows: [row],
    } = await this.#pool.query(`
      SELECT r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication
          AS privileged,
        pg_has_role(session_user, 'mawid_verified_actor', 'USAGE') AS verified,
        pg_has_role(session_user, 'mawid_local_booking', 'MEMBER') OR
          pg_has_role(session_user, 'mawid_local_notify', 'MEMBER') OR
          pg_has_role(session_user, 'mawid_local_maintenance', 'MEMBER') AS worker,
        mawid_core.actor() AS actor_id
      FROM pg_roles r WHERE r.rolname = session_user
    `);
    if (!row || row.privileged || !row.verified || row.worker || row.actor_id !== null)
      throw new Error("UNSAFE_VERIFIED_PRINCIPAL");
  }

  authenticate(header) {
    return this.#gate.authenticate(header);
  }

  assertSession(handle) {
    return this.#gate.principal(handle);
  }

  notificationIdentity(handle) {
    return this.#gate.identity(handle);
  }
  notificationSessionActive(identity) {
    return this.#gate.notificationSessionActive(identity);
  }

  async transaction(handle, fn) {
    await this.assertSession(handle);
    return dataTransaction(this.#pool, async (client) => {
      const identity = await this.#gate.identity(handle);
      await setVerifiedIdentity(client, identity);
      const {
        rows: [row],
      } = await client.query("SELECT mawid_core.actor() AS id");
      if (row.id !== identity.principal) throw new SessionError();
      const result = await fn(client);
      await this.assertSession(handle);
      return result;
    });
  }

  close() {
    return this.#pool.end();
  }
}
