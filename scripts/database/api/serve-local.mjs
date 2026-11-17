import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createLocalFixture, IDS, USERS, AUTH_USERS } from "./fixture.mjs";
import { LocalDataService } from "./data-service.mjs";
import { LocalBookingService } from "../booking/service.mjs";
import { LocalMaintenanceWorker } from "../maintenance/worker.mjs";
import { startMaintainedLocalServer } from "../maintenance/runtime.mjs";
import { LocalNotifications } from "../notifications/service.mjs";
import { SimulatedSender } from "../notifications/policy.mjs";
import { FcmSender } from "../notifications/fcm.mjs";
import { startNotificationLoop } from "../notifications/scheduler.mjs";
import { createSignedSessionFixture } from "../identity/signed-session-fixture.mjs";

let fixture, service, server, maintenance, directory, booking, notifications, notificationLoop;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await server?.close();
  } finally {
    await notificationLoop?.stop();
    await Promise.allSettled([
      notifications?.close(),
      service?.close(),
      maintenance?.close(),
      booking?.close(),
    ]);
    try {
      await fixture?.close();
    } finally {
      if (directory) {
        await rm(path.join(directory, "sessions.json"), { force: true });
        await rm(path.join(directory, "android-notifications.private.json"), { force: true });
        await rmdir(directory);
      }
    }
  }
  if (process.connected) process.disconnect();
}
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !["--check", "--signed"].includes(args[0])))
    throw new Error("INVALID_LOCAL_ARGUMENTS");
  const signed = args[0] === "--signed";
  fixture = await createLocalFixture({ authorizationFixtures: true, bookingFixtures: true });
  const issuer = signed
    ? await createSignedSessionFixture(fixture)
    : new LocalDataService(fixture.configs);
  service = signed ? issuer.service : issuer;
  booking = new LocalBookingService(service, fixture.bookingConfig);
  const transport = process.env.MAWID_NOTIFICATION_TRANSPORT ?? "simulated";
  if (!["simulated", "fcm"].includes(transport)) throw Error("INVALID_NOTIFICATION_TRANSPORT");
  if (signed && transport !== "simulated") throw Error("SIGNED_FIXTURE_SIMULATED_ONLY");
  const sender = transport === "fcm" ? await FcmSender.fromADC() : new SimulatedSender();
  notifications = new LocalNotifications(service, booking, fixture.notificationConfig, {
    key: randomBytes(32),
    sender,
  });
  maintenance = new LocalMaintenanceWorker(fixture.maintenanceConfig);
  server = await startMaintainedLocalServer(service, maintenance, {
    serverOptions: { booking, notifications },
  });
  notificationLoop = startNotificationLoop(notifications);
  const sessions = Object.fromEntries(
    await Promise.all(
      Object.entries({ ...USERS, ...AUTH_USERS }).map(async ([name, user]) => [
        name,
        await issuer.issueSession(user, signed ? 300000 : 900000),
      ]),
    ),
  );
  if (args[0] === "--check") {
    const response = await fetch(server.origin + "/v1/workspaces/" + IDS.workspaceA + "/profiles", {
      headers: { authorization: "Bearer " + sessions.managerA.token },
    });
    const result = await response.json();
    if (response.status !== 200 || result.items.length !== 3) throw new Error("LOCAL_SMOKE_FAILED");
    for (const [name, workspace, location, expected] of [
      ["professionalA", IDS.workspaceA, IDS.locationA, 200],
      ["locationManagerA", IDS.workspaceB, IDS.locationB, 404],
      ["customerA", IDS.workspaceA, IDS.locationA, 200],
    ]) {
      const check = await fetch(
        `${server.origin}/v1/workspaces/${workspace}/locations/${location}/bookings`,
        { headers: { authorization: "Bearer " + sessions[name].token } },
      );
      if (check.status !== expected) throw new Error("LOCAL_ROLE_SMOKE_FAILED");
    }
    console.log("Local API startup, authenticated read and cleanup check passed.");
    await close();
  } else {
    // Keep fictional bearer tokens outside the Vite/source root as well as outside Git.
    directory = await mkdtemp(path.join(tmpdir(), "mawid-local-data-"));
    const sessionFile = path.join(directory, "sessions.json");
    const mode = signed ? "fictional-signed-local-only" : "fictional-local-only";
    await writeFile(
      sessionFile,
      JSON.stringify(
        {
          mode,
          origin: server.origin,
          ids: IDS,
          sessions,
          notification_transport: transport,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    const actor = process.env.MAWID_NOTIFICATION_ACTOR ?? "managerA";
    if (!["managerA", "customerA"].includes(actor)) throw Error("INVALID_NOTIFICATION_ACTOR");
    const appFile = path.join(directory, "android-notifications.private.json");
    await writeFile(
      appFile,
      JSON.stringify({
        mode,
        origin: server.origin,
        workspace_id: IDS.workspaceA,
        location_id: IDS.locationA,
        installation_id: randomUUID(),
        token: sessions[actor].token,
        expires_at: sessions[actor].expires_at,
      }),
      { mode: 0o600, flag: "wx" },
    );
    console.log("Notification transport: " + transport);
    console.log("Private Android test session: " + appFile);
    console.log("Fictional local data API: " + server.origin);
    console.log("Temporary fictional sessions: " + sessionFile);
    console.log(
      `Sessions expire in ${signed ? 5 : 15} minutes. Ctrl+C removes this disposable database and session file.`,
    );
    process.once("SIGINT", () => void close());
    process.once("SIGTERM", () => void close());
    process.on("message", (message) => {
      if (message === "mawid-local-shutdown") void close();
    });
  }
} catch {
  console.error("LOCAL_DATA_API_START_FAILED");
  await close();
  process.exitCode = 1;
}
