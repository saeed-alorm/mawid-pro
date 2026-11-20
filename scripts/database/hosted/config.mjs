import { bookingRehearsal } from "./rehearsal.mjs";

const required = (value) => {
  if (typeof value !== "string" || !value || value.includes("<"))
    throw Error("HOSTED_CONFIG_REQUIRED");
  return value;
};
function hyperdriveConnection(binding) {
  const value = binding?.connectionString;
  const url = typeof value === "string" ? URL.parse(value) : null;
  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    !["", "?sslmode=disable"].includes(url.search) ||
    url.hash
  )
    throw Error("INVALID_HYPERDRIVE_BINDING");
  return value;
}
export function hostedConfig(env) {
  if (env.MAWID_HOSTED_MODE !== "staging" || env.PILOT_ACCESS !== "disabled")
    throw Error("HOSTED_STAGING_ONLY");
  const issuer = required(env.STAGING_AUTH_ISSUER);
  const project = /^https:\/\/([a-z0-9]+)\.supabase\.co\/auth\/v1$/.exec(issuer)?.[1];
  if (!project) throw Error("INVALID_SUPABASE_ORIGIN");
  const origin = new URL(required(env.MAWID_API_ORIGIN));
  if (
    origin.protocol !== "https:" ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== "/"
  )
    throw Error("INVALID_HOSTED_ORIGIN");
  const policy = JSON.parse(required(env.MAWID_SESSION_POLICY));
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  const subjectList = required(env.STAGING_SUBJECTS).split(",");
  const subjects = new Set(subjectList);
  if (subjects.size < 1 || subjects.size > 8 || [...subjects].some((s) => !uuid.test(s)))
    throw Error("INVALID_STAGING_SUBJECTS");
  const notificationMode = env.MAWID_HOSTED_NOTIFICATIONS ?? "enabled";
  if (!["enabled", "disabled"].includes(notificationMode)) throw Error("INVALID_NOTIFICATION_MODE");
  const probeMode = env.MAWID_HOSTED_PROBE_ONLY ?? "false";
  if (!["true", "false"].includes(probeMode)) throw Error("INVALID_PROBE_MODE");
  const transport = env.MAWID_HOSTED_DB_TRANSPORT ?? "direct";
  if (!["direct", "hyperdrive"].includes(transport)) throw Error("INVALID_HOSTED_DB_TRANSPORT");
  const rehearsal = bookingRehearsal(env.MAWID_HOSTED_REHEARSAL, {
    probeMode,
    notificationMode,
    transport,
    subjects: subjectList,
  });
  if (transport === "hyperdrive" && (probeMode !== "true" || notificationMode !== "disabled"))
    throw Error("HYPERDRIVE_PROBE_ONLY");
  const bindings = {
    ACTOR: ["mawid_staging_actor", "STAGING_SCOPED_DATABASE_URL", "MAWID_STAGING_ACTOR_HYPERDRIVE"],
    IDENTITY: [
      "mawid_staging_session",
      "STAGING_SESSION_DATABASE_URL",
      "MAWID_STAGING_SESSION_HYPERDRIVE",
    ],
    BOOKING: [
      "mawid_staging_booking",
      "STAGING_BOOKING_DATABASE_URL",
      "MAWID_STAGING_BOOKING_HYPERDRIVE",
    ],
  };
  let notifications;
  if (notificationMode === "enabled") {
    const applicationScopes = JSON.parse(required(env.MAWID_APPLICATION_SCOPES));
    if (
      !Array.isArray(applicationScopes) ||
      !applicationScopes.length ||
      applicationScopes.length > 200 ||
      applicationScopes.some(
        (s) =>
          !["com.mawid.customer.platinum", "com.mawid.management"].includes(s.application_id) ||
          !uuid.test(s.workspace_id) ||
          !(s.location_id === null || uuid.test(s.location_id)),
      )
    )
      throw Error("INVALID_APPLICATION_SCOPES");
    const key = Buffer.from(required(env.MAWID_PUSH_KEY_BASE64), "base64");
    if (key.length !== 32) throw Error("TOKEN_KEY_REQUIRED");
    notifications = { key, applicationScopes };
    bindings.NOTIFICATIONS = ["mawid_staging_notify", "STAGING_NOTIFICATION_DATABASE_URL"];
  }
  const pools = {};
  for (const [name, [role, variable, binding]] of Object.entries(bindings)) {
    const timeouts = { connectionTimeoutMillis: 3000, idleTimeoutMillis: 500 };
    if (transport === "hyperdrive") {
      pools[name] = { ...timeouts, connectionString: hyperdriveConnection(env[binding]) };
      continue;
    }
    const url = new URL(required(env[variable]));
    if (
      url.protocol !== "postgresql:" ||
      !/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) ||
      url.port !== "5432" ||
      url.pathname !== "/postgres" ||
      decodeURIComponent(url.username) !== role + "." + project ||
      !url.password ||
      url.search ||
      url.hash
    )
      throw Error("INVALID_HOSTED_DATABASE_BINDING");
    pools[name] = {
      ...timeouts,
      connectionString: url.href,
      ssl: { rejectUnauthorized: true, ...(env.STAGING_DB_CA ? { ca: env.STAGING_DB_CA } : {}) },
    };
  }
  return {
    origin: origin.origin,
    issuer,
    jwks: new URL(issuer + "/.well-known/jwks.json"),
    policy,
    subjects,
    pools,
    notifications,
    probeOnly: probeMode === "true",
    rehearsal,
  };
}
