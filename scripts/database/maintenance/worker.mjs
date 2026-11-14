import { Pool } from "pg";
import { randomUUID } from "node:crypto";
export const MAINTENANCE_LOCK = [17001, 6];
export class LocalMaintenanceWorker {
  #pool;
  #active;
  #closed = false;
  #log;
  constructor(config, { log = (event) => console.error(JSON.stringify(event)) } = {}) {
    if (
      config?.host !== "127.0.0.1" ||
      !Number.isInteger(config.port) ||
      config.port < 1 ||
      config.port > 65535 ||
      !/^mawid_local_data_[a-f0-9]+$/.test(config.database) ||
      config.user !== "mawid_fixture_maintenance" ||
      typeof config.password !== "string" ||
      config.password.length < 32
    )
      throw new Error("LOCAL_MAINTENANCE_CONFIG_REQUIRED");
    this.#pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: false,
      max: 1,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 1000,
      statement_timeout: 10000,
      lock_timeout: 2000,
      options: "-c search_path=pg_catalog",
      application_name: "mawid-fictional-maintenance",
    });
    this.#pool.on("error", () => {});
    this.#log = log;
  }
  async verifyPrincipal() {
    const {
      rows: [row],
    } = await this.#pool.query(
      "SELECT session_user AS name,r.rolsuper OR r.rolbypassrls OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication AS privileged,pg_has_role(session_user,'mawid_local_maintenance','MEMBER') AS worker,pg_has_role(session_user,'mawid_local_actor','MEMBER') AS actor,EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='mawid_core' AND pg_has_role(session_user,c.relowner,'MEMBER')) AS owner FROM pg_roles r WHERE r.rolname=session_user",
    );
    if (
      !row ||
      row.name !== "mawid_fixture_maintenance" ||
      row.privileged ||
      !row.worker ||
      row.actor ||
      row.owner
    )
      throw new Error("UNSAFE_MAINTENANCE_PRINCIPAL");
  }
  runOnce() {
    if (this.#closed) return Promise.reject(new Error("MAINTENANCE_CLOSED"));
    if (this.#active) return Promise.resolve({ status: "skipped", code: "MAINTENANCE_BUSY" });
    this.#active = this.#run().finally(() => {
      this.#active = undefined;
    });
    return this.#active;
  }
  async #run() {
    const runId = randomUUID();
    const started = new Date();
    let client;
    let broken = false;
    try {
      client = await this.#pool.connect();
      await client.query("BEGIN");
      const {
        rows: [lock],
      } = await client.query(
        "SELECT pg_try_advisory_xact_lock($1,$2) AS acquired",
        MAINTENANCE_LOCK,
      );
      if (!lock.acquired) {
        await client.query("ROLLBACK");
        return { status: "skipped", code: "MAINTENANCE_BUSY" };
      }
      const {
        rows: [row],
      } = await client.query("SELECT mawid_core.perform_local_maintenance() AS counts");
      await client.query(
        "INSERT INTO mawid_core.maintenance_runs(run_id,started_at,finished_at,status,counts) VALUES($1,$2,clock_timestamp(),'succeeded',$3::jsonb)",
        [runId, started, JSON.stringify(row.counts)],
      );
      await client.query("COMMIT");
      return { status: "succeeded", run_id: runId, counts: row.counts };
    } catch {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          broken = true;
        }
      }
      // No error text, SQL, staged rows or contact fields escape this boundary.
      if (client && !broken) {
        try {
          await client.query(
            "INSERT INTO mawid_core.maintenance_runs(run_id,started_at,finished_at,status,error_code) VALUES($1,$2,clock_timestamp(),'failed','MAINTENANCE_FAILED')",
            [runId, started],
          );
        } catch {
          broken = true;
        }
      }
      const result = { status: "failed", run_id: runId, code: "MAINTENANCE_FAILED" };
      try {
        this.#log(result);
      } catch {}
      return result;
    } finally {
      client?.release(broken);
    }
  }
  async queueErasure(workspaceId, customerId) {
    if (this.#closed) throw new Error("MAINTENANCE_CLOSED");
    const {
      rows: [row],
    } = await this.#pool.query("SELECT mawid_core.queue_erasure($1,$2) AS request_id", [
      workspaceId,
      customerId,
    ]);
    return row.request_id;
  }
  async close() {
    this.#closed = true;
    try {
      await this.#active;
    } finally {
      await this.#pool.end();
    }
  }
}
