import { createServer } from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { exportJWK, generateKeyPair } from "jose";
import { Pool } from "pg";
import { VerifiedSessions } from "./session-gate.mjs";

export const AUTH_IMAGE =
  "supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b";
export const MAIL_IMAGE =
  "inbucket/inbucket:3.0.3@sha256:dc912ab76de647ca2a363fe285515e512e964cf699166773f3c2c73f5e7f71c0";
export const TEMPLATE_IMAGE =
  "nginx:stable-alpine@sha256:901e593c95dc85f5a729f5765516321366ef4ac401821431d408897e95287d0a";
const issuer = "https://local-auth.example.invalid/auth/v1";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const s = createServer();
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}

// Disposable real Auth + SMTP catcher; no external mail delivery.
// The existing fictional data fixture remains the only application database target.
export async function createAuthFixture(fixture) {
  const suffix = randomBytes(8).toString("hex"),
    network = "mawid-auth-" + suffix;
  const authName = network + "-auth",
    mailName = network + "-mail",
    templateName = network + "-template";
  const authPort = await freePort(),
    mailPort = await freePort();
  const authOrigin = "http://127.0.0.1:" + authPort,
    mailOrigin = "http://127.0.0.1:" + mailPort;
  const created = [];
  let networkCreated = false,
    connected = false;
  let identityReader;
  const docker = (args, env = {}) =>
    execFileSync("docker", args, {
      encoding: "utf8",
      timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
  const close = async () => {
    await identityReader?.end();
    identityReader = undefined;
    let failed = false;
    for (const name of [...created].reverse()) {
      try {
        docker(["rm", "--force", name]);
        created.splice(created.indexOf(name), 1);
      } catch {
        failed = true;
      }
    }
    if (connected) {
      try {
        docker(["network", "disconnect", network, fixture.containerName]);
        connected = false;
      } catch {
        failed = true;
      }
    }
    if (networkCreated) {
      try {
        docker(["network", "rm", network]);
        networkCreated = false;
      } catch {
        failed = true;
      }
    }
    if (failed) throw new Error("LOCAL_AUTH_CLEANUP_FAILED");
  };
  const start = (name, image, args = [], env = {}) => {
    docker(
      [
        "create",
        "--name",
        name,
        "--label",
        "mawid.fixture=issue5-identity",
        "--network",
        network,
        ...Object.keys(env).flatMap((key) => ["--env", key]),
        ...args,
        image,
      ],
      env,
    );
    created.push(name);
    docker(["start", name]);
  };
  const post = async (path, input, token) => {
    const response = await fetch(authOrigin + path, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: input === undefined ? undefined : JSON.stringify(input),
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) : null };
  };
  const mailbox = async (email) => {
    if (!/^[a-z0-9-]+@example\.invalid$/.test(email)) throw new Error("FICTIONAL_EMAIL_REQUIRED");
    const response = await fetch(mailOrigin + "/api/v1/mailbox/" + email.split("@")[0]);
    return response.ok ? response.json() : [];
  };
  try {
    const c = fixture.configs[0];
    if (
      c.host !== "127.0.0.1" ||
      !Number.isInteger(c.port) ||
      c.port < 1 ||
      c.port > 65535 ||
      !/^[a-f0-9]{64}$/.test(c.password) ||
      !/^mawid_local_data_[a-f0-9]+$/.test(c.database) ||
      fixture.containerName !== "mawid-issue6-api-" + c.database.slice("mawid_local_data_".length)
    )
      throw new Error("UNSAFE_AUTH_FIXTURE");
    await fixture.admin.query(
      "CREATE ROLE mawid_fixture_auth LOGIN PASSWORD '" +
        c.password +
        "'; CREATE SCHEMA auth AUTHORIZATION mawid_fixture_auth; ALTER ROLE mawid_fixture_auth SET search_path=auth,pg_catalog;",
    );
    docker(["network", "create", "--label", "mawid.fixture=issue5-identity", network]);
    networkCreated = true;
    docker(["network", "connect", "--alias", "fixture-db", network, fixture.containerName]);
    connected = true;
    start(
      mailName,
      MAIL_IMAGE,
      ["--network-alias", "fixture-mail", "--publish", "127.0.0.1:" + mailPort + ":9000"],
      { INBUCKET_LOGLEVEL: "error" },
    );
    start(templateName, TEMPLATE_IMAGE, [
      "--network-alias",
      "fixture-template",
      "--mount",
      "type=bind,source=" +
        fileURLToPath(new URL("./templates", import.meta.url)) +
        ",target=/usr/share/nginx/html,readonly",
    ]);
    const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
    const kid = randomUUID();
    const privateJwk = {
      ...(await exportJWK(privateKey)),
      kid,
      alg: "ES256",
      use: "sig",
      key_ops: ["sign", "verify"],
    };
    const publicJwk = { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" };
    const env = {
      GOTRUE_API_HOST: "0.0.0.0",
      GOTRUE_API_PORT: "9999",
      API_EXTERNAL_URL: issuer,
      GOTRUE_DB_DRIVER: "postgres",
      GOTRUE_DB_DATABASE_URL:
        "postgres://mawid_fixture_auth:" + c.password + "@fixture-db:5432/" + c.database,
      GOTRUE_SITE_URL: "https://local-app.example.invalid",
      GOTRUE_DISABLE_SIGNUP: "false",
      GOTRUE_JWT_SECRET: randomBytes(32).toString("hex"),
      GOTRUE_JWT_KEYS: JSON.stringify([privateJwk]),
      GOTRUE_JWT_ISSUER: issuer,
      GOTRUE_JWT_EXP: "300",
      GOTRUE_JWT_AUD: "authenticated",
      GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
      GOTRUE_JWT_ADMIN_ROLES: "service_role",
      GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
      GOTRUE_EXTERNAL_PHONE_ENABLED: "false",
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: "false",
      GOTRUE_MAILER_AUTOCONFIRM: "false",
      GOTRUE_MAILER_OTP_EXP: "300",
      GOTRUE_MAILER_OTP_LENGTH: "6",
      GOTRUE_SMTP_HOST: "fixture-mail",
      GOTRUE_SMTP_PORT: "2500",
      GOTRUE_SMTP_MAX_FREQUENCY: "5s",
      GOTRUE_SMTP_ADMIN_EMAIL: "mawid@example.invalid",
      GOTRUE_SMTP_SENDER_NAME: "MAWID local fixture",
      GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000",
      GOTRUE_RATE_LIMIT_VERIFY: "1000",
      GOTRUE_RATE_LIMIT_TOKEN_REFRESH: "1000",
      GOTRUE_MAILER_TEMPLATES_CONFIRMATION: "http://fixture-template/email-otp.html",
      GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: "http://fixture-template/email-otp.html",
      GOTRUE_MAILER_TEMPLATES_RECOVERY: "http://fixture-template/email-otp.html",
      GOTRUE_MAILER_TEMPLATES_INVITE: "http://fixture-template/email-otp.html",
      GOTRUE_LOG_LEVEL: "error",
    };
    start(authName, AUTH_IMAGE, ["--publish", "127.0.0.1:" + authPort + ":9999"], env);
    let ready = false;
    for (let i = 0; i < 300; i++) {
      try {
        if ((await fetch(authOrigin + "/health", { signal: AbortSignal.timeout(500) })).ok) {
          ready = true;
          break;
        }
      } catch {}
      await pause(100);
    }
    if (!ready) {
      // Before any OTP request: scrub fixture credentials from startup diagnostics.
      const startup = spawnSync("docker", ["logs", authName], { encoding: "utf8", timeout: 5000 });
      let message = (startup.stdout + startup.stderr).slice(-3000);
      for (const secret of [c.password, env.GOTRUE_JWT_SECRET, env.GOTRUE_JWT_KEYS, privateJwk.d])
        message = message.replaceAll(secret, "[redacted]");
      console.error("LOCAL_AUTH_STARTUP", message.replace(/postgres:\/\/[^\s]+/g, "[database]"));
      console.error(
        "LOCAL_AUTH_STATE",
        docker(["inspect", "--format", "{{.State.Status}} {{.State.ExitCode}}", authName]).trim(),
      );
      const health = spawnSync(
        "docker",
        ["exec", authName, "wget", "-T", "2", "-q", "-O", "-", "http://127.0.0.1:9999/health"],
        { encoding: "utf8", timeout: 15000 },
      );
      console.error(
        "LOCAL_AUTH_INTERNAL_HEALTH",
        health.status,
        health.status === 0 ? health.stdout : "UNAVAILABLE",
      );
      console.error(
        "LOCAL_AUTH_DB_ACTIVITY",
        (
          await fixture.admin.query(
            "SELECT state,wait_event_type,wait_event,left(query,140) AS statement FROM pg_stat_activity WHERE usename='mawid_fixture_auth'",
          )
        ).rows,
      );
      throw new Error("LOCAL_AUTH_NOT_READY");
    }
    for (const [name, containerPort, hostPort] of [
      [authName, "9999/tcp", authPort],
      [mailName, "9000/tcp", mailPort],
    ]) {
      const ports = JSON.parse(
        docker(["inspect", "--format", "{{json .NetworkSettings.Ports}}", name]),
      );
      const published = Object.values(ports).filter(Boolean).flat();
      if (
        published.length !== 1 ||
        ports[containerPort]?.[0]?.HostIp !== "127.0.0.1" ||
        Number(ports[containerPort]?.[0]?.HostPort) !== hostPort
      )
        throw new Error("UNSAFE_AUTH_PORT_BINDING");
    }
    await fixture.admin.query(
      "CREATE ROLE mawid_fixture_identity LOGIN PASSWORD '" +
        c.password +
        "'; GRANT USAGE ON SCHEMA auth TO mawid_fixture_identity; GRANT SELECT(id,user_id,created_at,updated_at,not_after) ON auth.sessions TO mawid_fixture_identity; GRANT SELECT(id,banned_until,deleted_at,email_confirmed_at) ON auth.users TO mawid_fixture_identity; CREATE POLICY fixture_identity_session ON auth.sessions FOR SELECT TO mawid_fixture_identity USING (id=NULLIF(current_setting('mawid.verified_session',true),'')::uuid AND user_id=NULLIF(current_setting('mawid.verified_subject',true),'')::uuid); CREATE POLICY fixture_identity_user ON auth.users FOR SELECT TO mawid_fixture_identity USING (id=NULLIF(current_setting('mawid.verified_subject',true),'')::uuid);",
    );
    identityReader = new Pool({
      ...c,
      user: "mawid_fixture_identity",
      ssl: false,
      max: 2,
      statement_timeout: 2000,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 500,
      options: "-c search_path=pg_catalog",
    });
    identityReader.on("error", () => {});
    const {
      rows: [reader],
    } = await identityReader.query(
      "SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication AS privileged, pg_has_role(session_user,'mawid_local_actor','MEMBER') OR pg_has_role(session_user,'mawid_local_booking','MEMBER') OR pg_has_role(session_user,'mawid_local_notify','MEMBER') AS app_role FROM pg_roles WHERE rolname=session_user",
    );
    if (!reader || reader.privileged || reader.app_role) throw new Error("UNSAFE_IDENTITY_READER");
    const bindings = new Map();
    const gate = new VerifiedSessions({
      issuer,
      audience: "authenticated",
      jwks: { keys: [publicJwk] },
      policy: {
        maximumAccessSeconds: 300,
        maximumSessionMs: 900000,
        inactivityMs: 900000,
        clockToleranceSeconds: 5,
      },
      readSession: async ({ issuer: requested, subject, sessionId }) => {
        if (requested !== issuer || !bindings.has(subject)) return null;
        const client = await identityReader.connect();
        let row,
          broken = false;
        try {
          await client.query("BEGIN");
          await client.query(
            "SELECT set_config('mawid.verified_subject',$1,true),set_config('mawid.verified_session',$2,true)",
            [subject, sessionId],
          );
          ({
            rows: [row],
          } = await client.query(
            "SELECT s.created_at,s.updated_at,s.not_after,u.banned_until,u.deleted_at,u.email_confirmed_at FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2",
            [sessionId, subject],
          ));
          await client.query("COMMIT");
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
        if (!row) return null;
        return {
          issuer,
          subject,
          sessionId,
          principal: bindings.get(subject),
          bindingVersion: 1,
          bindingRevokedAt: null,
          createdAt: +row.created_at,
          lastSeenAt: Math.max(+row.created_at, +row.updated_at),
          expiresAt: row.not_after ? +row.not_after : +row.created_at + 900000,
          revokedAt: null,
          disabled: !!row.deleted_at || !row.email_confirmed_at || +row.banned_until > Date.now(),
        };
      },
    });
    return {
      gate,
      post,
      authOrigin,
      async readerIsUnbound() {
        const {
          rows: [counts],
        } = await identityReader.query(
          "SELECT (SELECT count(*) FROM auth.sessions) AS sessions,(SELECT count(*) FROM auth.users) AS users",
        );
        return counts.sessions === "0" && counts.users === "0";
      },
      async mailCount(email) {
        return (await mailbox(email)).length;
      },
      async restart() {
        docker(["restart", authName]);
        for (let i = 0; i < 50; i++) {
          try {
            if ((await fetch(authOrigin + "/health", { signal: AbortSignal.timeout(500) })).ok)
              return;
          } catch {}
          await pause(100);
        }
        throw new Error("LOCAL_AUTH_RESTART_FAILED");
      },
      bind(subject, principal) {
        if (!fixture.configs.some((config) => config.user === principal))
          throw new Error("UNKNOWN_FIXTURE_PRINCIPAL");
        bindings.set(subject, principal);
      },
      async requestCode(email, createUser = true, metadata = {}) {
        const seen = new Set((await mailbox(email)).map((message) => message.id));
        const result = await post("/otp", { email, create_user: createUser, data: metadata });
        if (result.status !== 200) throw new Error("LOCAL_OTP_REQUEST_FAILED_" + result.status);
        for (let i = 0; i < 50; i++) {
          const next = (await mailbox(email)).find((message) => !seen.has(message.id));
          if (next) {
            const mail = await (
              await fetch(mailOrigin + "/api/v1/mailbox/" + email.split("@")[0] + "/" + next.id)
            ).json();
            const code = /<strong>([0-9]{6})<\/strong>/.exec(mail.body.html)?.[1];
            if (!code) throw new Error("LOCAL_OTP_TEMPLATE_MISSING");
            return code;
          }
          await pause(100);
        }
        throw new Error("LOCAL_OTP_NOT_DELIVERED");
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
