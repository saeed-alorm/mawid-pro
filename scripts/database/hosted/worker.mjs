import { createServer } from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
import { httpServerHandler } from "cloudflare:node";
import { createDataServer } from "../api/http-server.mjs";
import { createHostedRuntime } from "./runtime.mjs";

const requests = new AsyncLocalStorage();
const server = createServer((req, res) => requests.getStore()(req, res));
server.listen(8080);
const http = httpServerHandler(server);
function sender(env) {
  if (!env.FCM_SENDER?.fetch) throw Error("HOSTED_FCM_SENDER_REQUIRED");
  return {
    transport: "fcm",
    async send({ signal, ...job }) {
      // Private service binding to the operator's keyless FCM sender. Never public HTTP.
      const response = await env.FCM_SENDER.fetch("https://fcm-sender.internal/send", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job),
      });
      if (!response.ok) return { status: "retry", code: "TRANSPORT" };
      const reader = response.body?.getReader();
      if (!reader) return { status: "failed", code: "INVALID_SENDER_RESULT" };
      let raw = "",
        size = 0;
      try {
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 1024) return { status: "failed", code: "INVALID_SENDER_RESULT" };
          raw += decoder.decode(value, { stream: true });
        }
        return JSON.parse(raw + decoder.decode());
      } finally {
        await reader.cancel();
      }
    },
  };
}
export default {
  async fetch(request, env, ctx) {
    let runtime;
    try {
      runtime = createHostedRuntime(env, sender(env));
      if (new URL(request.url).origin !== runtime.config.origin)
        return new Response(null, { status: 421 });
      await runtime.verify();
      const requestServer = await createDataServer(runtime.data, {
        ...runtime,
        origin: runtime.config.origin,
        mode: "verified-staging",
      });
      return await requests.run(requestServer.listeners("request")[0], () =>
        http.fetch(request, env, ctx),
      );
    } catch {
      return Response.json(
        { error: { code: "TEMPORARILY_UNAVAILABLE" } },
        { status: 503, headers: { "cache-control": "no-store", "retry-after": "1" } },
      );
    } finally {
      await runtime?.close();
    }
  },
  async scheduled(_event, env) {
    let runtime;
    try {
      runtime = createHostedRuntime(env, sender(env));
      await runtime.verify();
      await runtime.notifications.runOnce();
    } finally {
      await runtime?.close();
    }
  },
};
