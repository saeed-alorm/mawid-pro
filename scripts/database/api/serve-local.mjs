import { mkdtemp, writeFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createLocalFixture, IDS, USERS } from "./fixture.mjs";
import { LocalDataService } from "./data-service.mjs";
import { LocalMaintenanceWorker } from "../maintenance/worker.mjs";
import { startMaintainedLocalServer } from "../maintenance/runtime.mjs";

let fixture, service, server, maintenance, directory;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await server?.close();
  } finally {
    await Promise.allSettled([service?.close(), maintenance?.close()]);
    try {
      await fixture?.close();
    } finally {
      if (directory) {
        await rm(path.join(directory, "sessions.json"), { force: true });
        await rmdir(directory);
      }
    }
  }
}
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== "--check"))
    throw new Error("INVALID_LOCAL_ARGUMENTS");
  fixture = await createLocalFixture();
  service = new LocalDataService(fixture.configs);
  maintenance = new LocalMaintenanceWorker(fixture.maintenanceConfig);
  server = await startMaintainedLocalServer(service, maintenance);
  const sessions = Object.fromEntries(
    Object.entries(USERS).map(([name, user]) => [name, service.issueSession(user)]),
  );
  if (args[0] === "--check") {
    const response = await fetch(server.origin + "/v1/workspaces/" + IDS.workspaceA + "/profiles", {
      headers: { authorization: "Bearer " + sessions.managerA.token },
    });
    const result = await response.json();
    if (response.status !== 200 || result.items.length !== 1) throw new Error("LOCAL_SMOKE_FAILED");
    console.log("Local API startup, authenticated read and cleanup check passed.");
    await close();
  } else {
    // Keep fictional bearer tokens outside the Vite/source root as well as outside Git.
    directory = await mkdtemp(path.join(tmpdir(), "mawid-local-data-"));
    const sessionFile = path.join(directory, "sessions.json");
    await writeFile(
      sessionFile,
      JSON.stringify(
        { mode: "fictional-local-only", origin: server.origin, ids: IDS, sessions },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log("Fictional local data API: " + server.origin);
    console.log("Temporary fictional sessions: " + sessionFile);
    console.log(
      "Sessions expire in 15 minutes. Ctrl+C removes this disposable database and session file.",
    );
    process.once("SIGINT", () => void close());
    process.once("SIGTERM", () => void close());
  }
} catch {
  console.error("LOCAL_DATA_API_START_FAILED");
  await close();
  process.exitCode = 1;
}
