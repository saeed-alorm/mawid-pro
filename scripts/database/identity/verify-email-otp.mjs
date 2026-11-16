import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { decodeJwt } from "jose";
import { createLocalFixture, IDS, USERS, IMAGE } from "../api/fixture.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalBookingService } from "../booking/service.mjs";
import { LocalNotifications } from "../notifications/service.mjs";
import { instant } from "../booking/time.mjs";
import { VerifiedLocalDataService } from "./verified-local-data.mjs";
import { createAuthFixture, AUTH_IMAGE, MAIL_IMAGE, TEMPLATE_IMAGE } from "./auth-fixture.mjs";

let fixture,
  auth,
  data,
  booking,
  notifications,
  server,
  currentCheck = "setup";
const checks = [],
  logs = [];
const check = async (name, fn) => {
  currentCheck = name;
  await fn();
  checks.push({ name, passed: true });
  console.log("PASS " + name);
};
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const expect = (result, status, code) => {
  assert.equal(result.status, status);
  if (code) assert.equal(result.data.error.code, code);
  return result.data;
};
async function call(token, tail = "/profiles", input, workspace = IDS.workspaceA, headers = {}) {
  const response = await fetch(server.origin + "/v1/workspaces/" + workspace + tail, {
    method: input ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + token,
      ...(input ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  return { status: response.status, data: await response.json() };
}
const bookingPath = "/locations/" + IDS.locationA + "/booking-core/";
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
const at = (hour) => {
  const wall = `${future}T${String(hour).padStart(2, "0")}:00:00`;
  try {
    instant(wall + "+02:00");
    return wall + "+02:00";
  } catch {
    return wall + "+03:00";
  }
};
const request = () => ({
  operation_id: randomUUID(),
  customer_id: IDS.customerA,
  service_id: IDS.service,
  professional_id: IDS.professional,
  start: at(11),
});
async function signIn(email, principal, metadata = {}) {
  const code = await auth.requestCode(email, true, metadata);
  const r = await auth.post("/verify", { email, token: code, type: "email" });
  assert.equal(r.status, 200);
  assert.ok(r.data.access_token && r.data.refresh_token);
  if (principal) auth.bind(r.data.user.id, principal);
  return { ...r.data, code };
}

try {
  fixture = await createLocalFixture({ authorizationFixtures: true, bookingFixtures: true });
  auth = await createAuthFixture(fixture);
  data = new VerifiedLocalDataService(fixture.configs, auth.gate);
  booking = new LocalBookingService(data, fixture.bookingConfig);
  notifications = new LocalNotifications(data, booking, fixture.notificationConfig, {
    key: randomBytes(32),
    sender: { send: async () => ({ accepted: true }), transport: "simulated" },
  });
  server = await startLocalDataServer(data, {
    booking,
    notifications,
    log: (event) => logs.push(event),
  });
  let customer, second, manager, admin, pending, recovered;
  await check("a delivered six-digit Email OTP creates a verified provider session", async () => {
    customer = await signIn("customer-a@example.invalid", USERS.customerA);
    assert.match(customer.code, /^[0-9]{6}$/);
    assert.equal(decodeJwt(customer.access_token).sub, customer.user.id);
    const reply = await call(customer.access_token);
    assert.equal(expect(reply, 200).items[0].customer_id, IDS.customerA);
  });
  await check(
    "the restricted session reader has no unbound access after a pooled request",
    async () => {
      assert.equal(await auth.readerIsUnbound(), true);
    },
  );
  await check("consumed and incorrect Email OTP codes cannot create sessions", async () => {
    for (const code of [customer.code, customer.code === "000000" ? "111111" : "000000"]) {
      const r = await auth.post("/verify", {
        email: "customer-a@example.invalid",
        token: code,
        type: "email",
      });
      assert.ok([400, 401, 403].includes(r.status));
      assert.ok(!r.data.access_token);
    }
  });
  await check(
    "verified email alone cannot grant an application identity or staff membership",
    async () => {
      const unbound = await signIn("unbound@example.invalid", undefined, {
        role: "manager",
        workspace_id: IDS.workspaceA,
      });
      expect(await call(unbound.access_token), 401, "SESSION_REQUIRED");
    },
  );
  await check("the provider enforces its configured resend window", async () => {
    const code = await auth.requestCode("resend@example.invalid");
    const before = await auth.mailCount("resend@example.invalid");
    const reply = await auth.post("/otp", { email: "resend@example.invalid", create_user: true });
    // An unconfirmed signup may deliberately conceal throttling with a 200.
    // Assert the delivery effect and original-code validity, not account existence.
    assert.ok([200, 429].includes(reply.status));
    assert.ok(!reply.data.access_token);
    await pause(200);
    assert.equal(await auth.mailCount("resend@example.invalid"), before);
    assert.equal(
      (await auth.post("/verify", { email: "resend@example.invalid", token: code, type: "email" }))
        .status,
      200,
    );
  });
  await check("a code older than the configured lifetime cannot create a session", async () => {
    const code = await auth.requestCode("expired@example.invalid");
    await fixture.admin.query(
      "UPDATE auth.users SET confirmation_sent_at=clock_timestamp()-interval '6 minutes' WHERE email=$1",
      ["expired@example.invalid"],
    );
    const reply = await auth.post("/verify", {
      email: "expired@example.invalid",
      token: code,
      type: "email",
    });
    assert.ok([400, 401, 403].includes(reply.status));
    assert.ok(!reply.data.access_token);
  });
  await check("individual staff Email OTP sessions retain explicit additive roles", async () => {
    manager = await signIn("manager-a@example.invalid", USERS.managerA);
    admin = await signIn("admin-a@example.invalid", USERS.adminA);
    expect(await call(manager.access_token, "/locations/" + IDS.locationA + "/services"), 200);
    pending = expect(await call(customer.access_token, bookingPath + "requests", request()), 201);
    const action = { operation_id: randomUUID(), expected_version: pending.version };
    expect(
      await call(
        manager.access_token,
        bookingPath + "bookings/" + pending.booking_id + "/confirm",
        action,
      ),
      403,
      "ACTION_DENIED",
    );
    expect(
      await call(
        admin.access_token,
        bookingPath + "bookings/" + pending.booking_id + "/confirm",
        action,
      ),
      200,
    );
  });
  await check("cross-shop, other-customer and forged-role operations are denied", async () => {
    expect(
      await call(customer.access_token, "/profiles", undefined, IDS.workspaceB),
      404,
      "NOT_FOUND",
    );
    expect(
      await call(manager.access_token, "/profiles", undefined, IDS.workspaceB),
      404,
      "NOT_FOUND",
    );
    expect(
      await call(customer.access_token, "/exports", { customer_id: IDS.customerB }),
      404,
      "NOT_FOUND",
    );
    expect(
      await call(customer.access_token, "/exports", {}, IDS.workspaceA, {
        "x-role": "manager",
        "x-actor-id": IDS.managerActorA,
        "x-workspace-id": IDS.workspaceB,
      }),
      404,
      "NOT_FOUND",
    );
  });
  await check(
    "independent clients sign in to the same identity with separate sessions",
    async () => {
      await pause(5100);
      second = await signIn("customer-a@example.invalid", USERS.customerA);
      assert.equal(second.user.id, customer.user.id);
      assert.notEqual(
        decodeJwt(second.access_token).session_id,
        decodeJwt(customer.access_token).session_id,
      );
      expect(await call(second.access_token), 200);
    },
  );
  await check("refresh rotates credentials without changing the application identity", async () => {
    const r = await auth.post("/token?grant_type=refresh_token", {
      refresh_token: second.refresh_token,
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.id, second.user.id);
    second = { ...second, ...r.data };
    expect(await call(second.access_token), 200);
  });
  await check(
    "local logout denies an unexpired access token and preserves the other client",
    async () => {
      assert.equal(
        (await auth.post("/logout?scope=local", undefined, customer.access_token)).status,
        204,
      );
      expect(await call(customer.access_token), 401, "SESSION_REQUIRED");
      expect(await call(second.access_token), 200);
      const refresh = await auth.post("/token?grant_type=refresh_token", {
        refresh_token: customer.refresh_token,
      });
      assert.notEqual(refresh.status, 200);
    },
  );
  await check("revocation during a booking lock wait cannot commit a queued request", async () => {
    await fixture.admin.query("SELECT pg_advisory_lock(hashtextextended($1,7))", [IDS.workspaceA]);
    const before = +(await fixture.admin.query("SELECT count(*) AS n FROM mawid_core.bookings"))
      .rows[0].n;
    let queued;
    try {
      queued = call(second.access_token, bookingPath + "requests", request());
      let waiting = false;
      for (let i = 0; i < 50; i++) {
        waiting = (
          await fixture.admin.query(
            "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='mawid_fixture_booking' AND wait_event='advisory') AS waiting",
          )
        ).rows[0].waiting;
        if (waiting) break;
        await pause(20);
      }
      assert.ok(waiting, "the request must actually be queued before revocation");
      assert.equal(
        (await auth.post("/logout?scope=global", undefined, second.access_token)).status,
        204,
      );
    } finally {
      await fixture.admin.query("SELECT pg_advisory_unlock(hashtextextended($1,7))", [
        IDS.workspaceA,
      ]);
    }
    expect(await queued, 401, "SESSION_REQUIRED");
    assert.equal(
      +(await fixture.admin.query("SELECT count(*) AS n FROM mawid_core.bookings")).rows[0].n,
      before,
    );
  });
  await check(
    "provider restart preserves active sessions and current memberships still control access",
    async () => {
      await auth.restart();
      expect(await call(manager.access_token), 200);
      await fixture.admin.query(
        "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE actor_id=$1",
        [IDS.managerActorA],
      );
      expect(await call(manager.access_token), 404, "NOT_FOUND");
      expect(await call(admin.access_token), 200);
    },
  );
  await check(
    "logs and saved evidence contain no credentials, Email OTPs or contacts",
    async () => {
      assert.equal(logs.length, 0);
      const serialized = JSON.stringify(checks);
      for (const secret of [
        customer.access_token,
        customer.refresh_token,
        customer.code,
        manager.access_token,
        "customer-a@example.invalid",
      ])
        assert.ok(!serialized.includes(secret));
    },
  );
  await check(
    "fresh Email OTP recovers the existing identity after all-device logout",
    async () => {
      await pause(5100);
      recovered = await signIn("customer-a@example.invalid", USERS.customerA);
      assert.equal(recovered.user.id, customer.user.id);
      const profiles = expect(await call(recovered.access_token), 200).items;
      assert.equal(profiles.length, 1);
      assert.equal(profiles[0].customer_id, IDS.customerA);
      expect(await call(second.access_token), 401, "SESSION_REQUIRED");
    },
  );
  await check(
    "revocation during a notification lock wait cannot register a destination",
    async () => {
      const input = {
        installation_id: randomUUID(),
        application_id: "com.mawid.demo",
        environment: "development",
        locale: "en",
        token: "fictional-" + randomBytes(32).toString("hex"),
      };
      const digest = notifications.vault.digest(input.token);
      await fixture.admin.query("SELECT pg_advisory_lock(hashtextextended($1,8))", [digest]);
      let queued;
      try {
        queued = call(
          recovered.access_token,
          "/locations/" + IDS.locationA + "/notifications/registrations",
          input,
        );
        let waiting = false;
        for (let i = 0; i < 50; i++) {
          waiting = (
            await fixture.admin.query(
              "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE usename='mawid_fixture_notify' AND wait_event='advisory') AS waiting",
            )
          ).rows[0].waiting;
          if (waiting) break;
          await pause(20);
        }
        assert.ok(waiting, "notification registration must actually be queued before revocation");
        assert.equal(
          (await auth.post("/logout?scope=local", undefined, recovered.access_token)).status,
          204,
        );
      } finally {
        await fixture.admin.query("SELECT pg_advisory_unlock(hashtextextended($1,8))", [digest]);
      }
      expect(await queued, 401, "SESSION_REQUIRED");
      assert.equal(
        (
          await fixture.admin.query(
            "SELECT count(*) AS n FROM mawid_core.push_destinations WHERE installation_id=$1",
            [input.installation_id],
          )
        ).rows[0].n,
        "0",
      );
    },
  );
  assert.equal(logs.length, 0);
  const files = [
    "session-gate.mjs",
    "verified-local-data.mjs",
    "auth-fixture.mjs",
    "verify-email-otp.mjs",
    "templates/email-otp.html",
  ];
  writeFileSync(
    "database/email-otp-verification.json",
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        node: process.version,
        images: [IMAGE, AUTH_IMAGE, MAIL_IMAGE, TEMPLATE_IMAGE],
        checks,
        files: files.map((name) => ({
          name: "scripts/database/identity/" + name,
          sha256: createHash("sha256")
            .update(readFileSync(new URL(name, import.meta.url)))
            .digest("hex"),
        })),
        limits: [
          "Real Supabase Auth and SMTP catcher, fictional accounts/data, isolated local network only.",
          "Subject-to-application bindings are test-owned; no automatic email or metadata binding is authorized.",
          "No hosted email delivery, production actor adapter, client sign-in screens, staff invitation or two-device APK acceptance is established.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(checks.length + " Email OTP integration checks passed.");
} catch (error) {
  console.error("EMAIL_OTP_VERIFICATION_FAILED", {
    check: currentCheck,
    code: /^[A-Z0-9_]{1,80}$/.test(error.message) ? error.message : "TEST_FAILED",
    ...(typeof error.actual === "number"
      ? { actual_status: error.actual, expected_status: error.expected }
      : {}),
    location: error.stack
      ?.split("\n")
      .filter((line) => /^\s+at /.test(line))
      .slice(0, 3),
  });
  process.exitCode = 1;
} finally {
  await server?.close();
  await notifications?.close();
  await booking?.close();
  await data?.close();
  await auth?.close();
  await fixture?.close();
}
