import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createLocalFixture, IDS, USERS, id } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { LocalBookingService } from "../booking/service.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
import { LocalNotifications } from "./service.mjs";
import { SimulatedSender } from "./policy.mjs";

const results = [];
async function check(name, fn) {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS " + name);
}
let fixture, data, booking, notices, server;
const {
  workspaceA: W,
  locationA: L,
  workspaceB: B,
  customerA: C,
  professional: P,
  service: S,
} = IDS;
const key = randomBytes(32),
  sender = new SimulatedSender();
let now = Date.now();
const root = `/v1/workspaces/${W}/locations/${L}/notifications/`;
const tokens = {};
async function call(path, as = "managerA", input, method = input ? "POST" : "GET", base = root) {
  const r = await fetch(server.origin + base + path, {
    method,
    headers: {
      authorization: "Bearer " + tokens[as],
      ...(input ? { "content-type": "application/json" } : {}),
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  return { status: r.status, value: await r.json() };
}
const install = randomUUID();
const destination = (extra = {}) => ({
  installation_id: install,
  application_id: "com.mawid.demo",
  environment: "development",
  locale: "en",
  token: "synthetic-test-token-not-a-real-registration",
  ...extra,
});
const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
async function request() {
  return booking.mutate(USERS.customerA, W, L, "request", {
    operation_id: randomUUID(),
    customer_id: C,
    service_id: S,
    professional_id: P,
    start: future + "T10:00:00+02:00",
  });
}
async function due() {
  await fixture.admin.query(
    "UPDATE mawid_core.outbox SET deliver_after=$1 WHERE materialized_at IS NULL",
    [new Date(now - 1)],
  );
}
async function jobs() {
  return (
    await fixture.admin.query(
      "SELECT * FROM mawid_core.push_deliveries WHERE destination_id=$1 ORDER BY next_attempt_at,delivery_id",
      [registration.destination_id],
    )
  ).rows;
}
let registration, b;
try {
  fixture = await createLocalFixture({ authorizationFixtures: true, bookingFixtures: true });
  data = new LocalDataService(fixture.configs);
  booking = new LocalBookingService(data, fixture.bookingConfig);
  notices = new LocalNotifications(data, booking, fixture.notificationConfig, {
    key,
    sender,
    now: () => now,
    random: () => 0,
  });
  server = await startLocalDataServer(data, { booking, notifications: notices });
  for (const [name, user] of Object.entries(USERS)) tokens[name] = data.issueSession(user).token;
  await check(
    "registration requires an authenticated authorized actor, not a token, package or workspace",
    async () => {
      assert.equal((await call("registrations", "managerB", destination())).status, 404);
      assert.equal(
        (await call("registrations", "managerA", destination({ actor_id: id(102) }))).status,
        422,
      );
      assert.equal(
        (await call("registrations", "managerA", destination({ application_id: "com.other.app" })))
          .status,
        422,
      );
      registration = (await call("registrations", "managerA", destination())).value;
      assert.ok(registration.destination_id);
      assert.equal((await call("registrations", "customerA", destination())).status, 409);
      const r = (
        await fixture.admin.query("SELECT token_ciphertext FROM mawid_core.push_destinations")
      ).rows[0];
      assert.ok(!r.token_ciphertext.includes(destination().token));
      await assert.rejects(
        data.transaction(USERS.managerA, (c) =>
          c.query("SELECT token_ciphertext FROM mawid_core.push_destinations"),
        ),
        /permission denied/,
      );
      await notices.verify();
    },
  );
  await check(
    "after-hours outbox waits until deliver_after; booking remains committed and non-reserving",
    async () => {
      b = await request();
      await fixture.admin.query(
        "UPDATE mawid_core.outbox SET deliver_after=$1 WHERE event_id IN(SELECT event_id FROM mawid_core.booking_events WHERE booking_id=$2)",
        [new Date(now + 3600000), b.booking_id],
      );
      await notices.runOnce();
      assert.equal(sender.calls, 0);
      assert.equal((await booking.read(USERS.customerA, W, L, b.booking_id)).state, "pending");
      assert.equal(
        (
          await fixture.admin.query(
            "SELECT count(*) AS n FROM mawid_core.allocations WHERE booking_id=$1",
            [b.booking_id],
          )
        ).rows[0].n,
        "0",
      );
      await due();
      await notices.runOnce();
      assert.equal(sender.calls, 1);
      assert.equal((await jobs())[0].status, "accepted");
    },
  );
  await check(
    "duplicate event processing and competing claims do not resend a completed delivery",
    async () => {
      const before = sender.calls;
      await fixture.admin.query(
        "UPDATE mawid_core.outbox SET materialized_at=NULL WHERE event_id IN (SELECT event_id FROM mawid_core.booking_events WHERE booking_id=$1)",
        [b.booking_id],
      );
      await Promise.all([notices.runOnce(), notices.runOnce()]);
      assert.equal(sender.calls, before);
      assert.equal((await jobs()).length, 1);
    },
  );
  await check(
    "opening fetches authoritative state, rejects another actor and repeats safely",
    async () => {
      const inbox = (await call("inbox")).value.items;
      const notice = inbox.find((x) => x.own);
      const first = await call(`inbox/${notice.notification_id}/open`, "managerA", {});
      assert.equal(first.status, 200);
      assert.equal(first.value.state, "pending");
      assert.equal(
        (await call(`inbox/${notice.notification_id}/open`, "customerA", {})).status,
        404,
      );
      assert.equal(
        (await call(`inbox/${notice.notification_id}/open`, "managerA", {})).value.version,
        b.version,
      );
      assert.equal((await call("inbox", "managerB")).status, 404);
      assert.ok(inbox.every((x) => !JSON.stringify(x).includes(destination().token)));
    },
  );
  await check(
    "transient retry survives database and worker restart; booking never rolls back",
    async () => {
      await request();
      await due();
      sender.outcomes.push({ status: "retry", code: "UNAVAILABLE" });
      await notices.runOnce();
      const row = (await jobs()).find((x) => x.status === "pending");
      assert.ok(row);
      assert.equal(row.attempts, 1);
      const before = sender.calls;
      await server.close();
      await notices.close();
      await fixture.restart();
      notices = new LocalNotifications(data, booking, fixture.notificationConfig, {
        key,
        sender,
        now: () => now,
        random: () => 0,
      });
      server = await startLocalDataServer(data, { booking, notifications: notices });
      await notices.runOnce();
      assert.equal(sender.calls, before);
      now = +row.next_attempt_at + 1;
      await notices.runOnce();
      assert.equal(sender.calls, before + 1);
      assert.equal(
        (await jobs()).find((x) => x.delivery_id === row.delivery_id).status,
        "accepted",
      );
      assert.equal((await booking.read(USERS.customerA, W, L, b.booking_id)).state, "pending");
    },
  );
  await check(
    "retry attempts stop at five and in-app fallback exposes truthful failure",
    async () => {
      await request();
      await due();
      sender.outcomes.push(
        ...Array.from({ length: 5 }, () => ({ status: "retry", code: "UNAVAILABLE" })),
      );
      for (let i = 0; i < 5; i++) {
        await notices.runOnce();
        const pending = (await jobs()).find((x) => x.status === "pending");
        if (pending) now = +pending.next_attempt_at + 1;
      }
      const row = (await jobs()).find((x) => x.status === "failed" && x.attempts === 5);
      assert.ok(row);
      const before = sender.calls;
      now += 86400000;
      await notices.runOnce();
      assert.equal(sender.calls, before);
      assert.ok(
        (await call("inbox")).value.items.some(
          (x) => x.pushes.some((p) => p.status === "failed") && x.fallback === "in_app",
        ),
      );
    },
  );
  await check(
    "a sender that never replies times out, persists retry and later recovers",
    async () => {
      await request();
      await due();
      const original = sender.send;
      sender.send = function () {
        this.calls++;
        return new Promise(() => {});
      };
      try {
        await notices.runOnce();
      } finally {
        sender.send = original;
      }
      const row = (await jobs()).find(
        (x) => x.status === "pending" && x.safe_error_code === "TIMEOUT",
      );
      assert.ok(row);
      assert.equal(row.attempts, 1);
      now = +row.next_attempt_at + 1;
      await notices.runOnce();
      assert.equal(
        (await jobs()).find((x) => x.delivery_id === row.delivery_id).status,
        "accepted",
      );
    },
  );
  await check("expired lease retries are fenced against late completion", async () => {
    await request();
    await due();
    await notices.materialize();
    const claim = await notices.claim();
    assert.ok(claim);
    const other = await notices.claim();
    assert.equal(other, null);
    now += 61000;
    const replacement = await notices.claim();
    assert.equal(replacement.delivery_id, claim.delivery_id);
    assert.equal(await notices.finish(claim, { status: "accepted" }), false);
    assert.equal(await notices.finish(replacement, { status: "accepted" }), true);
  });
  await check("superseded events do not send stale notifications", async () => {
    const item = await request();
    await booking.mutate(
      USERS.customerA,
      W,
      L,
      "withdraw",
      { operation_id: randomUUID(), expected_version: item.version },
      item.booking_id,
    );
    await due();
    const before = sender.calls;
    await notices.runOnce();
    assert.equal(sender.calls, before + 1); // Only the current withdrawal, not initial request.
    assert.ok(
      (await jobs()).some((x) => x.status === "skipped" && x.safe_error_code === "SUPERSEDED"),
    );
  });
  await check("invalid token is disabled without affecting a refreshed token", async () => {
    await request();
    await due();
    await notices.materialize();
    const job = await notices.claim();
    const target = await notices.prepare(job);
    await call(
      "registrations",
      "managerA",
      destination({ token: "synthetic-refreshed-registration-token" }),
    );
    await notices.finish(job, { status: "invalid_token" }, target);
    assert.equal(
      (
        await fixture.admin.query(
          "SELECT revoked_at FROM mawid_core.push_destinations WHERE destination_id=$1",
          [registration.destination_id],
        )
      ).rows[0].revoked_at,
      null,
    );
    now += 3600001;
    sender.outcomes.push({ status: "invalid_token" });
    await notices.runOnce();
    assert.ok(
      (
        await fixture.admin.query(
          "SELECT revoked_at FROM mawid_core.push_destinations WHERE destination_id=$1",
          [registration.destination_id],
        )
      ).rows[0].revoked_at,
    );
  });
  await check("logout and membership revocation stop dispatch and opening", async () => {
    await call("registrations", "managerA", destination());
    await request();
    await due();
    await notices.materialize();
    await call("registrations/" + install, "managerA", undefined, "DELETE");
    const before = sender.calls;
    await notices.runOnce();
    assert.equal(sender.calls, before);
    await call("registrations", "managerA", destination());
    await request();
    await due();
    await notices.materialize();
    await fixture.admin.query(
      "UPDATE mawid_core.memberships SET revoked_at=clock_timestamp() WHERE workspace_id=$1 AND actor_id=$2",
      [W, id(101)],
    );
    await notices.runOnce();
    assert.equal(sender.calls, before);
    assert.equal((await call("inbox")).status, 404);
  });
  await check(
    "customer sees committed confirmation despite a permanent push failure; overdue metadata stays staff-only",
    async () => {
      const registered = await call(
        "registrations",
        "customerA",
        destination({
          installation_id: randomUUID(),
          token: "synthetic-customer-registration-token",
        }),
      );
      assert.equal(registered.status, 200);
      const confirmed = await booking.mutate(
        USERS.adminA,
        W,
        L,
        "confirm",
        { operation_id: randomUUID(), expected_version: b.version },
        b.booking_id,
      );
      assert.equal(confirmed.state, "confirmed");
      await due();
      sender.outcomes.push({ status: "failed", code: "PAYLOAD" });
      await notices.runOnce();
      const inbox = (await call("inbox", "customerA")).value.items;
      assert.ok(
        inbox.some((x) => x.state === "confirmed" && x.pushes.some((p) => p.status === "failed")),
      );
      const item = inbox.find((x) => x.state === "confirmed");
      const opened = await call(`inbox/${item.notification_id}/open`, "customerA", {});
      assert.equal(opened.value.state, "confirmed");
      assert.equal(opened.value.overdue, undefined);
      assert.equal(opened.value.response_due_at, undefined);
      const count = sender.calls;
      now += 86400000;
      await notices.runOnce();
      assert.equal(sender.calls, count);
    },
  );
  await check("another workspace has no notification or destination leakage", async () => {
    const r = await call(
      "inbox",
      "managerB",
      undefined,
      "GET",
      `/v1/workspaces/${B}/locations/${IDS.locationB}/notifications/`,
    );
    assert.equal(r.status, 200);
    assert.deepEqual(r.value.items, []);
  });
  writeFileSync(
    new URL("../../../database/notification-verification.json", import.meta.url),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        transport: "simulated",
        checks: results,
        limits: ["No real FCM or device delivery asserted by these tests."],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${results.length} notification integration checks passed.`);
} finally {
  await server?.close();
  await notices?.close();
  await booking?.close();
  await data?.close();
  await fixture?.close();
}
