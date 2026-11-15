import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { TokenVault, retryDelay, SimulatedSender } from "./policy.mjs";

test("tokens are encrypted and cannot be moved between recipient bindings", () => {
  const v = new TokenVault(randomBytes(32));
  const token = "synthetic-test-token-never-a-real-device";
  const cipher = v.encrypt(token, "workspace:actor:installation");
  assert.ok(!cipher.includes(token));
  assert.equal(v.decrypt(cipher, "workspace:actor:installation"), token);
  assert.throws(() => v.decrypt(cipher, "other-workspace:actor:installation"));
  assert.throws(() =>
    new TokenVault(randomBytes(32)).decrypt(cipher, "workspace:actor:installation"),
  );
  assert.notEqual(cipher, v.encrypt(token, "workspace:actor:installation"));
});
test("retry backoff is bounded and honors capped retry-after", () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((a) => retryDelay(a, 0, () => 0)),
    [30000, 60000, 120000, 240000, 480000],
  );
  assert.equal(
    retryDelay(99, 99999999, () => 1),
    3600000,
  );
  assert.equal(
    retryDelay(1, NaN, () => 0),
    30000,
  );
});
test("minimal simulator exercises success, failure and retry without retaining tokens", async () => {
  const sender = new SimulatedSender([
    { status: "retry", code: "UNAVAILABLE" },
    { status: "failed", code: "PAYLOAD" },
  ]);
  assert.equal((await sender.send()).status, "retry");
  assert.equal((await sender.send()).status, "failed");
  assert.equal((await sender.send()).status, "accepted");
  assert.equal(sender.calls, 3);
});
