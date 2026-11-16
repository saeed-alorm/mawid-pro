import { Pool } from "pg";
import { randomBytes, createHash } from "node:crypto";

export async function dataTransaction(pool, fn) {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      broken = true;
    }
    throw error;
  } finally {
    client.release(broken);
  }
}

export class ScopedDataService {
  async assertWorkspace(client, workspaceId) {
    const {
      rows: [row],
    } = await client.query(
      "SELECT EXISTS(SELECT 1 FROM mawid_core.memberships WHERE workspace_id=$1 AND revoked_at IS NULL) OR EXISTS(SELECT 1 FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND actor_id=mawid_core.actor() AND anonymized_at IS NULL) AS allowed",
      [workspaceId],
    );
    if (!row.allowed) {
      const e = new Error("NOT_FOUND");
      e.code = "P0002";
      throw e;
    }
  }
  async assertProfileRead(client, workspaceId) {
    const {
      rows: [row],
    } = await client.query(
      "SELECT mawid_core.has_role($1,NULL,ARRAY['manager','admin']) OR EXISTS(SELECT 1 FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND actor_id=mawid_core.actor() AND anonymized_at IS NULL) AS allowed",
      [workspaceId],
    );
    if (!row.allowed) {
      const error = new Error("NOT_FOUND");
      error.code = "P0002";
      throw error;
    }
  }
  async assertBookingRead(client, workspaceId, locationId) {
    const {
      rows: [row],
    } = await client.query(
      "SELECT (mawid_core.has_role($1,$2,ARRAY['manager','admin','professional']) AND EXISTS(SELECT 1 FROM mawid_core.locations WHERE workspace_id=$1 AND location_id=$2)) OR EXISTS(SELECT 1 FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND actor_id=mawid_core.actor() AND anonymized_at IS NULL) AS allowed",
      [workspaceId, locationId],
    );
    if (!row.allowed) {
      const error = new Error("NOT_FOUND");
      error.code = "P0002";
      throw error;
    }
  }
  async assertLocation(client, workspaceId, locationId) {
    const {
      rows: [row],
    } = await client.query(
      "SELECT mawid_core.has_role($1,$2,ARRAY['manager','admin','professional']) AND EXISTS(SELECT 1 FROM mawid_core.locations WHERE workspace_id=$1 AND location_id=$2) AS allowed",
      [workspaceId, locationId],
    );
    if (!row.allowed) {
      const e = new Error("NOT_FOUND");
      e.code = "P0002";
      throw e;
    }
  }
}

// Rehearsal adapter only: config is issued by the local fixture owner, never HTTP.
export class LocalDataService extends ScopedDataService {
  #pools = new Map();
  #sessions = new Map();
  constructor(configs) {
    super();
    if (!Array.isArray(configs) || configs.length < 1 || configs.length > 12)
      throw new Error("LOCAL_CONFIG_REQUIRED");
    for (const config of configs) {
      if (
        config.host !== "127.0.0.1" ||
        !Number.isInteger(config.port) ||
        config.port < 1 ||
        config.port > 65535 ||
        !/^mawid_local_data_[a-f0-9]+$/.test(config.database) ||
        !/^mawid_fixture_[a-z_]+$/.test(config.user) ||
        typeof config.password !== "string" ||
        config.password.length < 32 ||
        this.#pools.has(config.user)
      ) {
        throw new Error("LOCAL_CONFIG_REQUIRED");
      }
      const pool = new Pool({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: false,
        max: 2,
        idleTimeoutMillis: 1000,
        connectionTimeoutMillis: 2000,
        statement_timeout: 5000,
        lock_timeout: 2000,
        options: "-c search_path=pg_catalog",
        application_name: "mawid-fictional-data-api",
      });
      // Idle connection failures (including a local database restart) must not crash the process.
      pool.on("error", () => {});
      this.#pools.set(config.user, pool);
    }
  }
  async verifyPrincipals() {
    for (const [user, pool] of this.#pools) {
      const {
        rows: [row],
      } = await pool.query(
        "SELECT session_user AS name, r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication AS privileged, mawid_core.actor() AS actor_id, pg_has_role(current_user, 'mawid_local_actor', 'MEMBER') AS adapter_role FROM pg_roles r WHERE r.rolname=session_user",
      );
      if (!row || row.name !== user || row.privileged || !row.actor_id || !row.adapter_role)
        throw new Error("UNSAFE_LOCAL_PRINCIPAL");
    }
  }
  issueSession(user, ttlMs = 15 * 60 * 1000) {
    if (!this.#pools.has(user) || !Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 15 * 60 * 1000)
      throw new Error("INVALID_LOCAL_SESSION");
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + ttlMs;
    this.#sessions.set(this.#digest(token), { user, expiresAt });
    return { token, expires_at: new Date(expiresAt).toISOString() };
  }
  #digest(token) {
    return createHash("sha256").update(token).digest("hex");
  }
  revokeSession(token) {
    this.#sessions.delete(this.#digest(token));
  }
  authenticate(header) {
    if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) return null;
    const key = this.#digest(header.slice(7));
    const session = this.#sessions.get(key);
    if (!session || session.expiresAt <= Date.now()) {
      this.#sessions.delete(key);
      return null;
    }
    return session.user;
  }
  async transaction(user, fn) {
    const pool = this.#pools.get(user);
    if (!pool) throw new Error("NOT_FOUND");
    return dataTransaction(pool, fn);
  }
  async close() {
    this.#sessions.clear();
    await Promise.all([...this.#pools.values()].map((pool) => pool.end()));
  }
}
