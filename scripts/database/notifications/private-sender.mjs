import { boundedJson } from "./bounded-json.mjs";
import { FcmTransport } from "./fcm-transport.mjs";
import { stagingIdentity, x509SubjectToken } from "./staging-identity.mjs";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ids = ["notificationId", "eventId", "deliveryId", "workspaceId", "locationId"];
const packages = ["com.mawid.customer.platinum", "com.mawid.management"];
const result = (status, code) =>
  Response.json({ status, code }, { headers: { "cache-control": "no-store" } });

function valid(job) {
  return (
    job &&
    typeof job === "object" &&
    Object.keys(job).length === ids.length + 4 &&
    ids.every((key) => typeof job[key] === "string" && uuid.test(job[key])) &&
    packages.includes(job.applicationId) &&
    job.environment === "staging" &&
    ["en", "ar"].includes(job.locale) &&
    typeof job.token === "string" &&
    /^[A-Za-z0-9:_.-]{20,4096}$/.test(job.token)
  );
}

export function privateSender({
  request = (url, options) => fetch(url, options),
  now = Date.now,
} = {}) {
  const clients = new WeakMap();
  return {
    async fetch(incoming, env) {
      if (incoming.url !== "https://fcm-sender.internal/send" || incoming.method !== "POST")
        return new Response(null, { status: 404 });
      if (
        env.PILOT_ACCESS !== "disabled" ||
        env.MAWID_FCM_LIVE !== "enabled" ||
        typeof env.FCM_STS_CERT?.fetch !== "function"
      )
        return result("failed", "AUTHORIZATION");
      let job;
      try {
        if (incoming.headers.get("content-type") !== "application/json")
          return result("failed", "PAYLOAD");
        job = await boundedJson(incoming, 8192);
      } catch {
        return result("failed", "PAYLOAD");
      }
      if (!valid(job)) return result("failed", "PAYLOAD");
      let sender = clients.get(env);
      if (!sender) {
        const subjectToken = x509SubjectToken(env.FCM_STS_TRUST_CHAIN);
        if (!subjectToken) return result("failed", "AUTHORIZATION");
        sender = new FcmTransport({
          projectId: "mawid-development",
          request,
          ...stagingIdentity(env.FCM_STS_CERT, subjectToken, request, now),
        });
        clients.set(env, sender);
      }
      const outcome = await sender.send({ ...job, signal: incoming.signal });
      if (outcome.code === "TIMEOUT") return result("retry", "TRANSPORT");
      return Response.json(outcome, { headers: { "cache-control": "no-store" } });
    },
  };
}

export default privateSender();
