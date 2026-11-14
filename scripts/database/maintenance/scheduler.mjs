export class MaintenanceScheduler {
  #worker;
  #timer;
  #active;
  #running = false;
  #failures = 0;
  #timers;
  #onResult;
  #interval;
  #retry;
  #cap;
  constructor(
    worker,
    {
      intervalMs = 60000,
      retryBaseMs = 1000,
      maxRetryMs = 60000,
      timers = { setTimeout, clearTimeout },
      onResult = () => {},
    } = {},
  ) {
    if (
      !worker ||
      typeof worker.runOnce !== "function" ||
      ![intervalMs, retryBaseMs, maxRetryMs].every(
        (n) => Number.isInteger(n) && n >= 10 && n <= 3600000,
      ) ||
      retryBaseMs > maxRetryMs
    )
      throw new Error("INVALID_MAINTENANCE_SCHEDULE");
    this.#worker = worker;
    this.#timers = timers;
    this.#onResult = onResult;
    this.#interval = intervalMs;
    this.#retry = retryBaseMs;
    this.#cap = maxRetryMs;
  }
  start() {
    if (this.#running) return;
    this.#running = true;
    this.#schedule(this.#interval);
  }
  #schedule(delay) {
    if (this.#running)
      this.#timer = this.#timers.setTimeout(() => {
        this.#timer = undefined;
        this.#active = this.#tick().finally(() => {
          this.#active = undefined;
        });
        return this.#active;
      }, delay);
  }
  async #tick() {
    let result;
    try {
      result = await this.#worker.runOnce();
    } catch {
      result = { status: "failed", code: "MAINTENANCE_FAILED" };
    }
    try {
      this.#onResult(result);
    } catch {}
    if (result.status === "failed") {
      this.#failures = Math.min(this.#failures + 1, 20);
      this.#schedule(Math.min(this.#cap, this.#retry * 2 ** (this.#failures - 1)));
    } else {
      this.#failures = 0;
      this.#schedule(this.#interval);
    }
  }
  async stop() {
    this.#running = false;
    if (this.#timer !== undefined) {
      this.#timers.clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    await this.#active;
  }
}
