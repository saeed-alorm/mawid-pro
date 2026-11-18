const required = (value) => {
  if (typeof value !== "string" || !value || value.includes("<"))
    throw Error("HOSTED_CONFIG_REQUIRED");
  return value;
};
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
  const subjects = new Set(required(env.STAGING_SUBJECTS).split(","));
  if (subjects.size < 1 || subjects.size > 8 || [...subjects].some((s) => !uuid.test(s)))
    throw Error("INVALID_STAGING_SUBJECTS");
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
  const pools = {};
  for (const [name, [role, variable]] of Object.entries({
    ACTOR: ["mawid_staging_actor", "STAGING_SCOPED_DATABASE_URL"],
    IDENTITY: ["mawid_staging_session", "STAGING_SESSION_DATABASE_URL"],
    BOOKING: ["mawid_staging_booking", "STAGING_BOOKING_DATABASE_URL"],
    NOTIFICATIONS: ["mawid_staging_notify", "STAGING_NOTIFICATION_DATABASE_URL"],
  })) {
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
      connectionString: url.href,
      ssl: { rejectUnauthorized: true, ...(env.STAGING_DB_CA ? { ca: env.STAGING_DB_CA } : {}) },
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 500,
    };
  }
  return {
    origin: origin.origin,
    issuer,
    jwks: new URL(issuer + "/.well-known/jwks.json"),
    policy,
    subjects,
    key,
    pools,
    applicationScopes,
  };
}
