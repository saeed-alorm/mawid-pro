import { GoogleAuth } from "google-auth-library";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { templates } from "./policy.mjs";

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
export class FcmSender {
  get transport() {
    return "fcm";
  }
  #token;
  #request;
  #project;
  constructor({ projectId, getAccessToken, request = fetch }) {
    if (projectId !== "mawid-development" || typeof getAccessToken !== "function")
      throw Error("INVALID_FCM_CONFIG");
    this.#project = projectId;
    this.#token = getAccessToken;
    this.#request = request;
  }
  static async fromADC({ projectId = "mawid-development" } = {}) {
    credentialPath();
    const auth = new GoogleAuth({
      projectId,
      scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
    });
    // ADC refreshes short-lived access tokens on the trusted server only.
    return new FcmSender({ projectId, getAccessToken: () => auth.getAccessToken() });
  }
  async send({
    token,
    notificationId,
    eventId,
    deliveryId,
    locale,
    applicationId,
    environment = "development",
    workspaceId,
    locationId,
    signal,
  }) {
    let access;
    try {
      access = await this.#token();
      signal?.throwIfAborted();
    } catch (e) {
      return {
        status: e?.response?.status === 401 || e?.response?.status === 403 ? "failed" : "retry",
        code:
          e?.response?.status === 401 || e?.response?.status === 403
            ? "AUTHORIZATION"
            : "UNAVAILABLE",
      };
    }
    if (!access) return { status: "failed", code: "AUTHORIZATION" };
    const text = templates[locale] ?? templates.en;
    try {
      const r = await this.#request(
        `https://fcm.googleapis.com/v1/projects/${this.#project}/messages:send`,
        {
          method: "POST",
          signal,
          headers: { authorization: "Bearer " + access, "content-type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: text,
              data: {
                notification_id: notificationId,
                event_id: eventId,
                delivery_id: deliveryId,
                environment,
                schema: "1",
                application_id: applicationId,
                ...(workspaceId ? { workspace_id: workspaceId } : {}),
                ...(locationId ? { location_id: locationId } : {}),
              },
              android: {
                priority: "NORMAL",
                ttl: "300s",
                restrictedPackageName: applicationId,
                notification: { tag: notificationId, visibility: "PRIVATE", defaultSound: true },
              },
            },
          }),
        },
      );
      let value;
      try {
        value = await r.json();
      } catch {
        value = {};
      }
      if (r.ok)
        return typeof value.name === "string" &&
          value.name.startsWith(`projects/${this.#project}/messages/`)
          ? { status: "accepted" }
          : { status: "retry", code: "UNAVAILABLE" };
      const error = value.error?.details?.find(
        (x) => x["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError",
      )?.errorCode;
      if (error === "UNREGISTERED") return { status: "invalid_token" };
      if (r.status === 401 || r.status === 403) return { status: "failed", code: "AUTHORIZATION" };
      const raw = r.headers.get("retry-after");
      const retryAfterMs = raw
        ? /^\d+$/.test(raw)
          ? Number(raw) * 1000
          : Math.max(0, Date.parse(raw) - Date.now())
        : 0;
      if (r.status === 429)
        return { status: "retry", code: "QUOTA", retryAfterMs: Math.max(60000, retryAfterMs || 0) };
      if (r.status >= 500)
        return { status: "retry", code: "UNAVAILABLE", retryAfterMs: retryAfterMs || 0 };
      return { status: "failed", code: "PAYLOAD" };
    } catch (e) {
      return {
        status: "retry",
        code: signal?.aborted || e?.name === "AbortError" ? "TIMEOUT" : "TRANSPORT",
      };
    }
  }
}
