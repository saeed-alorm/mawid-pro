import { startLocalDataServer } from "../api/http-server.mjs";
import { MaintenanceScheduler } from "./scheduler.mjs";
export async function startMaintainedLocalServer(
  service,
  worker,
  { serverOptions = {}, schedulerOptions = {} } = {},
) {
  const scheduler = new MaintenanceScheduler(worker, schedulerOptions);
  // Reconcile protected erasure decisions and clear overdue artifacts before HTTP can listen.
  await worker.verifyPrincipal();
  const initial = await worker.runOnce();
  if (initial.status !== "succeeded") throw new Error("MAINTENANCE_STARTUP_BLOCKED");
  const server = await startLocalDataServer(service, serverOptions);
  scheduler.start();
  return {
    ...server,
    async close() {
      try {
        await server.close();
      } finally {
        await scheduler.stop();
      }
    },
  };
}
