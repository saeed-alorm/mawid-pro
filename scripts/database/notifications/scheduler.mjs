// One awaited batch at a time. Never called from a booking transaction.
export function startNotificationLoop(
  worker,
  { intervalMs = 1000, setTimer = setTimeout, clearTimer = clearTimeout } = {},
) {
  if (!Number.isFinite(intervalMs) || intervalMs < 100 || intervalMs > 60000)
    throw Error("INVALID_NOTIFICATION_INTERVAL");
  let stopped = false,
    timer,
    active = Promise.resolve(),
    failures = 0;
  function schedule(delay) {
    if (stopped) return;
    timer = setTimer(() => {
      active = (async () => {
        try {
          await worker.runOnce();
          failures = 0;
        } catch {
          failures = Math.min(failures + 1, 6);
        }
        schedule(failures ? Math.min(60000, intervalMs * 2 ** failures) : intervalMs);
      })();
    }, delay);
    timer?.unref?.();
  }
  schedule(0);
  return {
    async stop() {
      stopped = true;
      clearTimer(timer);
      await active;
    },
  };
}
