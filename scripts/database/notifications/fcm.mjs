import { GoogleAuth } from "google-auth-library";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { FcmTransport } from "./fcm-transport.mjs";

function credentialPath() {
  const file =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    path.join(
      process.env.APPDATA || path.join(homedir(), ".config"),
      "gcloud",
      "application_default_credentials.json",
    );
  if (!path.isAbsolute(file)) throw Error("FCM_CREDENTIALS_REQUIRED");
  for (let dir = path.dirname(file); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, ".git"))) throw Error("CREDENTIALS_MUST_BE_OUTSIDE_GIT");
    if (path.dirname(dir) === dir) break;
  }
  try {
    const c = JSON.parse(readFileSync(file, "utf8"));
    if (
      !["authorized_user", "service_account"].includes(c.type) ||
      c.token_url ||
      c.token_info_url ||
      c.service_account_impersonation_url ||
      (c.token_uri && c.token_uri !== "https://oauth2.googleapis.com/token") ||
      (c.type === "service_account" && c.project_id !== "mawid-development")
    )
      throw Error();
  } catch {
    throw Error("FCM_CREDENTIALS_REQUIRED");
  }
  return file;
}
export class FcmSender extends FcmTransport {
  static async fromADC({ projectId = "mawid-development" } = {}) {
    credentialPath();
    const auth = new GoogleAuth({
      projectId,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    // ADC refreshes short-lived access tokens on the trusted server only.
    return new FcmSender({ projectId, getAccessToken: () => auth.getAccessToken() });
  }
}
