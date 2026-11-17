const zone = "Asia/Beirut";
export const holdExpiry = (now, start) => Math.min(now + 3600000, start);
export const canSelfCancel = (now, start) => now < start;
export const isLateCancellation = (now, start) =>
  canSelfCancel(now, start) && start - now < 3600000;
const formatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
export function instant(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    throw new Error("INVALID_TIME");
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("INVALID_TIME");
  if (!value.endsWith("Z")) {
    const wall = formatter.format(new Date(milliseconds)).replace(" ", "T");
    if (wall !== value.slice(0, 19)) throw new Error("INVALID_TIME");
  } else if (new Date(milliseconds).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    throw new Error("INVALID_TIME");
  }
  return milliseconds;
}
export function responseDeadline(periods, now, minutes = 15) {
  let remaining = minutes * 60000;
  for (const [start, end] of periods) {
    const from = Math.max(start, now);
    if (end <= from) continue;
    if (end - from >= remaining) return from + remaining;
    remaining -= end - from;
  }
  throw new Error("SCHEDULE_UNAVAILABLE");
}
export const nextReview = (periods, now) => {
  for (const [start, end] of periods) if (end > now) return Math.max(start, now);
  throw new Error("SCHEDULE_UNAVAILABLE");
};
