import { templates } from "./policy.mjs";
import { boundedJson } from "./bounded-json.mjs";

export class FcmTransport {
  get transport() {
    return "fcm";
  }
  #token;
  #invalidate;
  #request;
  #project;
  constructor({ projectId, getAccessToken, invalidateAccessToken, request = fetch }) {
    if (projectId !== "mawid-development" || typeof getAccessToken !== "function")
      throw Error("INVALID_FCM_CONFIG");
    this.#project = projectId;
    this.#token = getAccessToken;
    this.#invalidate = invalidateAccessToken;
    this.#request = request;
  }
  async send(job, retryAuth = true) {
    const {
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
    } = job;
    let access;
    try {
      signal?.throwIfAborted();
      access = await this.#token(signal);
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
          redirect: "error",
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
        value = await boundedJson(r, 16384);
      } catch {
        value = {};
      }
      if (r.ok)
        return typeof value?.name === "string" &&
          /^projects\/mawid-development\/messages\/[^/\s]+$/.test(value.name)
          ? { status: "accepted" }
          : { status: "retry", code: "UNAVAILABLE" };
      if (r.status === 401 && this.#invalidate) {
        this.#invalidate(access);
        if (retryAuth) return this.send(job, false);
      }
      const details = value?.error?.details;
      if (
        r.status === 404 &&
        Array.isArray(details) &&
        details.some(
          (detail) =>
            detail?.["@type"] === "type.googleapis.com/google.firebase.fcm.v1.FcmError" &&
            detail.errorCode === "UNREGISTERED",
        )
      )
        return { status: "invalid_token" };
      if (r.status === 401 || r.status === 403) return { status: "failed", code: "AUTHORIZATION" };
      const raw = r.headers.get("retry-after");
      const retryAfterMs = raw
        ? /^\d+$/.test(raw)
          ? Number(raw) * 1000
          : Math.max(0, Date.parse(raw) - Date.now())
        : 0;
      const delay = Math.min(3600000, retryAfterMs || 0);
      if (r.status === 429)
        return { status: "retry", code: "QUOTA", retryAfterMs: Math.max(60000, delay) };
      if (r.status >= 500) return { status: "retry", code: "UNAVAILABLE", retryAfterMs: delay };
      return { status: "failed", code: "PAYLOAD" };
    } catch (e) {
      return {
        status: "retry",
        code: signal?.aborted || e?.name === "AbortError" ? "TIMEOUT" : "TRANSPORT",
      };
    }
  }
}
