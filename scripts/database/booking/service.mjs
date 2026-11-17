import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import {
  instant,
  responseDeadline,
  nextReview,
  holdExpiry,
  canSelfCancel,
  isLateCancellation,
} from "./time.mjs";

export class BookingError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.apiCode = code;
  }
}
const fail = (status, code) => {
  throw new BookingError(status, code);
};
const iso = (n) => new Date(n).toISOString();
const canonical = (value) => JSON.stringify(value, Object.keys(value).sort());

// This pool is a trusted server worker, not an actor credential or a public SQL API.
export class LocalBookingService {
  constructor(data, config) {
    if (
      config?.host !== "127.0.0.1" ||
      config.user !== "mawid_fixture_booking" ||
      !/^mawid_local_data_[a-f0-9]+$/.test(config.database)
    )
      throw new Error("INVALID_BOOKING_CONFIG");
    this.data = data;
    this.pool = new Pool({
      ...config,
      max: 4,
      statement_timeout: 8000,
      lock_timeout: 3000,
      options: "-c search_path=pg_catalog",
    });
    this.pool.on("error", () => {});
  }
  async verify() {
    const {
      rows: [r],
    } = await this.pool.query(
      "SELECT rolname,rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole AS privileged,pg_has_role(current_user,'mawid_local_booking','MEMBER') AS worker,pg_has_role(current_user,'mawid_local_actor','MEMBER') AS actor FROM pg_roles WHERE rolname=session_user",
    );
    if (!r || r.privileged || !r.worker || r.actor) throw new Error("UNSAFE_BOOKING_WORKER");
  }
  async close() {
    await this.pool.end();
  }
  async run(user, w, l, fn) {
    const actor = await this.data.transaction(
      user,
      async (c) => (await c.query("SELECT mawid_core.actor() AS actor")).rows[0].actor,
    );
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      // A coarse workspace lock is intentional for this bounded local pilot core.
      // It also covers the same professional shared between locations.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,7))", [w]);
      await this.data.assertSession?.(user);
      const members = (
        await c.query(
          "SELECT roles FROM mawid_core.memberships WHERE workspace_id=$1 AND actor_id=$2 AND revoked_at IS NULL AND (location_id IS NULL OR location_id=$3) FOR SHARE",
          [w, actor, l],
        )
      ).rows;
      const customers = (
        await c.query(
          "SELECT customer_id FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND actor_id=$2 AND anonymized_at IS NULL FOR SHARE",
          [w, actor],
        )
      ).rows;
      if (!members.length && !customers.length) fail(404, "NOT_FOUND");
      const location = (
        await c.query(
          "SELECT timezone FROM mawid_core.locations WHERE workspace_id=$1 AND location_id=$2",
          [w, l],
        )
      ).rows[0];
      if (!location) fail(404, "NOT_FOUND");
      if (location.timezone !== "Asia/Beirut") fail(422, "UNSUPPORTED_TIMEZONE");
      await c.query(
        "SELECT workspace_id FROM mawid_core.organizations WHERE workspace_id=$1 FOR SHARE",
        [w],
      );
      const now = +(await c.query("SELECT clock_timestamp() AS now")).rows[0].now;
      const ctx = {
        c,
        w,
        l,
        actor,
        now,
        roles: members.flatMap((x) => x.roles),
        customers: customers.map((x) => x.customer_id),
        professionals: members.some((m) => m.roles.includes("professional"))
          ? (
              await c.query(
                "SELECT professional_id FROM mawid_core.professional_bindings WHERE workspace_id=$1 AND location_id=$2 AND actor_id=$3 AND revoked_at IS NULL FOR SHARE",
                [w, l, actor],
              )
            ).rows.map((r) => r.professional_id)
          : [],
      };
      const result = await fn(ctx);
      await this.data.assertSession?.(user);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "23P01") fail(409, "SLOT_UNAVAILABLE");
      if (["55P03", "57014", "40P01", "40001"].includes(e.code)) fail(503, "RETRY_SAME_KEY");
      throw e;
    } finally {
      c.release();
    }
  }
  async periods({ c, w, l }, at) {
    const { rows } = await c.query(
      `WITH days AS (
      SELECT d::date AS day FROM generate_series(($3::timestamptz AT TIME ZONE 'Asia/Beirut')::date,
      ($3::timestamptz AT TIME ZONE 'Asia/Beirut')::date+370,interval '1 day') d
    ), hours AS (
      SELECT day,o.opens,o.closes FROM days JOIN mawid_core.opening_intervals o ON o.workspace_id=$1 AND o.location_id=$2 AND o.weekday=extract(dow FROM day)
      WHERE NOT EXISTS(SELECT 1 FROM mawid_core.schedule_exceptions x WHERE x.workspace_id=$1 AND x.location_id=$2 AND x.local_date=day)
      UNION ALL SELECT day,x.opens,x.closes FROM days JOIN mawid_core.schedule_exceptions x ON x.workspace_id=$1 AND x.location_id=$2 AND x.local_date=day WHERE x.opens IS NOT NULL
    ) SELECT (day+opens) AT TIME ZONE 'Asia/Beirut' AS start,(day+closes) AT TIME ZONE 'Asia/Beirut' AS finish FROM hours ORDER BY start`,
      [w, l, iso(at)],
    );
    // Merge overlapping configured windows so response minutes are never counted twice.
    const merged = [];
    for (const row of rows) {
      const a = +row.start,
        b = +row.finish,
        last = merged.at(-1);
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    return merged;
  }
  async event(x, b, action, deliver = x.now) {
    const event = randomUUID();
    await x.c.query(
      "INSERT INTO mawid_core.booking_events(workspace_id,location_id,event_id,booking_id,version,actor_id,action,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
      [x.w, b.location_id, event, b.booking_id, b.version, x.actor, action, iso(x.now)],
    );
    await x.c.query(
      "INSERT INTO mawid_core.outbox(workspace_id,event_id,deliver_after) VALUES($1,$2,$3)",
      [x.w, event, iso(deliver)],
    );
  }
  async expire(x) {
    const rows = (
      await x.c.query(
        "SELECT * FROM mawid_core.bookings WHERE workspace_id=$1 AND state='proposed' AND offer_expires_at<=$2 ORDER BY location_id,booking_id FOR UPDATE",
        [x.w, iso(x.now)],
      )
    ).rows;
    for (const b of rows) {
      await x.c.query(
        "DELETE FROM mawid_core.allocations WHERE workspace_id=$1 AND location_id=$2 AND booking_id=$3",
        [x.w, b.location_id, b.booking_id],
      );
      b.version = String(BigInt(b.version) + 1n);
      await x.c.query(
        "UPDATE mawid_core.bookings SET state='expired',version=$4 WHERE workspace_id=$1 AND location_id=$2 AND booking_id=$3",
        [x.w, b.location_id, b.booking_id, b.version],
      );
      await this.event(x, b, "expired");
    }
  }
  async slot(x, service, professional, start, ignore = null) {
    if (start <= x.now || start > x.now + 180 * 86400000) fail(422, "FUTURE_TIME_REQUIRED");
    const s = (
      await x.c.query(
        "SELECT * FROM mawid_core.services WHERE workspace_id=$1 AND location_id=$2 AND service_id=$3",
        [x.w, x.l, service],
      )
    ).rows[0];
    if (!s) fail(404, "NOT_FOUND");
    const end = start + s.duration_minutes * 60000,
      from = start - s.buffer_before * 60000,
      to = end + s.buffer_after * 60000;
    const periods = await this.periods(x, from);
    if (!periods.some(([a, b]) => a <= from && b >= to)) fail(409, "SLOT_UNAVAILABLE");
    const candidates = (
      await x.c.query(
        `SELECT p.professional_id FROM mawid_core.professionals p JOIN mawid_core.eligibility e USING(workspace_id,location_id,professional_id)
      WHERE p.workspace_id=$1 AND p.location_id=$2 AND e.service_id=$3 AND p.active AND ($4::uuid IS NULL OR p.professional_id=$4)
      AND EXISTS(SELECT 1 FROM mawid_core.professional_intervals i WHERE i.workspace_id=p.workspace_id AND i.location_id=p.location_id AND i.professional_id=p.professional_id AND i.kind='availability' AND i.period @> tstzrange($5,$6,'[)'))
      AND NOT EXISTS(SELECT 1 FROM mawid_core.professional_intervals i WHERE i.workspace_id=p.workspace_id AND i.professional_id=p.professional_id AND i.kind IN ('break','absence') AND i.period && tstzrange($5,$6,'[)'))
      AND NOT EXISTS(SELECT 1 FROM mawid_core.allocations a WHERE a.workspace_id=p.workspace_id AND a.professional_id=p.professional_id AND ($7::uuid IS NULL OR a.booking_id<>$7) AND a.period && tstzrange($5,$6,'[)') AND (a.kind='confirmed' OR a.expires_at>$8))
      ORDER BY p.professional_id`,
        [x.w, x.l, service, professional, iso(from), iso(to), ignore, iso(x.now)],
      )
    ).rows;
    if (!candidates.length) fail(409, "SLOT_UNAVAILABLE");
    return { end, from, to, professionals: candidates.map((r) => r.professional_id) };
  }
  project(x, b) {
    const local = (value) => {
      if (!value) return null;
      const p = Object.fromEntries(
        new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Beirut",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hourCycle: "h23",
          timeZoneName: "longOffset",
        })
          .formatToParts(new Date(value))
          .map((part) => [part.type, part.value]),
      );
      return {
        date: `${p.year}-${p.month}-${p.day}`,
        time: `${p.hour}:${p.minute}`,
        offset: p.timeZoneName,
      };
    };
    const result = {
      booking_id: b.booking_id,
      location_id: b.location_id,
      customer_id: b.customer_id,
      service_id: b.service_id,
      state: b.state,
      version: String(b.version),
      requested_start: b.requested_start,
      requested_professional_id: b.requested_professional_id,
      requested_end: b.requested_end,
      assigned_start: b.assigned_start,
      assigned_end: b.assigned_end,
      assigned_professional_id: b.assigned_professional_id,
      offer_expires_at: b.offer_expires_at,
      submitted_at: b.submitted_at,
      requested_local: local(b.requested_start),
      assigned_local: local(b.assigned_start),
      can_cancel:
        b.state === "confirmed" &&
        (x.customers.includes(b.customer_id)
          ? canSelfCancel(x.now, +new Date(b.assigned_start))
          : x.roles.includes("admin")),
      cancellation_is_late:
        b.state === "confirmed" && isLateCancellation(x.now, +new Date(b.assigned_start)),
      server_time: iso(x.now),
      timezone: "Asia/Beirut",
    };
    if (x.roles.some((r) => ["admin", "manager"].includes(r))) {
      result.response_due_at = b.response_due_at;
      result.overdue =
        b.state === "pending" && b.response_due_at != null && +new Date(b.response_due_at) <= x.now;
    }
    return result;
  }
  canRead(x, b) {
    return (
      x.roles.some((r) => ["admin", "manager"].includes(r)) ||
      x.customers.includes(b.customer_id) ||
      x.professionals.includes(b.assigned_professional_id ?? b.requested_professional_id)
    );
  }
  async availability(user, w, l, input) {
    return this.run(user, w, l, async (x) => {
      const slot = await this.slot(
        x,
        input.service_id,
        input.professional_id ?? null,
        instant(input.start),
      );
      return {
        available: true,
        professional_ids: slot.professionals,
        ends_at: iso(slot.end),
        server_time: iso(x.now),
        timezone: "Asia/Beirut",
        confirmed: false,
      };
    });
  }
  // UI reads use the same locked, reauthorized context as mutations. No client
  // role, package, local catalog or notification payload grants access.
  async view(user, w, l, after = null) {
    return this.run(user, w, l, async (x) => {
      await this.expire(x);
      const query = async (sql, values = [w, l]) => (await x.c.query(sql, values)).rows;
      const staff = x.roles.some((r) => ["admin", "manager"].includes(r));
      const profileStaff = x.roles.some((r) => ["manager", "admin"].includes(r));
      const rows = await query(
        "SELECT * FROM mawid_core.bookings WHERE workspace_id=$1 AND location_id=$2 AND ($3::uuid IS NULL OR booking_id>$3) AND ($4::boolean OR customer_id=ANY($5::uuid[]) OR coalesce(assigned_professional_id,requested_professional_id)=ANY($6::uuid[])) ORDER BY booking_id LIMIT 51",
        [w, l, after, staff, x.customers, x.professionals],
      );
      return {
        actor_id: x.actor,
        roles: x.roles,
        customer_ids: x.customers,
        services: await query(
          "SELECT service_id,name,duration_minutes FROM mawid_core.services WHERE workspace_id=$1 AND location_id=$2 ORDER BY service_id LIMIT 200",
        ),
        professionals: await query(
          "SELECT p.professional_id,p.display_name,p.active,ARRAY(SELECT e.service_id FROM mawid_core.eligibility e WHERE e.workspace_id=p.workspace_id AND e.location_id=p.location_id AND e.professional_id=p.professional_id) AS service_ids FROM mawid_core.professionals p WHERE workspace_id=$1 AND location_id=$2 ORDER BY professional_id LIMIT 200",
        ),
        customers: await query(
          "SELECT customer_id,display_name FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND anonymized_at IS NULL AND ($2::boolean OR customer_id=ANY($3::uuid[])) ORDER BY customer_id LIMIT 200",
          [w, profileStaff, x.customers],
        ),
        bookings: rows.slice(0, 50).map((b) => this.project(x, b)),
        next_after: rows.length > 50 ? rows[49].booking_id : null,
        server_time: iso(x.now),
        beirut_date: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Beirut" }).format(x.now),
        review_at: iso(nextReview(await this.periods(x, x.now), x.now)),
        timezone: "Asia/Beirut",
      };
    });
  }
  async slots(user, w, l, input) {
    return this.run(user, w, l, async (x) => {
      const items = [];
      // Bounded seven-day picker; every candidate uses the existing slot core.
      const stop = x.now + 7 * 86400000;
      const periods = await this.periods(x, x.now);
      const wall = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Beirut",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZoneName: "longOffset",
      });
      for (const [a, b] of periods) {
        if (a > stop) break;
        for (
          let t = Math.ceil(Math.max(a, x.now + 1) / 1800000) * 1800000;
          t < Math.min(b, stop);
          t += 1800000
        ) {
          try {
            await this.slot(x, input.service_id, input.professional_id ?? null, t);
            const parts = Object.fromEntries(wall.formatToParts(t).map((p) => [p.type, p.value]));
            items.push({
              start: iso(t).replace(".000Z", "Z"),
              date: `${parts.year}-${parts.month}-${parts.day}`,
              time: `${parts.hour}:${parts.minute}`,
              offset: parts.timeZoneName,
            });
          } catch (e) {
            if (e.apiCode !== "SLOT_UNAVAILABLE") throw e;
          }
        }
      }
      return { items, server_time: iso(x.now), timezone: "Asia/Beirut", confirmed: false };
    });
  }
  async read(user, w, l, id) {
    return this.run(user, w, l, async (x) => {
      await this.expire(x);
      const b = (
        await x.c.query(
          "SELECT * FROM mawid_core.bookings WHERE workspace_id=$1 AND location_id=$2 AND booking_id=$3",
          [w, l, id],
        )
      ).rows[0];
      if (!b || !this.canRead(x, b)) fail(404, "NOT_FOUND");
      return this.project(x, b);
    });
  }
  async mutate(user, w, l, action, input, id = null) {
    return this.run(user, w, l, async (x) => {
      const { c, actor } = x;
      let b = id
        ? (
            await c.query(
              "SELECT * FROM mawid_core.bookings WHERE workspace_id=$1 AND location_id=$2 AND booking_id=$3 FOR UPDATE",
              [w, l, id],
            )
          ).rows[0]
        : null;
      if (id && (!b || !this.canRead(x, b))) fail(404, "NOT_FOUND");
      const own = x.customers.includes(b?.customer_id ?? input.customer_id);
      if (["request", "accept", "withdraw"].includes(action) && !own) fail(403, "ACTION_DENIED");
      if (
        ["confirm", "propose", "decline", "walk-in"].includes(action) &&
        !x.roles.includes("admin")
      )
        fail(403, "ACTION_DENIED");
      if (action === "assign" && !x.roles.includes("manager")) fail(403, "ACTION_DENIED");
      if (action === "cancel" && !own && !x.roles.includes("admin")) fail(403, "ACTION_DENIED");
      const hash = createHash("sha256")
        .update(canonical({ ...input, booking_id: id, action, location_id: l }))
        .digest("hex");
      const old = (
        await c.query(
          "SELECT * FROM mawid_core.operation_references WHERE workspace_id=$1 AND actor_id=$2 AND operation_id=$3",
          [w, actor, input.operation_id],
        )
      ).rows[0];
      if (old) {
        if (old.input_hash !== hash) fail(409, "IDEMPOTENCY_CONFLICT");
        const replay = (
          await c.query(
            "SELECT outcome FROM mawid_core.idempotency_records WHERE workspace_id=$1 AND actor_id=$2 AND operation_id=$3 AND created_at>clock_timestamp()-interval '7 days'",
            [w, actor, input.operation_id],
          )
        ).rows[0];
        if (!replay) fail(409, "OPERATION_RETIRED");
        // Reauthorization precedes replay; project again to avoid leaking staff-only metadata.
        const outcome = { ...replay.outcome };
        if (!x.roles.some((r) => ["admin", "manager", "professional"].includes(r))) {
          delete outcome.response_due_at;
          delete outcome.overdue;
        }
        return outcome;
      }
      await this.expire(x);
      if (
        (b?.state === "proposed" && +b.offer_expires_at <= x.now) ||
        (b?.state === "expired" && action === "accept")
      ) {
        // Commit expiry even when acceptance is too late.
        return { error: { code: "OFFER_EXPIRED" }, status: 409 };
      }
      if (b && String(b.version) !== String(input.expected_version)) fail(409, "STALE_VERSION");
      let deliver = x.now;
      if (!b) {
        const profile = (
          await c.query(
            "SELECT customer_id FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2 AND anonymized_at IS NULL FOR SHARE",
            [w, input.customer_id],
          )
        ).rows[0];
        if (!profile) fail(404, "NOT_FOUND");
        const start = instant(input.start);
        const slot = await this.slot(x, input.service_id, input.professional_id ?? null, start);
        const periods = await this.periods(x, x.now);
        deliver = nextReview(periods, x.now);
        const due = responseDeadline(periods, x.now);
        b = (
          await c.query(
            "INSERT INTO mawid_core.bookings(workspace_id,location_id,customer_id,service_id,requested_professional_id,requested_start,requested_end,submitted_at,response_due_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
            [
              w,
              l,
              input.customer_id,
              input.service_id,
              input.professional_id ?? null,
              iso(start),
              iso(slot.end),
              iso(x.now),
              iso(due),
            ],
          )
        ).rows[0];
      }
      const terminal = ["cancelled", "declined", "withdrawn", "expired"];
      if (terminal.includes(b.state)) fail(409, "INVALID_TRANSITION");
      let state = b.state,
        pro = b.assigned_professional_id,
        start = b.assigned_start ? +b.assigned_start : null,
        end = b.assigned_end ? +b.assigned_end : null,
        expires = b.offer_expires_at,
        allocation = null;
      if (action === "assign") {
        if (b.state !== "pending" || b.requested_professional_id) fail(409, "INVALID_TRANSITION");
        await this.slot(x, b.service_id, input.professional_id, +b.requested_start);
        pro = input.professional_id;
      } else if (["confirm", "propose", "walk-in"].includes(action)) {
        if (b.state !== "pending") fail(409, "INVALID_TRANSITION");
        pro =
          action === "propose"
            ? input.professional_id
            : (b.requested_professional_id ?? b.assigned_professional_id);
        if (!pro) fail(409, "ASSIGNMENT_REQUIRED");
        start = action === "propose" ? instant(input.start) : +b.requested_start;
        const slot = await this.slot(x, b.service_id, pro, start, b.booking_id);
        end = slot.end;
        allocation = slot;
        state = action === "propose" ? "proposed" : "confirmed";
        expires = state === "proposed" ? new Date(holdExpiry(x.now, start)) : null;
      } else if (action === "accept") {
        if (b.state !== "proposed") fail(409, "INVALID_TRANSITION");
        allocation = await this.slot(x, b.service_id, pro, start, b.booking_id);
        end = allocation.end;
        state = "confirmed";
        expires = null;
      } else if (action === "decline" || action === "withdraw") {
        if (!["pending", "proposed"].includes(b.state)) fail(409, "INVALID_TRANSITION");
        state = action === "decline" ? "declined" : "withdrawn";
      } else if (action === "cancel") {
        if (b.state !== "confirmed") fail(409, "INVALID_TRANSITION");
        if (own && !canSelfCancel(x.now, start)) fail(409, "CANCEL_CUTOFF");
        state = "cancelled";
      }
      if (!["request"].includes(action)) {
        b = (
          await c.query(
            "UPDATE mawid_core.bookings SET state=$4,version=version+$11,assigned_professional_id=$5,assigned_start=$6,assigned_end=$7,offer_expires_at=$8,cancelled_at=$9,cancellation_actor=$10 WHERE workspace_id=$1 AND location_id=$2 AND booking_id=$3 RETURNING *",
            [
              w,
              l,
              b.booking_id,
              state,
              pro,
              start ? iso(start) : null,
              end ? iso(end) : null,
              expires,
              state === "cancelled" ? iso(x.now) : null,
              state === "cancelled" ? (own ? "customer" : "salon") : null,
              action === "walk-in" ? 0 : 1,
            ],
          )
        ).rows[0];
        await c.query(
          "DELETE FROM mawid_core.allocations WHERE workspace_id=$1 AND location_id=$2 AND booking_id=$3",
          [w, l, b.booking_id],
        );
        if (allocation)
          await c.query(
            "INSERT INTO mawid_core.allocations(workspace_id,location_id,booking_id,professional_id,kind,period,expires_at) VALUES($1,$2,$3,$4,$5,tstzrange($6,$7,'[)'),$8)",
            [
              w,
              l,
              b.booking_id,
              pro,
              state === "proposed" ? "offer" : "confirmed",
              iso(allocation.from),
              iso(allocation.to),
              expires,
            ],
          );
      }
      await this.event(x, b, action, action === "request" ? deliver : x.now);
      const result = this.project(x, b);
      await c.query(
        "INSERT INTO mawid_core.operation_references(workspace_id,actor_id,operation_id,operation,input_hash) VALUES($1,$2,$3,$4,$5)",
        [w, actor, input.operation_id, action, hash],
      );
      await c.query(
        "INSERT INTO mawid_core.idempotency_records(workspace_id,actor_id,operation_id,outcome) VALUES($1,$2,$3,$4)",
        [w, actor, input.operation_id, result],
      );
      return result;
    });
  }
}
