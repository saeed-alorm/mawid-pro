import test from "node:test";
import assert from "node:assert/strict";
import { startNotificationLoop } from "./scheduler.mjs";

test("notification batches cannot overlap and shutdown awaits the current batch", async () => {
  const pending = [];
  let calls = 0,
    resolve;
  const loop = startNotificationLoop(
    {
      runOnce() {
        calls++;
        return new Promise((r) => (resolve = r));
      },
    },
    {
      setTimer(fn, delay) {
        const t = { fn, delay };
        pending.push(t);
        return t;
      },
      clearTimer() {},
    },
  );
  pending.shift().fn();
  assert.equal(calls, 1);
  assert.equal(pending.length, 0);
  let stopped = false;
  const stop = loop.stop().then(() => (stopped = true));
  await Promise.resolve();
  assert.equal(stopped, false);
  resolve();
  await stop;
  assert.equal(stopped, true);
  assert.equal(pending.length, 0);
});

test("scheduler errors back off to a cap without exposing provider exceptions", async () => {
  const pending = [];
  const loop = startNotificationLoop(
    {
      async runOnce() {
        throw Error("synthetic private provider error");
      },
    },
    {
      intervalMs: 1000,
      setTimer(fn, delay) {
        const t = { fn, delay };
        pending.push(t);
        return t;
      },
      clearTimer() {},
    },
  );
  for (let i = 1; i <= 8; i++) {
    pending.shift().fn();
    await new Promise((r) => setImmediate(r));
    assert.equal(pending[0].delay, Math.min(60000, 1000 * 2 ** Math.min(i, 6)));
  }
  await loop.stop();
});
