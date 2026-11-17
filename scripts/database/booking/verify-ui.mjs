import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium, expect } from "@playwright/test";
import { createLocalFixture, IDS, USERS, AUTH_USERS } from "../api/fixture.mjs";
import { LocalDataService } from "../api/data-service.mjs";
import { LocalBookingService } from "./service.mjs";
import { LocalNotifications } from "../notifications/service.mjs";
import { SimulatedSender } from "../notifications/policy.mjs";
import { startLocalDataServer } from "../api/http-server.mjs";
const results = [];
const check = async (name, fn) => {
  await fn();
  results.push({ name, passed: true });
  console.log("PASS " + name);
};
let fixture, data, booking, notifications, server, vite, browser;
const W = IDS.workspaceA,
  L = IDS.locationA,
  S = IDS.service,
  P = IDS.professional;
const root = `/v1/workspaces/${W}/locations/${L}/`;
const tokens = {};
const api = async (as, path, input) => {
  const res = await fetch(server.origin + root + path, {
    method: input ? "POST" : "GET",
    headers: {
      authorization: "Bearer " + tokens[as],
      ...(input ? { "content-type": "application/json" } : {}),
    },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  return { status: res.status, value: await res.json() };
};
async function awaitInbox(as, predicate) {
  for (let i = 0; i < 20; i++) {
    await notifications.runOnce();
    const inbox = await api(as, "notifications/inbox");
    assert.equal(inbox.status, 200);
    if (inbox.value.items.some(predicate)) return inbox;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("EXPECTED_COMMITTED_NOTIFICATION_NOT_MATERIALIZED");
}
try {
  fixture = await createLocalFixture({ authorizationFixtures: true, bookingFixtures: true });
  data = new LocalDataService(fixture.configs);
  booking = new LocalBookingService(data, fixture.bookingConfig);
  notifications = new LocalNotifications(data, booking, fixture.notificationConfig, {
    key: randomBytes(32),
    sender: new SimulatedSender(),
  });
  server = await startLocalDataServer(data, { booking, notifications });
  const sessions = {};
  for (const [name, user] of Object.entries({ ...USERS, ...AUTH_USERS })) {
    sessions[name] = data.issueSession(user);
    tokens[name] = sessions[name].token;
  }
  await check(
    "view and slots authorize customer scope, deny cross-shop access and omit staff-only metadata",
    async () => {
      const own = await api("customerA", "booking-core/view");
      assert.equal(own.status, 200);
      assert.deepEqual(own.value.customer_ids, [IDS.customerA]);
      assert.ok(
        own.value.bookings.every((b) => b.customer_id === IDS.customerA && b.overdue === undefined),
      );
      assert.equal((await api("customerB", "booking-core/view")).status, 404);
      assert.equal((await api("otherCustomerA", "booking-core/view")).value.bookings.length, 0);
      assert.equal((await api("professionalA", "booking-core/view")).value.customers.length, 0);
      const slots = await api("customerA", `booking-core/slots?service_id=${S}`);
      assert.equal(slots.status, 200);
      assert.ok(slots.value.items.length > 0);
      assert.equal(slots.value.confirmed, false);
    },
  );
  vite = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5187", "--strictPort"],
    {
      env: {
        ...process.env,
        VITE_MAWID_LOCAL_BOOKING: "true",
        MAWID_LOCAL_API_ORIGIN: server.origin,
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  const url = "http://127.0.0.1:5187";
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  assert.ok(ready, "development UI started");
  browser = await chromium.launch({ headless: true });
  const open = async (as, staff = false, search = "") => {
    const context = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("UI_JS_ERROR", error.message.slice(0, 400)));
    page.on("response", (response) => {
      if (response.status() >= 400)
        console.error("UI_HTTP_ERROR", response.status(), new URL(response.url()).pathname);
    });
    await page.goto(url + (staff ? "/manage/demo/bookings" : "/customer/demo/book") + search);
    const input = {
      mode: "fictional-local-only",
      origin: server.origin,
      workspace_id: W,
      location_id: L,
      installation_id: randomUUID(),
      token: tokens[as],
      expires_at: sessions[as].expires_at,
    };
    await expect(page.getByLabel("Development session")).toBeEnabled({ timeout: 60000 });
    await page.getByLabel("Development session").setInputFiles({
      name: "authorized-development-session.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(input)),
    });
    try {
      if (as === "professionalA")
        await page.getByText("Your appointments · read only", { exact: true }).waitFor();
      else await page.getByLabel("Service", { exact: true }).waitFor();
    } catch (error) {
      console.error(
        "UI state after session import:",
        (await page.locator("body").innerText()).slice(0, 1800),
      );
      throw error;
    }
    return page;
  };
  const customer = await open("customerA"),
    manager = await open("managerA", true),
    admin = await open("adminA", true);
  let created, at;
  await check(
    "actual customer form saves pending Any request; independent staff inbox receives committed event",
    async () => {
      await customer.getByLabel("Service", { exact: true }).selectOption(S);
      await customer.getByRole("button", { name: "Refresh availability", exact: true }).click();
      await customer
        .getByLabel("Available time", { exact: true })
        .locator("option")
        .nth(1)
        .waitFor({ state: "attached" });
      at = await customer
        .getByLabel("Available time", { exact: true })
        .locator("option")
        .nth(1)
        .getAttribute("value");
      await customer.getByLabel("Available time", { exact: true }).selectOption(at);
      await customer.getByRole("button", { name: "Submit request", exact: true }).click();
      await customer.getByRole("status").filter({ hasText: "Server accepted" }).waitFor();
      created = (await api("customerA", "booking-core/view")).value.bookings.find(
        (b) => Date.parse(b.requested_start) === Date.parse(at),
      );
      assert.ok(created);
      assert.equal(created.state, "pending");
      await awaitInbox("managerA", (i) => i.booking_id === created.booking_id);
      const timing = (
        await fixture.admin.query(
          "SELECT clock_timestamp() AS now,deliver_after,materialized_at FROM mawid_core.outbox o JOIN mawid_core.booking_events e USING(workspace_id,event_id) WHERE e.booking_id=$1",
          [created.booking_id],
        )
      ).rows[0];
      console.log(
        "Notification clock diagnostic:",
        JSON.stringify({
          host: new Date().toISOString(),
          database: timing.now,
          deliver_after: timing.deliver_after,
          materialized: timing.materialized_at !== null,
        }),
      );
      const actualInbox = await api("managerA", "notifications/inbox");
      assert.equal(actualInbox.status, 200);
      assert.ok(
        actualInbox.value.items.some((i) => i.booking_id === created.booking_id),
        "committed request is present in the authorized staff inbox",
      );
      await manager.getByRole("button", { name: "Refresh server state", exact: true }).click();
      await manager
        .getByRole("region", { name: "Booking notifications" })
        .getByText("pending", { exact: false })
        .first()
        .waitFor();
      const inbox = await api("managerA", "notifications/inbox");
      assert.ok(inbox.value.items.some((i) => i.booking_id === created.booking_id));
    },
  );
  await check(
    "manager assigns Any without reservation; separate admin confirms; customer UI and notification refresh to v3",
    async () => {
      const card = manager
        .getByRole("region", { name: "Server bookings" })
        .locator("article")
        .filter({ hasText: "pending" })
        .first();
      await card.getByRole("button", { name: "Assign / propose", exact: true }).click();
      await manager.getByLabel("Professional", { exact: true }).selectOption(P);
      await manager
        .getByRole("button", { name: "Save assignment (no reservation)", exact: true })
        .click();
      await manager.getByRole("status").filter({ hasText: "Server accepted" }).waitFor();
      const count = await fixture.admin.query(
        "SELECT count(*) FROM mawid_core.allocations WHERE booking_id=$1",
        [created.booking_id],
      );
      assert.equal(count.rows[0].count, "0");
      await admin.getByRole("button", { name: "Refresh server state", exact: true }).click();
      await admin
        .getByRole("region", { name: "Server bookings" })
        .locator("article")
        .filter({ hasText: "pending" })
        .first()
        .getByRole("button", { name: "Approve", exact: true })
        .click();
      await admin.getByRole("status").filter({ hasText: "Server accepted" }).waitFor();
      await awaitInbox(
        "customerA",
        (i) => i.booking_id === created.booking_id && String(i.version) === "3",
      );
      await customer.getByRole("button", { name: "Refresh server state", exact: true }).click();
      await customer
        .getByRole("region", { name: "Server bookings" })
        .getByText("confirmed · v3", { exact: false })
        .waitFor();
      const inbox = await api("customerA", "notifications/inbox");
      const notice = inbox.value.items.find((i) => i.booking_id === created.booking_id);
      assert.ok(notice);
      const opened = await api(
        "customerA",
        `notifications/inbox/${notice.notification_id}/open`,
        {},
      );
      assert.equal(opened.value.state, "confirmed");
    },
  );
  await check(
    "lost HTTP acknowledgement and offline UI remain unconfirmed; exact retry creates one booking and one event",
    async () => {
      await customer.getByLabel("Service", { exact: true }).selectOption(S);
      await customer.getByRole("button", { name: "Refresh availability", exact: true }).click();
      await customer
        .getByLabel("Available time", { exact: true })
        .locator("option")
        .nth(1)
        .waitFor({ state: "attached" });
      const next = await customer
        .getByLabel("Available time", { exact: true })
        .locator("option")
        .nth(1)
        .getAttribute("value");
      await customer.getByLabel("Available time", { exact: true }).selectOption(next);
      await customer.route(
        "**/visit-core/requests",
        async (route) => {
          await route.fetch();
          await route.abort("connectionreset");
        },
        { times: 1 },
      );
      await customer.getByRole("button", { name: "Submit request", exact: true }).click();
      await customer.getByRole("status").filter({ hasText: "Submission unconfirmed" }).waitFor();
      await customer
        .getByRole("button", { name: "Retry saved unconfirmed submission", exact: true })
        .click();
      await customer.getByRole("status").filter({ hasText: "Server accepted" }).waitFor();
      const rows = (await api("customerA", "booking-core/view")).value.bookings.filter(
        (b) => Date.parse(b.requested_start) === Date.parse(next),
      );
      assert.equal(rows.length, 1);
      const events = await fixture.admin.query(
        "SELECT count(*) FROM mawid_core.booking_events WHERE booking_id=$1",
        [rows[0].booking_id],
      );
      assert.equal(events.rows[0].count, "1");
      await customer.getByRole("button", { name: "Refresh availability", exact: true }).click();
      await customer
        .getByLabel("Available time", { exact: true })
        .locator("option")
        .nth(2)
        .waitFor({ state: "attached" });
      await customer
        .getByLabel("Available time", { exact: true })
        .selectOption(
          await customer
            .getByLabel("Available time", { exact: true })
            .locator("option")
            .nth(2)
            .getAttribute("value"),
        );
      await customer.context().setOffline(true);
      await customer.getByRole("button", { name: "Submit request", exact: true }).click();
      await customer.getByRole("status").filter({ hasText: "Submission unconfirmed" }).waitFor();
      await customer.context().setOffline(false);
      await customer
        .getByRole("button", { name: "Retry saved unconfirmed submission", exact: true })
        .click();
      await customer.getByRole("status").filter({ hasText: "Server accepted" }).waitFor();
    },
  );
  await check(
    "stale staff decision gives useful conflict and refreshes current state",
    async () => {
      await admin.getByRole("button", { name: "Refresh server state", exact: true }).click();
      const item = (await api("customerA", "booking-core/view")).value.bookings.find(
        (b) => b.state === "pending",
      );
      await api("customerA", `booking-core/bookings/${item.booking_id}/withdraw`, {
        operation_id: randomUUID(),
        expected_version: item.version,
      });
      const response = await admin.evaluate(
        async ({ root, id, token, version }) => {
          const r = await fetch("/__booking_api" + root + `booking-core/bookings/${id}/confirm`, {
            method: "POST",
            headers: { authorization: "Bearer " + token, "content-type": "application/json" },
            body: JSON.stringify({ operation_id: crypto.randomUUID(), expected_version: version }),
          });
          return { status: r.status, value: await r.json() };
        },
        { root, id: item.booking_id, token: tokens.adminA, version: item.version },
      );
      assert.equal(response.status, 409);
      assert.equal(response.value.error.code, "STALE_VERSION");
      await admin.getByRole("button", { name: "Refresh server state", exact: true }).click();
      await admin
        .getByRole("region", { name: "Server bookings" })
        .getByText("withdrawn", { exact: false })
        .first()
        .waitFor();
    },
  );
  await check(
    "after-hours UI saves immediately while staff push waits for next configured opening",
    async () => {
      await fixture.admin.query(
        "INSERT INTO mawid_core.schedule_exceptions(workspace_id,location_id,local_date) VALUES($1,$2,(clock_timestamp() AT TIME ZONE 'Asia/Beirut')::date)",
        [W, L],
      );
      const slots = (
        await api("customerA", `booking-core/slots?service_id=${S}&professional_id=${P}`)
      ).value.items;
      const r = await api("customerA", "booking-core/requests", {
        operation_id: randomUUID(),
        customer_id: IDS.customerA,
        service_id: S,
        professional_id: P,
        start: slots[0].start,
      });
      assert.equal(r.status, 201);
      const row = (
        await fixture.admin.query(
          "SELECT o.deliver_after,b.submitted_at FROM mawid_core.outbox o JOIN mawid_core.booking_events e USING(workspace_id,event_id) JOIN mawid_core.bookings b USING(workspace_id,location_id,booking_id) WHERE b.booking_id=$1",
          [r.value.booking_id],
        )
      ).rows[0];
      assert.ok(+row.deliver_after > +row.submitted_at);
      await notifications.runOnce();
      const inbox = (await api("managerA", "notifications/inbox")).value.items;
      assert.ok(!inbox.some((i) => i.booking_id === r.value.booking_id));
      await customer.getByRole("button", { name: "Refresh server state", exact: true }).click();
      await customer
        .getByRole("region", { name: "Server bookings" })
        .getByText("pending", { exact: false })
        .first()
        .waitFor();
    },
  );
  await check("customer UI warns about late cancellation and still allows it", async () => {
    await fixture.admin.query("BEGIN");
    await fixture.admin.query(
      "UPDATE mawid_core.bookings SET assigned_start=date_trunc('minute',clock_timestamp())+interval '20 minutes',assigned_end=date_trunc('minute',clock_timestamp())+interval '50 minutes' WHERE booking_id=$1",
      [created.booking_id],
    );
    await fixture.admin.query(
      "UPDATE mawid_core.allocations a SET period=tstzrange(b.assigned_start,b.assigned_end,'[)') FROM mawid_core.bookings b WHERE a.booking_id=b.booking_id AND b.booking_id=$1",
      [created.booking_id],
    );
    await fixture.admin.query("COMMIT");
    await customer.getByRole("button", { name: "Refresh server state", exact: true }).click();
    await expect(
      customer.getByText(
        "Cancellation within the final hour counts toward the salon's late-cancellation flag.",
        { exact: true },
      ),
    ).toBeVisible();
    await customer.getByRole("button", { name: "Cancel appointment", exact: true }).click();
    await customer.getByRole("status").filter({ hasText: "Server accepted" }).waitFor();
    const current = await api("customerA", `booking-core/bookings/${created.booking_id}`);
    assert.equal(current.value.state, "cancelled");
  });
  await check(
    "professional UI is read-only and has no booking creation or decision controls",
    async () => {
      const employee = await open("professionalA", true);
      await expect(
        employee.getByText("Your appointments · read only", { exact: true }),
      ).toBeVisible();
      await expect(employee.getByLabel("Service", { exact: true })).toHaveCount(0);
      for (const name of [
        "Create appointment",
        "Approve",
        "Reject",
        "Assign / propose",
        "Cancel appointment",
      ])
        await expect(employee.getByRole("button", { name, exact: true })).toHaveCount(0);
      await employee.context().close();
    },
  );
  await check(
    "employee-first Arabic booking retains the first preference and adds an independent service",
    async () => {
      const arabic = await open("customerA", false, `?employee=${P}`);
      await arabic.getByRole("button", { name: "AR", exact: true }).click();
      await expect(arabic.locator("main")).toHaveAttribute("dir", "rtl");
      await arabic.getByLabel("الخدمة", { exact: true }).selectOption(S);
      await expect(arabic.getByLabel("الاختصاصي", { exact: true })).toHaveValue(P);
      await arabic.getByRole("button", { name: "إضافة خدمة", exact: true }).click();
      await arabic.getByLabel("الخدمة 2", { exact: true }).selectOption(S);
      await expect(arabic.getByLabel("الاختصاصي 2", { exact: true })).toHaveValue("");
      await arabic.getByRole("button", { name: "تحديث الأوقات المتاحة", exact: true }).click();
      const option = arabic.getByLabel("الوقت المتاح", { exact: true }).locator("option").nth(1);
      await option.waitFor({ state: "attached" });
      await arabic
        .getByLabel("الوقت المتاح", { exact: true })
        .selectOption(await option.getAttribute("value"));
      await expect(arabic.getByText(/مدة الزيارة الإجمالية/)).toBeVisible();
      await arabic.getByRole("button", { name: "إرسال الطلب", exact: true }).click();
      await arabic.getByRole("status").filter({ hasText: "قبل الخادم الإجراء" }).waitFor();
      const recent = (await api("customerA", "visit-core/view")).value.bookings.find(
        (visit) => visit.segments.length === 2,
      );
      assert.deepEqual(
        recent.segments.map((segment) => segment.requested_professional_id),
        [P, null],
      );
      await arabic.context().close();
    },
  );
  await check("revoked customer refresh clears all cached bookings in the actual UI", async () => {
    await fixture.admin.query(
      "UPDATE mawid_core.customer_profiles SET actor_id=NULL WHERE workspace_id=$1 AND customer_id=$2",
      [W, IDS.customerA],
    );
    await customer.getByRole("button", { name: "Refresh server state", exact: true }).click();
    await customer.getByRole("status").filter({ hasText: "NOT_FOUND" }).waitFor();
    assert.equal(await customer.getByRole("region", { name: "Server bookings" }).count(), 0);
  });
  const paths = [
    "scripts/database/booking/service.mjs",
    "scripts/database/api/http-server.mjs",
    "src/lib/booking-client.ts",
    "src/components/server-booking.tsx",
  ];
  writeFileSync(
    "database/booking-client-verification.json",
    JSON.stringify(
      {
        mode: "fictional-local-only",
        notification_transport: "simulated",
        device_acceptance: false,
        generated_at: new Date().toISOString(),
        checks: results,
        sha256: Object.fromEntries(
          paths.map((p) => [p, createHash("sha256").update(readFileSync(p)).digest("hex")]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${results.length} connected client checks passed.`);
} finally {
  await browser?.close();
  vite?.kill();
  await server?.close();
  await notifications?.close();
  await booking?.close();
  await data?.close();
  await fixture?.close();
}
