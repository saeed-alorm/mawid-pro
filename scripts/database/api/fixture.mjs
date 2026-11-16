import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  applyLocalMigrations,
  readLocalMigrations,
  FIXTURE_MARKER,
} from "../migrations/runner.mjs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

export const IMAGE =
  "postgres:17.12-bookworm@sha256:40865bc877a289da75963d97d72b59633f639fc5af7a4e856bfa3714cae5b536";
export const id = (n) => "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
export const IDS = {
  workspaceA: id(1),
  workspaceB: id(2),
  locationA: id(11),
  locationB: id(21),
  customerA: id(31),
  customerB: id(32),
  professional: id(41),
  service: id(51),
  bookingA: id(61),
  bookingB: id(62),
  managerActorA: id(101),
  customerActorA: id(102),
};
export const USERS = {
  managerA: "mawid_fixture_manager_a",
  customerA: "mawid_fixture_customer_a",
  managerB: "mawid_fixture_manager_b",
  customerB: "mawid_fixture_customer_b",
  adminA: "mawid_fixture_admin_a",
};
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const AUTH_USERS = {
  locationManagerA: "mawid_fixture_location_manager_a",
  otherManagerA: "mawid_fixture_other_manager_a",
  professionalA: "mawid_fixture_professional_a",
  otherCustomerA: "mawid_fixture_other_customer_a",
};

export async function createLocalFixture({
  authorizationFixtures = false,
  bookingFixtures = false,
  migrationCount,
} = {}) {
  const suffix = randomBytes(8).toString("hex");
  const name = "mawid-issue6-api-" + suffix;
  const database = "mawid_local_data_" + suffix;
  const password = randomBytes(32).toString("hex");
  const docker = (...args) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, POSTGRES_PASSWORD: password, POSTGRES_DB: database },
    });
  let created = false;
  let admin;
  const dispose = async () => {
    try {
      await admin?.end();
    } finally {
      if (created) {
        docker("rm", "--force", name);
        created = false;
      }
    }
  };
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const hostPort = reservation.address().port;
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  try {
    docker(
      "create",
      "--name",
      name,
      "--label",
      "mawid.fixture=issue6-local-data",
      "--publish",
      "127.0.0.1:" + hostPort + ":5432",
      "--env",
      "POSTGRES_PASSWORD",
      "--env",
      "POSTGRES_DB",
      IMAGE,
    );
    created = true;
    docker("start", name);
    const inspected = JSON.parse(docker("inspect", name))[0];
    const bindings = inspected.NetworkSettings.Ports["5432/tcp"];
    if (
      bindings.length !== 1 ||
      bindings[0].HostIp !== "127.0.0.1" ||
      Number(bindings[0].HostPort) !== hostPort ||
      inspected.Config.Labels["mawid.fixture"] !== "issue6-local-data" ||
      inspected.Image !== JSON.parse(docker("image", "inspect", IMAGE))[0].Id
    )
      throw new Error("UNSAFE_LOCAL_FIXTURE");
    const base = {
      host: "127.0.0.1",
      port: Number(bindings[0].HostPort),
      database,
      password,
      ssl: false,
      connectionTimeoutMillis: 2000,
    };
    admin = new Pool({ ...base, user: "postgres", max: 1, idleTimeoutMillis: 500 });
    admin.on("error", () => {});
    const ready = async () => {
      for (let i = 0; i < 50; i++) {
        try {
          await admin.query("SELECT 1");
          return;
        } catch {
          await pause(200);
        }
      }
      throw new Error("LOCAL_DATABASE_NOT_READY");
    };
    await ready();
    await admin.query(
      "CREATE ROLE mawid_local_actor NOLOGIN; CREATE ROLE mawid_local_maintenance NOLOGIN; CREATE EXTENSION btree_gist;",
    );
    await admin.query('COMMENT ON DATABASE "' + database + "\" IS '" + FIXTURE_MARKER + "'");
    const migrations = readLocalMigrations(path.join(root, "supabase/migrations"));
    if (
      migrationCount !== undefined &&
      (!Number.isInteger(migrationCount) ||
        migrationCount < 1 ||
        migrationCount > migrations.length)
    )
      throw new Error("INVALID_FIXTURE_MIGRATION_COUNT");
    await applyLocalMigrations(
      admin,
      migrationCount === undefined ? migrations : migrations.slice(0, migrationCount),
    );
    await admin.query(
      "CREATE ROLE mawid_fixture_maintenance LOGIN PASSWORD '" +
        password +
        "'; GRANT mawid_local_maintenance TO mawid_fixture_maintenance;",
    );
    const maintenanceConfig = { ...base, user: "mawid_fixture_maintenance" };
    let bookingConfig, notificationConfig;
    if (migrationCount === undefined) {
      await admin.query(
        "CREATE ROLE mawid_fixture_booking LOGIN PASSWORD '" +
          password +
          "'; GRANT mawid_local_booking TO mawid_fixture_booking;",
      );
      bookingConfig = { ...base, user: "mawid_fixture_booking" };
      await admin.query(
        "CREATE ROLE mawid_fixture_notify LOGIN PASSWORD '" +
          password +
          "'; GRANT mawid_local_notify TO mawid_fixture_notify;",
      );
      notificationConfig = { ...base, user: "mawid_fixture_notify" };
    }
    const configs = [];
    const actorIds = [101, 102, 103, 104, 105];
    for (const [index, user] of Object.values(USERS).entries()) {
      // Names and passwords are generated/allowlisted by this fixture, not external input.
      await admin.query(
        "CREATE ROLE " +
          user +
          " LOGIN PASSWORD '" +
          password +
          "'; GRANT mawid_local_actor TO " +
          user +
          ";",
      );
      await admin.query("INSERT INTO mawid_core.principals(database_user,actor_id) VALUES($1,$2)", [
        user,
        id(actorIds[index]),
      ]);
      configs.push({ ...base, user });
    }
    const {
      workspaceA: A,
      workspaceB: B,
      locationA: L,
      locationB: BL,
      customerA: C,
      customerB: BC,
      professional: P,
      service: S,
    } = IDS;
    await admin.query(
      "INSERT INTO mawid_core.organizations(workspace_id,name) VALUES($1,'Fictional A'),($2,'Fictional B')",
      [A, B],
    );
    await admin.query(
      "INSERT INTO mawid_core.locations(workspace_id,location_id,name) VALUES($1,$2,'A'),($3,$4,'B')",
      [A, L, B, BL],
    );
    await admin.query(
      "INSERT INTO mawid_core.memberships(workspace_id,actor_id,roles) VALUES($1,$2,ARRAY['manager']),($3,$4,ARRAY['manager']),($1,$5,ARRAY['admin'])",
      [A, id(101), B, id(103), id(105)],
    );
    await admin.query(
      "INSERT INTO mawid_core.customer_profiles(workspace_id,customer_id,external_key,display_name,contact,actor_id) VALUES($1,$2,'customer-a','Fictional customer A','fictional-a@example.invalid',$3),($4,$5,'customer-b','Fictional customer B','fictional-b@example.invalid',$6)",
      [A, C, id(102), B, BC, id(104)],
    );
    for (const [w, l, c, b] of [
      [A, L, C, IDS.bookingA],
      [B, BL, BC, IDS.bookingB],
    ]) {
      await admin.query(
        "INSERT INTO mawid_core.professionals(workspace_id,location_id,professional_id,external_key,display_name) VALUES($1,$2,$3,'professional','Fictional professional')",
        [w, l, P],
      );
      await admin.query(
        "INSERT INTO mawid_core.services(workspace_id,location_id,service_id,external_key,name,duration_minutes) VALUES($1,$2,$3,'service','Fictional service',30)",
        [w, l, S],
      );
      await admin.query(
        "INSERT INTO mawid_core.opening_intervals(workspace_id,location_id,external_key,weekday,opens,closes) VALUES($1,$2,'monday',1,'09:00','19:00')",
        [w, l],
      );
      await admin.query(
        "INSERT INTO mawid_core.bookings(workspace_id,location_id,booking_id,customer_id,service_id,requested_start,requested_end) VALUES($1,$2,$3,$4,$5,'2030-01-01 10:00Z','2030-01-01 10:30Z')",
        [w, l, b, c, S],
      );
    }
    if (authorizationFixtures) {
      for (const [index, user] of Object.values(AUTH_USERS).entries()) {
        await admin.query(
          "CREATE ROLE " +
            user +
            " LOGIN PASSWORD '" +
            password +
            "'; GRANT mawid_local_actor TO " +
            user +
            ";",
        );
        await admin.query("INSERT INTO mawid_core.principals VALUES($1,$2)", [
          user,
          id(106 + index),
        ]);
        configs.push({ ...base, user });
      }
      await admin.query(
        "INSERT INTO mawid_core.locations(workspace_id,location_id,name) VALUES($1,$2,'A second location')",
        [A, id(12)],
      );
      await admin.query(
        "INSERT INTO mawid_core.memberships(workspace_id,actor_id,location_id,roles) VALUES($1,$2,$3,ARRAY['manager']),($1,$4,NULL,ARRAY['manager']),($1,$5,$3,ARRAY['professional'])",
        [A, id(106), L, id(107), id(108)],
      );
      await admin.query(
        "INSERT INTO mawid_core.customer_profiles(workspace_id,customer_id,external_key,display_name,contact,actor_id) VALUES($1,$2,'customer-a-second','Other fictional customer A','other-a@example.invalid',$3),($1,$4,'customer-a-unbooked','Unbooked fictional customer','unbooked-a@example.invalid',NULL)",
        [A, id(33), id(109), id(34)],
      );
      await admin.query(
        "INSERT INTO mawid_core.professionals(workspace_id,location_id,professional_id,external_key,display_name) VALUES($1,$2,$3,'second-professional','Second fictional professional')",
        [A, id(12), P],
      );
      await admin.query(
        "INSERT INTO mawid_core.services(workspace_id,location_id,service_id,external_key,name,duration_minutes) VALUES($1,$2,$3,'second-service','Second fictional service',30)",
        [A, id(12), S],
      );
      await admin.query(
        "INSERT INTO mawid_core.opening_intervals(workspace_id,location_id,external_key,weekday,opens,closes) VALUES($1,$2,'second-opening',1,'09:00','19:00')",
        [A, id(12)],
      );
      await admin.query(
        "INSERT INTO mawid_core.bookings(workspace_id,location_id,booking_id,customer_id,service_id,requested_start,requested_end) VALUES($1,$2,$3,$4,$5,'2030-01-01 11:00Z','2030-01-01 11:30Z')",
        [A, id(12), id(63), id(33), S],
      );
    }
    if (bookingFixtures) {
      // The data/RLS fixture includes raw persistence rows without core events.
      // A booking-client lab starts with real core-created bookings only; do not
      // present those raw persistence samples as actionable appointment requests.
      await admin.query(
        "DELETE FROM mawid_core.bookings b WHERE NOT EXISTS (SELECT 1 FROM mawid_core.booking_events e WHERE e.workspace_id=b.workspace_id AND e.location_id=b.location_id AND e.booking_id=b.booking_id)",
      );
      await admin.query(
        "INSERT INTO mawid_core.eligibility SELECT workspace_id,location_id,professional_id,$1 FROM mawid_core.professionals",
        [S],
      );
      await admin.query(
        "INSERT INTO mawid_core.professional_intervals(workspace_id,location_id,professional_id,kind,period) SELECT workspace_id,location_id,professional_id,'availability',tstzrange(clock_timestamp()-interval '1 day',clock_timestamp()+interval '180 days','[)') FROM mawid_core.professionals",
      );
      await admin.query(
        "INSERT INTO mawid_core.opening_intervals(workspace_id,location_id,external_key,weekday,opens,closes) SELECT workspace_id,location_id,'booking-day-'||d,d,'09:00','19:00' FROM mawid_core.locations CROSS JOIN generate_series(0,6) d WHERE d<>1",
      );
    }
    return {
      configs,
      maintenanceConfig,
      bookingConfig,
      notificationConfig,
      admin,
      async restart() {
        docker("restart", name);
        await ready();
      },
      close: dispose,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}
