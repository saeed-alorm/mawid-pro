import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DAY = 86400000;
const HALF_HOUR = 1800000;
const TIME_BUDGET_MS = 4000;
const MAX_FUTURE = 180 * DAY;
const CURSOR_LIFETIME = 15 * 60000;
const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Beirut",
  dateStyle: "short",
});
const localDate = (time) => dateFormatter.format(new Date(time));
const shiftDate = (date, days) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * DAY).toISOString().slice(0, 10);

export class VisitSearchLimit extends Error {
  constructor(scope) {
    super("AVAILABILITY_SEARCH_INCOMPLETE");
    this.scope = scope;
  }
}

export function searchBudget(
  scope = "candidate",
  { steps = 4096, queries = 128, deadline = performance.now() + TIME_BUDGET_MS, parent } = {},
) {
  const remaining = { step: steps, query: queries };
  return (kind) => {
    if (performance.now() >= deadline) throw new VisitSearchLimit("request");
    if (remaining[kind] <= 0) throw new VisitSearchLimit(scope);
    parent?.(kind);
    remaining[kind]--;
  };
}

export class VisitSlotSearch {
  #key = randomBytes(32);

  constructor(core, fail) {
    this.core = core;
    this.fail = fail;
  }

  #sign(payload, scope) {
    return createHmac("sha256", this.#key)
      .update(JSON.stringify([payload, scope]))
      .digest();
  }

  #encode(page, scope) {
    const payload = Buffer.from(JSON.stringify(page)).toString("base64url");
    return payload + "." + this.#sign(payload, scope).toString("base64url");
  }

  #decode(cursor, scope, now) {
    const [payload, signature] = cursor.split(".");
    const supplied = Buffer.from(signature ?? "", "base64url");
    const expected = this.#sign(payload, scope);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      this.fail(422, "INVALID_SEARCH_CONTINUATION");
    const page = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (page.expires <= now) this.fail(422, "INVALID_SEARCH_CONTINUATION");
    return page;
  }

  async slots(x, search, request, savedStart, findSlot) {
    const scope = [x.w, x.l, x.actor, request];
    const today = localDate(x.now);
    const horizon = x.now + MAX_FUTURE;
    const maxDate = localDate(horizon);
    const dates = [];
    let page = null;
    let exhausted = false;
    let stop = x.now + 7 * DAY;
    if (search) {
      if (search.cursor) {
        page = this.#decode(search.cursor, scope, x.now);
      } else {
        const date = search.date ?? today;
        if (
          date < today ||
          date > maxDate ||
          !Number.isFinite(Date.parse(date + "T00:00:00Z")) ||
          shiftDate(date, 0) !== date
        )
          this.fail(422, "INVALID_SEARCH_DATE");
        page = {
          date,
          last: [shiftDate(date, 6), maxDate].sort()[0],
          expires: x.now + CURSOR_LIFETIME,
          exhausted: false,
        };
      }
      dates.push(page.date);
      stop = horizon + 1;
      exhausted = page.exhausted;
    } else {
      for (let date = today; date <= localDate(stop); date = shiftDate(date, 1)) dates.push(date);
      if (savedStart > x.now && savedStart <= horizon && !dates.includes(localDate(savedStart)))
        dates.push(localDate(savedStart));
    }
    const { rows: days } = await x.c.query(
      `SELECT (day::timestamp AT TIME ZONE 'Asia/Beirut') AS start,
              ((day+1)::timestamp AT TIME ZONE 'Asia/Beirut') AS finish
       FROM unnest($1::date[]) AS days(day) ORDER BY day`,
      [dates],
    );
    const initial = +days[0].start - DAY;
    // Eight segments can each span a full day plus two full days of buffers.
    const periods = await this.core.periods(
      x,
      initial,
      Math.ceil((+days.at(-1).finish - initial) / DAY) + 25,
    );
    const deadline = performance.now() + TIME_BUDGET_MS;
    const windows = days.map(({ start, finish }) => {
      const starts = new Set();
      const upper = Math.min(+finish, stop);
      if (upper > x.now) {
        for (const [from, to] of periods) {
          if (from >= upper) break;
          for (
            let time = Math.ceil(Math.max(+start, from, x.now + 1) / HALF_HOUR) * HALF_HOUR;
            time < Math.min(to, upper);
            time += HALF_HOUR
          )
            starts.add(time);
        }
      }
      if (
        savedStart > x.now &&
        savedStart <= horizon &&
        savedStart >= +start &&
        savedStart < +finish
      )
        starts.add(savedStart);
      return {
        starts: [...starts].sort((a, b) => a - b),
        budget: searchBudget("day", { steps: 4096, queries: 224, deadline }),
        capped: false,
      };
    });

    const items = [];
    const rounds = Math.max(...windows.map((window) => window.starts.length));
    scan: for (let index = 0; index < rounds; index++) {
      for (const window of windows) {
        const time = window.starts[index];
        if (window.capped || time == null) continue;
        const budget = searchBudget("candidate", {
          steps: 192,
          queries: 32,
          deadline,
          parent: window.budget,
        });
        try {
          const item = await findSlot(time, periods, budget);
          if (item) items.push(item);
        } catch (error) {
          if (!(error instanceof VisitSearchLimit)) throw error;
          exhausted = true;
          if (error.scope === "request") break scan;
          if (error.scope === "day") window.capped = true;
        }
      }
    }
    items.sort((a, b) => a.start.localeCompare(b.start));
    const continuation =
      page && page.date < page.last
        ? this.#encode({ ...page, date: shiftDate(page.date, 1), exhausted }, scope)
        : null;
    if (!page && exhausted && !items.length) this.fail(409, "AVAILABILITY_SEARCH_INCOMPLETE");
    return {
      contract_version: 2,
      items,
      timezone: "Asia/Beirut",
      ...(page || exhausted
        ? {
            search: {
              status: exhausted || continuation ? "incomplete" : "complete",
              continuation,
              exhausted,
            },
          }
        : {}),
    };
  }
}
