import { test } from "node:test";
import assert from "node:assert/strict";
import { MaintenanceScheduler } from "./scheduler.mjs";
function timers() {
  let serial = 0;
  const queue = new Map();
  return {
    setTimeout(fn, delay) {
      const id = ++serial;
      queue.set(id, { fn, delay });
      return id;
    },
    clearTimeout(id) {
      queue.delete(id);
    },
    get delay() {
      return [...queue.values()][0]?.delay;
    },
    get count() {
      return queue.size;
    },
    next() {
      const [id, item] = [...queue][0];
      queue.delete(id);
      return item.fn();
    },
  };
}
test("one success schedules the next interval only after completion", async () => {
  const clock = timers();
  let calls = 0;
  const schedule = new MaintenanceScheduler(
    {
      runOnce: async () => {
        calls++;
        return { status: "succeeded" };
      },
    },
    { timers: clock },
  );
  schedule.start();
  schedule.start();
  assert.equal(clock.count, 1);
  assert.equal(clock.delay, 60000);
  await clock.next();
  assert.equal(calls, 1);
  assert.equal(clock.count, 1);
  assert.equal(clock.delay, 60000);
  await schedule.stop();
  assert.equal(clock.count, 0);
});
test("shutdown waits for an active run and never schedules another", async () => {
  const clock = timers();
  let finish;
  const pending = new Promise((resolve) => (finish = resolve));
  const schedule = new MaintenanceScheduler({ runOnce: () => pending }, { timers: clock });
  schedule.start();
  const running = clock.next();
  assert.equal(clock.count, 0);
  let stopped = false;
  const stop = schedule.stop().then(() => (stopped = true));
  await Promise.resolve();
  assert.equal(stopped, false);
  finish({ status: "succeeded" });
  await running;
  await stop;
  assert.equal(clock.count, 0);
});
test("failure retry doubles up to a cap and resets after recovery", async () => {
  const clock = timers();
  const statuses = ["failed", "failed", "failed", "succeeded"];
  const schedule = new MaintenanceScheduler(
    { runOnce: async () => ({ status: statuses.shift() }) },
    { timers: clock, retryBaseMs: 1000, maxRetryMs: 2500 },
  );
  schedule.start();
  for (const delay of [1000, 2000, 2500, 60000]) {
    await clock.next();
    assert.equal(clock.delay, delay);
  }
  await schedule.stop();
});
test("unexpected worker errors and observer errors cannot break future retries", async () => {
  const clock = timers();
  const results = [];
  const schedule = new MaintenanceScheduler(
    {
      runOnce: async () => {
        throw new Error("not for logs");
      },
    },
    {
      timers: clock,
      onResult: (result) => {
        results.push(result);
        throw new Error("observer failed");
      },
    },
  );
  schedule.start();
  await clock.next();
  assert.deepEqual(results, [{ status: "failed", code: "MAINTENANCE_FAILED" }]);
  assert.equal(clock.delay, 1000);
  await schedule.stop();
});
test("another worker holding the lock does not cause a hot retry loop", async () => {
  const clock = timers();
  const schedule = new MaintenanceScheduler(
    { runOnce: async () => ({ status: "skipped", code: "MAINTENANCE_BUSY" }) },
    { timers: clock },
  );
  schedule.start();
  await clock.next();
  assert.equal(clock.delay, 60000);
  await schedule.stop();
});
test("invalid timing configurations fail before scheduling work", () => {
  for (const option of [
    { intervalMs: 0 },
    { retryBaseMs: 1 },
    { maxRetryMs: 3600001 },
    { retryBaseMs: 1000, maxRetryMs: 100 },
  ])
    assert.throws(
      () => new MaintenanceScheduler({ runOnce: async () => {} }, option),
      /INVALID_MAINTENANCE_SCHEDULE/,
    );
});
