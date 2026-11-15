import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// Deliberate development-only USB pairing. This file never accepts Admin SDK
// credentials or prints the short-lived actor session copied to private storage.
try {
  const [sessionFile, deviceArgument] = process.argv.slice(2);
  if (!sessionFile || !path.isAbsolute(sessionFile)) throw Error();
  for (let dir = path.dirname(sessionFile); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, ".git"))) throw Error();
    if (path.dirname(dir) === dir) break;
  }
  const uuid = z.string().regex(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  const input = z
    .object({
      mode: z.literal("fictional-local-only"),
      origin: z.string(),
      workspace_id: uuid,
      location_id: uuid,
      installation_id: uuid,
      token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      expires_at: z.string().datetime(),
    })
    .strict()
    .parse(JSON.parse(readFileSync(sessionFile, "utf8")));
  const origin = new URL(input.origin);
  if (
    origin.protocol !== "http:" ||
    origin.hostname !== "127.0.0.1" ||
    !origin.port ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    Date.parse(input.expires_at) <= Date.now()
  )
    throw Error();
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  const adb = sdk
    ? path.join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb")
    : "adb";
  const devices = execFileSync(adb, ["devices"], { encoding: "utf8", timeout: 10000 })
    .split(/\r?\n/)
    .map((x) => /^(\S+)\s+device$/.exec(x.trim())?.[1])
    .filter(Boolean);
  const device = deviceArgument || (devices.length === 1 ? devices[0] : null);
  if (!device || !devices.includes(device)) throw Error();
  const base = ["-s", device];
  const info = execFileSync(adb, [...base, "shell", "dumpsys", "package", "com.mawid.demo"], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (!/DEBUGGABLE/.test(info) || Number(/versionCode=(\d+)/.exec(info)?.[1]) < 4) throw Error();
  execFileSync(adb, [...base, "reverse", `tcp:${origin.port}`, `tcp:${origin.port}`], {
    stdio: "pipe",
    timeout: 10000,
  });
  // tee's output is captured and discarded, never inherited by a terminal/logger.
  execFileSync(
    adb,
    [
      ...base,
      "shell",
      "-T",
      "run-as",
      "com.mawid.demo",
      "tee",
      "code_cache/mawid-notification-session.private.json",
    ],
    { input: JSON.stringify(input), stdio: ["pipe", "pipe", "pipe"], timeout: 10000 },
  );
  const transferred = execFileSync(
    adb,
    [
      ...base,
      "shell",
      "-T",
      "run-as",
      "com.mawid.demo",
      "cat",
      "code_cache/mawid-notification-session.private.json",
    ],
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 10000 },
  );
  if (transferred.trim() !== JSON.stringify(input)) throw Error();
  console.log(
    "Private synthetic notification session paired over USB. Open Notifications and connect the local test inbox.",
  );
} catch {
  console.error(
    "ANDROID_NOTIFICATION_PAIRING_FAILED; check the private session path, expiry, SDK, single authorized device and debug APK version 4 or newer.",
  );
  process.exitCode = 1;
}
