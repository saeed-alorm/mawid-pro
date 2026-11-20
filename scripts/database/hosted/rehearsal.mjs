const uuidPattern = "[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}";
const uuid = new RegExp("^" + uuidPattern + "$");
const visit = new RegExp("^/visits/" + uuidPattern + "(?:/(confirm|cancel))?$");
const maximumWindowMs = 60 * 60 * 1000;

function utcTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value.replace("Z", ".000Z")
    ? time
    : NaN;
}

export function bookingRehearsal(value, { probeMode, notificationMode, transport, subjects }) {
  if (value === undefined) return undefined;
  const invalid = () => new Error("INVALID_BOOKING_REHEARSAL");
  if (
    typeof value !== "string" ||
    probeMode !== "true" ||
    notificationMode !== "disabled" ||
    transport !== "hyperdrive" ||
    subjects.length !== 3 ||
    new Set(subjects).size !== 3 ||
    !subjects.every((subject) => uuid.test(subject))
  )
    throw invalid();
  let fields;
  try {
    fields = JSON.parse(value);
  } catch {
    throw invalid();
  }
  if (!fields || typeof fields !== "object" || Object.keys(fields).length !== 4) throw invalid();
  const { workspaceId, locationId, startsAt, expiresAt } = fields;
  const start = utcTime(startsAt);
  const end = utcTime(expiresAt);
  if (
    typeof workspaceId !== "string" ||
    typeof locationId !== "string" ||
    !uuid.test(workspaceId) ||
    !uuid.test(locationId) ||
    !(end > start && end - start <= maximumWindowMs)
  )
    throw invalid();
  return {
    base: "/v1/workspaces/" + workspaceId + "/locations/" + locationId + "/visit-core",
    start,
    end,
  };
}

export function allowsHostedRoute(config, method, url, now = Date.now()) {
  if (!config.probeOnly) return true;
  if (method === "GET" && ["/v1/session", "/v1/workspaces"].includes(url.pathname)) return true;
  const rehearsal = config.rehearsal;
  if (
    !rehearsal ||
    !(now >= rehearsal.start && now < rehearsal.end) ||
    url.href.includes("?") ||
    url.href.includes("#") ||
    !url.pathname.startsWith(rehearsal.base + "/")
  )
    return false;
  const tail = url.pathname.slice(rehearsal.base.length);
  if (tail === "/requests") return method === "POST";
  const target = visit.exec(tail);
  return target !== null && method === (target[1] ? "POST" : "GET");
}
