import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseImport, exportCsv } from "../csv.mjs";
import { BookingError } from "../booking/service.mjs";
import { SessionError } from "../identity/session-gate.mjs";

const uuid = z.string().regex(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
const page = z
  .object({ after: uuid.optional(), limit: z.coerce.number().int().min(1).max(50).default(50) })
  .strict();
class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.apiCode = code;
  }
}
function validate(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED");
  return parsed.data;
}
function params(url, schema) {
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) throw new ApiError(422, "VALIDATION_FAILED");
  return validate(schema, Object.fromEntries(url.searchParams));
}
async function body(req, type, max = 5 * 1024 * 1024) {
  if (req.headers["content-type"]?.split(";")[0].trim() !== type)
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE");
  if (Number(req.headers["content-length"]) > max) throw new ApiError(413, "FILE_LIMIT");
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    };
    const onError = () => {
      cleanup();
      reject(new ApiError(400, "INVALID_REQUEST"));
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > max) {
        cleanup();
        req.pause();
        reject(new ApiError(413, "FILE_LIMIT"));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => {
      cleanup();
      resolve(Buffer.concat(chunks));
    };
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
  });
}
async function jsonBody(req, schema) {
  const bytes = await body(req, "application/json", 16 * 1024);
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new ApiError(422, "VALIDATION_FAILED");
  }
  return validate(schema, value);
}
function safeError(error) {
  if (error instanceof SessionError) return error;
  if (error instanceof BookingError) return error;
  if (["INVALID_TIME", "SCHEDULE_UNAVAILABLE"].includes(error.message))
    return new ApiError(422, error.message);
  if (error instanceof ApiError) return error;
  if (error.code === "P0002" || error.code === "42501" || error.code === "23503")
    return new ApiError(404, "NOT_FOUND");
  if (error.code === "23505") return new ApiError(409, "EXISTING_RECORD");
  if (
    [
      "STALE_PREVIEW",
      "ALREADY_COMMITTED",
      "PREVIEW_EXPIRED",
      "EXPORT_EXPIRED",
      "EXISTING_RECORD",
    ].includes(error.message)
  )
    return new ApiError(409, error.message);
  if (
    [
      "INVALID_IMPORT",
      "INVALID_KIND",
      "INVALID_ROW",
      "INVALID_COLUMNS_OR_TYPES",
      "INVALID_KEY",
      "DUPLICATE_ROW",
      "INVALID_CUSTOMER",
      "INVALID_PROFESSIONAL",
      "INVALID_SERVICE",
      "INVALID_OPENING",
      "CONFIRMATION_REQUIRED",
      "INVALID_UTF8",
      "INVALID_INPUT",
      "INVALID_CSV",
      "INVALID_COLUMNS",
      "MISSING_FIELDS",
      "ROW_LIMIT",
    ].includes(error.message)
  )
    return new ApiError(422, error.message);
  if (error.message === "FILE_LIMIT") return new ApiError(413, "FILE_LIMIT");
  if (error.code?.startsWith("22") || error.code === "23514" || error.code === "23502")
    return new ApiError(422, "VALIDATION_FAILED");
  if (
    ["57014", "55P03", "57P01", "57P02", "57P03", "ECONNREFUSED", "ECONNRESET", "EPIPE"].includes(
      error.code,
    ) ||
    error.code?.startsWith("08")
  )
    return new ApiError(503, "TEMPORARILY_UNAVAILABLE");
  return new ApiError(500, "INTERNAL_ERROR");
}
const catalogs = {
  services:
    "SELECT service_id AS id,name,duration_minutes,buffer_before,buffer_after FROM mawid_core.services WHERE workspace_id=$1 AND location_id=$2 AND ($3::uuid IS NULL OR service_id>$3) ORDER BY service_id LIMIT $4",
  professionals:
    "SELECT professional_id AS id,display_name,active FROM mawid_core.professionals WHERE workspace_id=$1 AND location_id=$2 AND ($3::uuid IS NULL OR professional_id>$3) ORDER BY professional_id LIMIT $4",
  openings:
    "SELECT opening_id AS id,weekday,opens,closes FROM mawid_core.opening_intervals WHERE workspace_id=$1 AND location_id=$2 AND ($3::uuid IS NULL OR opening_id>$3) ORDER BY opening_id LIMIT $4",
};
function paginated(rows, limit, idKey) {
  return {
    items: rows.slice(0, limit),
    next_after: rows.length > limit ? rows[limit - 1][idKey] : null,
  };
}

export async function startLocalDataServer(
  service,
  { port = 0, log = (event) => console.error(JSON.stringify(event)), booking, notifications } = {},
) {
  // No public listener or login/actor-selection endpoint. Sessions are issued by the fixture owner.
  await service.verifyPrincipals();
  await booking?.verify();
  await notifications?.verify();
  let origin;
  const server = createServer(
    { maxHeaderSize: 16384, requestTimeout: 15000, headersTimeout: 10000 },
    async (req, res) => {
      const requestId = randomUUID();
      res.setHeader("cache-control", "no-store");
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("x-mawid-mode", "fictional-local");
      res.setHeader("x-request-id", requestId);
      const send = (status, value) => {
        res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(value));
      };
      try {
        if (req.headers.host !== new URL(origin).host) throw new ApiError(421, "INVALID_HOST");
        if (req.headers.origin && req.headers.origin !== origin)
          throw new ApiError(403, "ORIGIN_DENIED");
        const user = await service.authenticate(req.headers.authorization);
        if (!user) throw new ApiError(401, "SESSION_REQUIRED");
        const url = new URL(req.url, origin);
        if (url.origin !== origin) throw new ApiError(400, "INVALID_REQUEST");
        if (url.pathname === "/v1/workspaces" && req.method === "GET") {
          const workspaces = await service.transaction(user, async (client) => {
            const result = await client.query(`
              SELECT o.workspace_id, o.name,
                jsonb_agg(jsonb_build_object('location_id', m.location_id, 'roles', m.roles)
                  ORDER BY m.location_id NULLS FIRST, m.membership_id) AS memberships
              FROM mawid_core.organizations o
              JOIN mawid_core.memberships m USING (workspace_id)
              WHERE m.actor_id = mawid_core.actor() AND m.revoked_at IS NULL
              GROUP BY o.workspace_id, o.name
              ORDER BY o.name, o.workspace_id
            `);
            return result.rows;
          });
          return send(200, { workspaces });
        }
        const match = /^\/v1\/workspaces\/([^/]+)(.*)$/.exec(url.pathname);
        if (!match) throw new ApiError(404, "NOT_FOUND");
        const workspace = validate(uuid, match[1]);
        const tail = match[2];
        const noticeRoute =
          /^\/locations\/([^/]+)\/notifications\/(registrations(?:\/([^/]+))?|inbox(?:\/([^/]+)\/open)?)$/.exec(
            tail,
          );
        if (notifications && noticeRoute) {
          const location = validate(uuid, noticeRoute[1]);
          params(url, z.object({}).strict());
          if (req.method === "POST" && noticeRoute[2] === "registrations") {
            const input = await jsonBody(
              req,
              z
                .object({
                  installation_id: uuid,
                  application_id: z.literal("com.mawid.demo"),
                  environment: z.literal("development"),
                  locale: z.enum(["en", "ar"]),
                  token: z
                    .string()
                    .min(20)
                    .max(4096)
                    .regex(/^[A-Za-z0-9:_\-.]+$/),
                })
                .strict(),
            );
            return send(200, await notifications.register(user, workspace, location, input));
          }
          if (req.method === "DELETE" && noticeRoute[3])
            return send(
              200,
              await notifications.unregister(
                user,
                workspace,
                location,
                validate(uuid, noticeRoute[3]),
              ),
            );
          if (req.method === "GET" && noticeRoute[2] === "inbox")
            return send(200, await notifications.inbox(user, workspace, location));
          if (req.method === "POST" && noticeRoute[4]) {
            await jsonBody(req, z.object({}).strict());
            return send(
              200,
              await notifications.open(user, workspace, location, validate(uuid, noticeRoute[4])),
            );
          }
          throw new ApiError(404, "NOT_FOUND");
        }
        const visitRoute =
          /^\/locations\/([^/]+)\/visit-core\/(view|slots|availability|requests|walk-ins|caller-intake|callers|visits\/([^/]+)(?:\/(confirm|propose|assign|reschedule|accept|decline|withdraw|cancel))?)$/.exec(
            tail,
          );
        if (booking && visitRoute) {
          const location = validate(uuid, visitRoute[1]);
          const identifier = visitRoute[3] ? validate(uuid, visitRoute[3]) : null;
          const part = visitRoute[2];
          const visits = booking.visits;
          const segments = z
            .array(z.object({ service_id: uuid, professional_id: uuid.optional() }).strict())
            .min(1)
            .max(8);
          const start = z.string().max(40);
          if (req.method === "GET" && part === "view") {
            const { after } = params(url, z.object({ after: uuid.optional() }).strict());
            return send(200, await visits.view(user, workspace, location, after));
          }
          if (req.method === "GET" && part === "callers") {
            const { q } = params(url, z.object({ q: z.string().trim().min(2).max(120) }).strict());
            return send(200, await visits.lookupCallers(user, workspace, location, q));
          }
          params(url, z.object({}).strict());
          if (req.method === "GET" && identifier && !visitRoute[4])
            return send(200, await visits.read(user, workspace, location, identifier));
          if (req.method !== "POST") throw new ApiError(404, "NOT_FOUND");
          if (part === "slots" || part === "availability") {
            const input = await jsonBody(
              req,
              z.object(part === "slots" ? { segments } : { segments, start }).strict(),
            );
            return send(
              200,
              await visits.availability(user, workspace, location, input, part === "slots"),
            );
          }
          if (part === "caller-intake") {
            const input = await jsonBody(
              req,
              z
                .object({
                  operation_id: uuid,
                  source: z.enum(["phone", "whatsapp", "walk-in"]),
                  customer_id: uuid.optional(),
                  caller: z
                    .object({
                      name: z.string().trim().min(1).max(120),
                      phone: z.string().trim().min(4).max(30).optional(),
                    })
                    .strict()
                    .optional(),
                  segments,
                  start,
                  assignments: z.array(uuid.nullable()).min(1).max(8).optional(),
                })
                .strict()
                .refine((fields) => Boolean(fields.customer_id) !== Boolean(fields.caller)),
            );
            return send(201, await visits.mutate(user, workspace, location, "walk-in", input));
          }
          const action =
            part === "requests" ? "request" : part === "walk-ins" ? "walk-in" : visitRoute[4];
          if (!action) throw new ApiError(404, "NOT_FOUND");
          const fields = { operation_id: uuid };
          if (identifier) fields.expected_version = z.string().regex(/^[1-9][0-9]{0,14}$/);
          if (["request", "walk-in"].includes(action))
            Object.assign(fields, { customer_id: uuid, segments, start });
          if (["propose", "reschedule"].includes(action)) fields.start = start;
          if (["walk-in", "confirm", "assign", "propose", "reschedule"].includes(action))
            fields.assignments = z.array(uuid.nullable()).min(1).max(8).optional();
          const input = await jsonBody(req, z.object(fields).strict());
          const result = await visits.mutate(user, workspace, location, action, input, identifier);
          if (result.error) throw new ApiError(result.status, result.error.code);
          return send(identifier ? 200 : 201, result);
        }
        const bookingRoute =
          /^\/locations\/([^/]+)\/booking-core\/(view|slots|availability|requests|walk-ins|bookings\/([^/]+)(?:\/(confirm|propose|assign|accept|decline|withdraw|cancel))?)$/.exec(
            tail,
          );
        if (booking && bookingRoute) {
          const location = validate(uuid, bookingRoute[1]);
          const identifier = bookingRoute[3] ? validate(uuid, bookingRoute[3]) : null;
          const part = bookingRoute[2];
          if (req.method === "GET" && part === "view") {
            const { after } = params(url, z.object({ after: uuid.optional() }).strict());
            return send(200, await booking.view(user, workspace, location, after));
          }
          if (req.method === "GET" && part === "slots") {
            const input = params(
              url,
              z.object({ service_id: uuid, professional_id: uuid.optional() }).strict(),
            );
            return send(200, await booking.slots(user, workspace, location, input));
          }
          if (req.method === "GET" && part === "availability") {
            const input = params(
              url,
              z
                .object({
                  service_id: uuid,
                  professional_id: uuid.optional(),
                  start: z.string().max(40),
                })
                .strict(),
            );
            return send(200, await booking.availability(user, workspace, location, input));
          }
          if (req.method === "GET" && identifier && !bookingRoute[4]) {
            params(url, z.object({}).strict());
            return send(200, await booking.read(user, workspace, location, identifier));
          }
          if (req.method === "POST") {
            params(url, z.object({}).strict());
            const action =
              part === "requests" ? "request" : part === "walk-ins" ? "walk-in" : bookingRoute[4];
            if (!action) throw new ApiError(404, "NOT_FOUND");
            const fields = { operation_id: uuid };
            if (identifier) fields.expected_version = z.string().regex(/^[1-9][0-9]{0,14}$/);
            if (["request", "walk-in"].includes(action))
              Object.assign(fields, {
                customer_id: uuid,
                service_id: uuid,
                professional_id: uuid.optional(),
                start: z.string().max(40),
              });
            if (action === "propose")
              Object.assign(fields, { professional_id: uuid, start: z.string().max(40) });
            if (action === "assign") fields.professional_id = uuid;
            const input = await jsonBody(req, z.object(fields).strict());
            const result = await booking.mutate(
              user,
              workspace,
              location,
              action,
              input,
              identifier,
            );
            if (result.error) throw new ApiError(result.status, result.error.code);
            return send(result.status ?? (identifier ? 200 : 201), result);
          }
          throw new ApiError(404, "NOT_FOUND");
        }
        const locationRoute =
          /^\/locations\/([^/]+)\/(services|professionals|openings|bookings|imports\/preview)$/.exec(
            tail,
          );
        const jobRoute = /^\/(imports|exports)\/([^/]+)(\/confirm|\/download)?$/.exec(tail);
        const method = req.method;
        if (method === "GET" && tail === "/profiles") {
          const { after, limit } = params(url, page);
          const rows = await service.transaction(user, async (client) => {
            await service.assertProfileRead(client, workspace);
            return (
              await client.query(
                "SELECT customer_id,display_name,contact FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND ($2::uuid IS NULL OR customer_id>$2) ORDER BY customer_id LIMIT $3",
                [workspace, after ?? null, limit + 1],
              )
            ).rows;
          });
          return send(200, paginated(rows, limit, "customer_id"));
        }
        if (method === "GET" && locationRoute && locationRoute[2] !== "imports/preview") {
          const location = validate(uuid, locationRoute[1]);
          const kind = locationRoute[2];
          const { after, limit } = params(url, page);
          const rows = await service.transaction(user, async (client) => {
            await service.assertWorkspace(client, workspace);
            if (kind === "bookings") await service.assertBookingRead(client, workspace, location);
            else await service.assertLocation(client, workspace, location);
            const text =
              kind === "bookings"
                ? "SELECT booking_id,customer_id,location_id,service_id,requested_start,requested_end,assigned_start,assigned_end,state,version,cancelled_at FROM mawid_core.bookings WHERE workspace_id=$1 AND location_id=$2 AND segment_count=1 AND ($3::uuid IS NULL OR booking_id>$3) ORDER BY booking_id LIMIT $4"
                : catalogs[kind];
            return (await client.query(text, [workspace, location, after ?? null, limit + 1])).rows;
          });
          return send(200, paginated(rows, limit, kind === "bookings" ? "booking_id" : "id"));
        }
        if (method === "POST" && locationRoute?.[2] === "imports/preview") {
          const location = validate(uuid, locationRoute[1]);
          const { kind } = params(
            url,
            z
              .object({ kind: z.enum(["customers", "professionals", "services", "openings"]) })
              .strict(),
          );
          // Authorize before accepting potentially sensitive staged input.
          await service.transaction(user, async (client) => {
            await service.assertWorkspace(client, workspace);
            await service.assertLocation(client, workspace, location);
            const {
              rows: [row],
            } = await client.query(
              "SELECT mawid_core.has_role($1,$2,ARRAY['manager']) AS allowed",
              [workspace, kind === "customers" ? null : location],
            );
            if (!row.allowed) throw new ApiError(404, "NOT_FOUND");
          });
          const preview = parseImport(await body(req, "text/csv"), kind);
          const result = await service.transaction(user, async (client) => {
            const {
              rows: [row],
            } = await client.query(
              "SELECT mawid_core.preview_import($1,$2,$3,$4,$5::jsonb) AS job_id",
              [workspace, location, kind, preview.fileSha256, JSON.stringify(preview.rows)],
            );
            return row;
          });
          return send(201, {
            ...result,
            row_count: preview.rows.length,
            file_sha256: preview.fileSha256,
          });
        }
        if (method === "POST" && jobRoute?.[1] === "imports" && jobRoute[3] === "/confirm") {
          params(url, z.object({}).strict());
          const job = validate(uuid, jobRoute[2]);
          const input = await jsonBody(
            req,
            z
              .object({
                file_sha256: z.string().regex(/^[a-f0-9]{64}$/),
                confirmed: z.literal(true),
              })
              .strict(),
          );
          const result = await service.transaction(
            user,
            async (client) =>
              (
                await client.query("SELECT mawid_core.confirm_import($1,$2,$3,$4) AS row_count", [
                  workspace,
                  job,
                  input.file_sha256,
                  input.confirmed,
                ])
              ).rows[0],
          );
          return send(200, result);
        }
        if (method === "GET" && jobRoute && !jobRoute[3]) {
          params(url, z.object({}).strict());
          const job = validate(uuid, jobRoute[2]);
          const text =
            jobRoute[1] === "imports"
              ? "SELECT job_id,location_id,kind,file_hash AS file_sha256,row_count,status,expires_at FROM mawid_core.import_jobs WHERE workspace_id=$1 AND job_id=$2"
              : "SELECT job_id,location_id,customer_id,expires_at,CASE WHEN expires_at<=clock_timestamp() THEN 'expired' ELSE 'ready' END AS status FROM mawid_core.export_jobs WHERE workspace_id=$1 AND job_id=$2";
          const result = await service.transaction(
            user,
            async (client) => (await client.query(text, [workspace, job])).rows[0],
          );
          if (!result) throw new ApiError(404, "NOT_FOUND");
          return send(200, result);
        }
        if (method === "POST" && tail === "/exports") {
          params(url, z.object({}).strict());
          const input = await jsonBody(
            req,
            z
              .object({
                location_id: uuid.nullable().default(null),
                customer_id: uuid.nullable().default(null),
              })
              .strict(),
          );
          const result = await service.transaction(user, async (client) => {
            await service.assertWorkspace(client, workspace);
            const {
              rows: [row],
            } = await client.query("SELECT mawid_core.request_export($1,$2,$3) AS job_id", [
              workspace,
              input.location_id,
              input.customer_id,
            ]);
            return row;
          });
          return send(201, result);
        }
        if (method === "GET" && jobRoute?.[1] === "exports" && jobRoute[3] === "/download") {
          const job = validate(uuid, jobRoute[2]);
          const { format, contract } = params(
            url,
            z
              .object({
                format: z.enum(["json", "csv"]).default("json"),
                contract: z.enum(["1", "2"]).default("1"),
              })
              .strict(),
          );
          const result = await service.transaction(
            user,
            async (client) =>
              (
                await client.query("SELECT mawid_core.download_visit_export($1,$2,$3) AS payload", [
                  workspace,
                  job,
                  Number(contract),
                ])
              ).rows[0].payload,
          );
          if (format === "json") return send(200, result);
          const columns = [
            "record_type",
            "customer_id",
            "booking_id",
            "location_id",
            "display_name",
            "contact",
            "state",
            "requested_start",
            "assigned_start",
            "cancelled_at",
          ];
          const rows = [
            ...result.profiles.map((row) => ({ record_type: "profile", ...row })),
            ...result.bookings.map((row) => ({ record_type: "booking", ...row })),
          ];
          if (contract === "2") {
            columns.push(
              "position",
              "service_id",
              "requested_professional_id",
              "assigned_professional_id",
              "requested_end",
              "assigned_end",
              "buffer_before_seconds",
              "buffer_after_seconds",
            );
            for (const booking of result.bookings) {
              rows.push(
                ...booking.segments.map((segment) => ({
                  record_type: "visit_segment",
                  booking_id: booking.booking_id,
                  customer_id: booking.customer_id,
                  location_id: booking.location_id,
                  ...segment,
                })),
              );
            }
          }
          res.writeHead(200, {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": 'attachment; filename="mawid-export.csv"',
          });
          return res.end(exportCsv(columns, rows));
        }
        throw new ApiError(404, "NOT_FOUND");
      } catch (error) {
        const safe = safeError(error);
        if (safe.status === 413 || !req.complete) res.setHeader("connection", "close");
        if (safe.status === 503) res.setHeader("retry-after", "1");
        if (safe.status >= 500)
          log({ request_id: requestId, code: safe.apiCode, status: safe.status });
        if (!res.headersSent)
          send(safe.status, {
            error: { code: safe.apiCode, message: safe.apiCode, request_id: requestId },
          });
        else res.end();
      }
    },
  );
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  origin = "http://127.0.0.1:" + server.address().port;
  return {
    origin,
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      });
    },
  };
}
