import { createCipheriv, createDecipheriv, createHmac, randomBytes, hkdfSync } from "node:crypto";

export const MAX_ATTEMPTS = 5;
export function retryDelay(attempt, retryAfterMs = 0, random = Math.random) {
  if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) retryAfterMs = 0;
  return Math.min(
    3600000,
    Math.max(retryAfterMs, Math.min(900000, 30000 * 2 ** (attempt - 1)) * (1 + random() * 0.2)),
  );
}
export const templates = {
  en: { title: "MAWID update", body: "Open MAWID to check the latest booking status." },
  ar: { title: "تحديث من موعد", body: "افتح موعد للاطلاع على أحدث حالة للحجز." },
};
export class TokenVault {
  #key;
  #digestKey;
  constructor(key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw Error("TOKEN_KEY_REQUIRED");
    this.#key = Buffer.from(
      hkdfSync("sha256", key, Buffer.alloc(0), "mawid.push.encryption.v1", 32),
    );
    this.#digestKey = Buffer.from(
      hkdfSync("sha256", key, Buffer.alloc(0), "mawid.push.digest.v1", 32),
    );
  }
  digest(token) {
    return createHmac("sha256", this.#digestKey).update(token).digest("hex");
  }
  encrypt(token, binding) {
    const iv = randomBytes(12),
      cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(binding));
    return Buffer.concat([iv, cipher.update(token), cipher.final(), cipher.getAuthTag()]).toString(
      "base64",
    );
  }
  decrypt(value, binding) {
    const bytes = Buffer.from(value, "base64");
    const cipher = createDecipheriv("aes-256-gcm", this.#key, bytes.subarray(0, 12));
    cipher.setAAD(Buffer.from(binding));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString("utf8");
  }
}

// Never stores destinations, payloads or tokens; intended for deterministic tests.
export class SimulatedSender {
  constructor(outcomes = []) {
    this.transport = "simulated";
    this.outcomes = [...outcomes];
    this.calls = 0;
  }
  async send() {
    this.calls++;
    const result = this.outcomes.shift() ?? { status: "accepted" };
    if (result instanceof Error) throw result;
    return result;
  }
}
