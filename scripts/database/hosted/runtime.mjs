import { Pool } from "pg";
import { VerifiedSessions } from "../identity/session-gate.mjs";
import { VerifiedDataService } from "../identity/verified-data.mjs";
import { postgresSessionReader } from "../identity/postgres-session-reader.mjs";
import { BookingService } from "../booking/service.mjs";
import { Notifications } from "../notifications/service.mjs";
import { hostedConfig } from "./config.mjs";

// Each HTTP/cron invocation owns and closes its connections. No fixture import,
// synthetic issuer, service-role JWT or client-selected principal is accepted.
export function createHostedRuntime(env, sender) {
  const config = hostedConfig(env);
  if (sender?.transport !== "fcm") throw Error("HOSTED_FCM_SENDER_REQUIRED");
  const reader = new Pool({ ...config.pools.IDENTITY, max: 2, statement_timeout: 2000 });
  reader.on("error", () => {});
  const readSession = postgresSessionReader(reader, {
    issuer: config.issuer,
    ...config.policy,
    hostedStaging: true,
  });
  const gate = new VerifiedSessions({
    issuer: config.issuer,
    audience: "authenticated",
    jwks: config.jwks,
    policy: config.policy,
    readSession: (identity) =>
      config.subjects.has(identity.subject) ? readSession(identity) : null,
  });
  const actor = new Pool({ ...config.pools.ACTOR, max: 2, statement_timeout: 5000 });
  actor.on("error", () => {});
  const data = new VerifiedDataService(actor, gate);
  const booking = new BookingService(data, config.pools.BOOKING);
  const notifications = new Notifications(data, booking, config.pools.NOTIFICATIONS, {
    key: config.key,
    sender,
    environment: "staging",
    applicationScopes: config.applicationScopes,
  });
  return {
    config,
    data,
    booking,
    notifications,
    async verify() {
      const {
        rows: [r],
      } =
        await reader.query(`SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication AS privileged,
        pg_has_role(session_user,'mawid_identity_reader','USAGE') AS reader,
        pg_has_role(session_user,'mawid_local_actor','MEMBER') OR pg_has_role(session_user,'mawid_local_booking','MEMBER') OR pg_has_role(session_user,'mawid_local_notify','MEMBER') OR pg_has_role(session_user,'mawid_local_maintenance','MEMBER') AS app_role FROM pg_roles WHERE rolname=session_user`);
      if (!r || r.privileged || !r.reader || r.app_role) throw Error("UNSAFE_IDENTITY_READER");
      await data.verifyPrincipals();
      await booking.verify();
      await notifications.verify();
    },
    async close() {
      await Promise.allSettled([
        data.close(),
        booking.close(),
        notifications.close(),
        reader.end(),
      ]);
    },
  };
}
