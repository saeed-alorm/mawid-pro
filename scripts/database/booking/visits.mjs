import { createHash } from "node:crypto";
import { instant, responseDeadline, nextReview, holdExpiry, canSelfCancel } from "./time.mjs";

const iso = (time) => new Date(time).toISOString();
const terminal = ["cancelled", "declined", "withdrawn", "expired"];
const partner = (x) => x.roles.some((role) => role === "admin" || role === "manager");
const key = (x, b) => [x.w, x.l, b.booking_id];
const scope = "workspace_id=$1 AND location_id=$2 AND booking_id=$3";
const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((name) => [name, sortKeys(value[name])]),
    );
  return value;
};
const segmentsFor = async (x, booking) =>
  (
    await x.c.query(
      `SELECT * FROM mawid_core.visit_segments WHERE ${scope} ORDER BY position`,
      key(x, booking),
    )
  ).rows;
const savedSpecs = (segments) =>
  segments.map((segment) => ({
    ...segment,
    duration: +segment.requested_end - +segment.requested_start,
  }));

const segmentProjection = (s) => ({
  position: s.position,
  service_id: s.service_id,
  requested_professional_id: s.requested_professional_id,
  assigned_professional_id: s.assigned_professional_id ?? null,
  requested_start: iso(s.requested_start),
  requested_end: iso(s.requested_end),
  assigned_start: s.assigned_start == null ? null : iso(s.assigned_start),
  assigned_end: s.assigned_end == null ? null : iso(s.assigned_end),
  buffer_before_seconds: Number(s.buffer_before_seconds),
  buffer_after_seconds: Number(s.buffer_after_seconds),
});
const previewSegments = (chain, assigned = false) =>
  chain.map((segment) =>
    segmentProjection({
      ...segment,
      requested_start: segment.start,
      requested_end: segment.end,
      assigned_professional_id: assigned ? segment.professional : null,
      assigned_start: assigned ? segment.start : null,
      assigned_end: assigned ? segment.end : null,
    }),
  );

export class VisitBookings {
  constructor(core, fail) {
    this.core = core;
    this.fail = fail;
  }

  async specs(x, segments) {
    const { rows } = await x.c.query(
      "SELECT service_id,duration_minutes,buffer_before,buffer_after FROM mawid_core.services WHERE workspace_id=$1 AND location_id=$2 AND service_id=ANY($3::uuid[])",
      [x.w, x.l, segments.map((s) => s.service_id)],
    );
    const services = new Map(rows.map((row) => [row.service_id, row]));
    return segments.map(({ service_id, professional_id }, index) => {
      const service = services.get(service_id);
      if (!service) this.fail(404, "NOT_FOUND");
      return {
        position: index + 1,
        service_id,
        requested_professional_id: professional_id ?? null,
        duration: service.duration_minutes * 60000,
        buffer_before_seconds: service.buffer_before * 60,
        buffer_after_seconds: service.buffer_after * 60,
      };
    });
  }

  async chain(x, specs, start, ignore = null, assignments = null, periods = null) {
    if (start <= x.now || start > x.now + 180 * 86400000) this.fail(422, "FUTURE_TIME_REQUIRED");
    const opening = periods ?? (await this.core.periods(x, start - 86400000));
    const candidates = new Map();
    let searched = 0;
    const eligibleAt = async (s, professional, from, to) => {
      if (!opening.some(([a, b]) => a <= from && b >= to)) return [];
      const cacheKey = [s.service_id, professional, from, to].join("/");
      if (!candidates.has(cacheKey)) {
        candidates.set(
          cacheKey,
          await this.core.availableProfessionals(x, s.service_id, professional, from, to, ignore),
        );
      }
      return candidates.get(cacheKey);
    };
    const search = async (path) => {
      if (++searched > 4096) this.fail(503, "RETRY_SAME_KEY");
      const index = path.length;
      if (index === specs.length) return path;
      const s = specs[index];
      const previous = path.at(-1);
      const before = Number(s.buffer_before_seconds) * 1000;
      const after = Number(s.buffer_after_seconds) * 1000;
      const desired = assignments?.[index] ?? s.requested_professional_id;
      const earliest = previous?.end ?? start;

      const windows = [
        { starts: earliest, professional: desired, excludes: previous?.professional },
      ];
      if (previous && (!desired || desired === previous.professional)) {
        windows.push({
          starts: earliest + Number(previous.buffer_after_seconds) * 1000 + before,
          professional: previous.professional,
        });
      }
      for (const window of windows) {
        const end = window.starts + s.duration;
        const from = window.starts - before;
        const to = end + after;
        for (const professional of await eligibleAt(s, window.professional, from, to)) {
          if (
            professional === window.excludes ||
            path.some((old) => old.professional === professional && old.from < to && from < old.to)
          )
            continue;
          const result = await search([
            ...path,
            { ...s, professional, start: window.starts, end, from, to },
          ]);
          if (result) return result;
        }
      }
      return null;
    };
    const result = await search([]);
    if (!result) this.fail(409, "SLOT_UNAVAILABLE");
    return result;
  }

  async availability(user, w, l, input, list = false) {
    return this.core.run(user, w, l, async (x) => {
      const specs = await this.specs(x, input.segments);
      if (!list) {
        const chain = await this.chain(x, specs, instant(input.start));
        return { available: true, contract_version: 2, segments: previewSegments(chain) };
      }
      return this.slots(x, specs);
    });
  }

  async slots(x, specs, { booking = null, assignments = null } = {}) {
    const periods = await this.core.periods(x, x.now - 86400000);
    const starts = new Set();
    const stop = x.now + 7 * 86400000;
    for (const [from, to] of periods) {
      if (from > stop) break;
      for (
        let time = Math.ceil(Math.max(from, x.now + 1) / 1800000) * 1800000;
        time < Math.min(to, stop);
        time += 1800000
      )
        starts.add(time);
    }
    const savedStart = +booking?.assigned_start;
    if (x.now < savedStart && savedStart <= x.now + 180 * 86400000) starts.add(savedStart);
    const items = [];
    for (const time of [...starts].sort((a, b) => a - b)) {
      try {
        const chain = await this.chain(x, specs, time, booking?.booking_id, assignments, periods);
        items.push({
          start: iso(time).replace(".000Z", "Z"),
          segments: previewSegments(chain, Boolean(booking)),
        });
      } catch (error) {
        if (error.apiCode !== "SLOT_UNAVAILABLE") throw error;
      }
    }
    return { contract_version: 2, items, timezone: "Asia/Beirut" };
  }

  async rescheduleSlots(user, w, l, id, input) {
    return this.core.run(user, w, l, async (x) => {
      const b = (await x.c.query(`SELECT * FROM mawid_core.bookings WHERE ${scope}`, [w, l, id]))
        .rows[0];
      if (!b) this.fail(404, "NOT_FOUND");
      const segments = await segmentsFor(x, b);
      this.project(x, b, segments);
      if (!partner(x)) this.fail(403, "ACTION_DENIED");
      if (String(b.version) !== input.expected_version) this.fail(409, "STALE_VERSION");
      if (b.state !== "confirmed") this.fail(409, "INVALID_TRANSITION");
      const assignments = this.assignments(segments, input.assignments, "reschedule");
      if (assignments.some((professional) => !professional)) this.fail(409, "ASSIGNMENT_REQUIRED");
      const slots = await this.slots(x, savedSpecs(segments), { booking: b, assignments });
      return { ...slots, booking_id: b.booking_id, version: String(b.version) };
    });
  }

  assignments(segments, positional, action) {
    if (positional && positional.length !== segments.length) this.fail(422, "ASSIGNMENT_COUNT");
    return segments.map((s, i) =>
      action === "accept"
        ? s.assigned_professional_id
        : (positional?.[i] ?? s.assigned_professional_id ?? s.requested_professional_id),
    );
  }

  project(x, b, segments) {
    if (!b) this.fail(404, "NOT_FOUND");
    if (!partner(x) && !x.customers.includes(b.customer_id)) {
      const own = segments.filter((s) =>
        x.professionals.includes(s.assigned_professional_id ?? s.requested_professional_id),
      );
      if (!own.length) this.fail(404, "NOT_FOUND");
      return {
        contract_version: 2,
        booking_id: b.booking_id,
        location_id: b.location_id,
        state: b.state,
        version: String(b.version),
        can_cancel: false,
        timezone: "Asia/Beirut",
        segments: own.map(segmentProjection),
      };
    }
    return {
      ...this.core.project(x, b),
      contract_version: 2,
      segments: segments.map(segmentProjection),
      ...(partner(x) && b.intake_source
        ? { intake_source: b.intake_source, entered_by: b.entered_by }
        : {}),
    };
  }

  async read(user, w, l, id) {
    return this.core.run(user, w, l, async (x) => {
      await this.core.expire(x);
      const b = (await x.c.query(`SELECT * FROM mawid_core.bookings WHERE ${scope}`, [w, l, id]))
        .rows[0];
      if (!b) this.fail(404, "NOT_FOUND");
      return this.project(x, b, await segmentsFor(x, b));
    });
  }

  async view(user, w, l, after) {
    return this.core.run(user, w, l, async (x) => {
      await this.core.expire(x);
      const base = await this.core.catalog(x);
      const { rows: ratings } = await x.c.query(
        `SELECT professional_id,round(avg(score),2)::float AS rating_average,count(*)::int AS rating_count
         FROM mawid_core.visit_reviews WHERE workspace_id=$1 AND location_id=$2 GROUP BY professional_id`,
        [w, l],
      );
      const ratingByProfessional = new Map(
        ratings.map((rating) => [rating.professional_id, rating]),
      );
      base.professionals = base.professionals.map((p) => ({
        ...p,
        rating_average: null,
        rating_count: 0,
        ...ratingByProfessional.get(p.professional_id),
      }));
      const { rows } = await x.c.query(
        `SELECT b.* FROM mawid_core.bookings b
         WHERE b.workspace_id=$1 AND b.location_id=$2 AND ($3::uuid IS NULL OR b.booking_id>$3)
           AND ($4::boolean OR b.customer_id=ANY($5::uuid[]) OR EXISTS(
             SELECT 1 FROM mawid_core.visit_segments s
             WHERE (s.workspace_id,s.location_id,s.booking_id)=(b.workspace_id,b.location_id,b.booking_id)
             AND coalesce(s.assigned_professional_id,s.requested_professional_id)=ANY($6::uuid[])
           )) ORDER BY b.booking_id LIMIT 51`,
        [w, l, after, partner(x), x.customers, x.professionals],
      );
      const bookings = [];
      for (const b of rows.slice(0, 50)) bookings.push(this.project(x, b, await segmentsFor(x, b)));
      return {
        ...base,
        contract_version: 2,
        bookings,
        next_after: rows.length > 50 ? rows[49].booking_id : null,
      };
    });
  }

  async lookupCallers(user, w, l, query) {
    return this.core.run(user, w, l, async (x) => {
      if (!partner(x)) this.fail(403, "ACTION_DENIED");
      const phone = query.replace(/\D/g, "");
      const { rows } = await x.c.query(
        `SELECT p.customer_id,p.display_name,
           CASE WHEN p.contact ~ '^\\+?[0-9 ()-]+$' THEN p.contact ELSE NULL END AS phone
         FROM mawid_core.customer_profiles p WHERE p.workspace_id=$1 AND p.anonymized_at IS NULL
         AND EXISTS(SELECT 1 FROM mawid_core.bookings b WHERE b.workspace_id=$1 AND b.location_id=$2
           AND b.customer_id=p.customer_id)
         AND (strpos(lower(p.display_name),lower($3))>0
           OR (length($4)>=4 AND p.contact ~ '^\\+?[0-9 ()-]+$'
             AND strpos(regexp_replace(p.contact,'[^0-9]','','g'),$4)>0))
         ORDER BY p.display_name,p.customer_id LIMIT 20`,
        [w, l, query, phone],
      );
      return { items: rows };
    });
  }

  async review(user, w, l, bookingId, input = null, feedback = false) {
    return this.core.run(user, w, l, async (x) => {
      const b = (
        await x.c.query(`SELECT * FROM mawid_core.bookings WHERE ${scope} FOR UPDATE`, [
          w,
          l,
          bookingId,
        ])
      ).rows[0];
      if (!b) this.fail(404, "NOT_FOUND");
      const existing = async () =>
        (
          await x.c.query(
            `SELECT professional_id,score,feedback FROM mawid_core.visit_reviews WHERE ${scope} ORDER BY professional_id`,
            [w, l, bookingId],
          )
        ).rows;
      if (feedback) {
        if (!partner(x)) this.fail(404, "NOT_FOUND");
        return { reviews: await existing() };
      }
      if (!x.verified || x.roles.length || !x.customers.includes(b.customer_id))
        this.fail(404, "NOT_FOUND");
      if (b.state !== "confirmed" || x.now < +b.assigned_end + 120000)
        this.fail(409, "REVIEW_UNAVAILABLE");
      const professionalIds = [
        ...new Set((await segmentsFor(x, b)).map((s) => s.assigned_professional_id)),
      ].sort();
      const stored = await existing();
      if (!input) return { professional_ids: professionalIds, submitted: stored.length > 0 };
      const reviews = input.reviews
        .map((r) => ({ ...r, feedback: r.feedback ?? null }))
        .sort((a, b) => a.professional_id.localeCompare(b.professional_id));
      if (
        professionalIds.length !== reviews.length ||
        professionalIds.some((id, index) => id !== reviews[index].professional_id)
      )
        this.fail(422, "REVIEW_PROFESSIONALS");
      const attempt = [w, x.actor, input.operation_id];
      const hash = createHash("sha256")
        .update(JSON.stringify(sortKeys({ bookingId, l, reviews })))
        .digest("hex");
      const old = (
        await x.c.query(
          "SELECT input_hash FROM mawid_core.operation_references WHERE workspace_id=$1 AND actor_id=$2 AND operation_id=$3",
          attempt,
        )
      ).rows[0];
      if (old && old.input_hash !== hash) this.fail(409, "IDEMPOTENCY_CONFLICT");
      if (old && stored.length) return { submitted: true };
      if (stored.length) this.fail(409, "REVIEW_ALREADY_SUBMITTED");
      for (const r of reviews)
        await x.c.query(
          `INSERT INTO mawid_core.visit_reviews(workspace_id,location_id,booking_id,professional_id,score,feedback)
         VALUES($1,$2,$3,$4,$5,$6)`,
          [w, l, bookingId, r.professional_id, r.score, r.feedback],
        );
      await x.c.query(
        "INSERT INTO mawid_core.operation_references(workspace_id,actor_id,operation_id,operation,input_hash) VALUES($1,$2,$3,'review',$4)",
        [...attempt, hash],
      );
      return { submitted: true };
    });
  }

  async mutate(user, w, l, action, input, id = null) {
    return this.core.run(user, w, l, async (x) => {
      const { c, actor, now } = x;
      let b = id
        ? (await c.query(`SELECT * FROM mawid_core.bookings WHERE ${scope} FOR UPDATE`, [w, l, id]))
            .rows[0]
        : null;
      if (id && !b) this.fail(404, "NOT_FOUND");
      let segments = b ? await segmentsFor(x, b) : [];
      if (b) this.project(x, b, segments);
      const own = x.customers.includes(b?.customer_id ?? input.customer_id);
      if (
        ["request", "accept", "withdraw"].includes(action)
          ? !own
          : !(partner(x) || (action === "cancel" && own))
      )
        this.fail(403, "ACTION_DENIED");

      const hash = createHash("sha256")
        .update(
          JSON.stringify(
            sortKeys({
              contract: 2,
              location_id: l,
              id,
              action,
              input,
            }),
          ),
        )
        .digest("hex");
      const identity = [w, actor, input.operation_id];
      const old = (
        await c.query(
          `SELECT r.input_hash,i.outcome FROM mawid_core.operation_references r
         LEFT JOIN mawid_core.idempotency_records i ON (i.workspace_id,i.actor_id,i.operation_id)=
          (r.workspace_id,r.actor_id,r.operation_id) AND i.created_at>clock_timestamp()-interval '7 days'
         WHERE r.workspace_id=$1 AND r.actor_id=$2 AND r.operation_id=$3`,
          identity,
        )
      ).rows[0];
      if (old) {
        if (old.input_hash !== hash) this.fail(409, "IDEMPOTENCY_CONFLICT");
        if (!old.outcome) this.fail(409, "OPERATION_RETIRED");
        if (!partner(x)) {
          delete old.outcome.response_due_at;
          delete old.outcome.overdue;
        }
        return old.outcome;
      }

      await this.core.expire(x);
      if (b?.state === "proposed" && +b.offer_expires_at <= now)
        return { error: { code: "OFFER_EXPIRED" }, status: 409 };
      if (b?.state === "expired" && action === "accept") this.fail(409, "OFFER_EXPIRED");
      if (b && String(b.version) !== input.expected_version) this.fail(409, "STALE_VERSION");
      if (b && terminal.includes(b.state)) this.fail(409, "INVALID_TRANSITION");
      let deliver = now;
      const creating = !b;
      if (creating) {
        let customerId = input.customer_id;
        if (input.caller) {
          const phone = input.caller.phone?.replace(/[ ()-]/g, "") ?? null;
          if (phone && !/^\+?[0-9]{4,15}$/.test(phone)) this.fail(422, "INVALID_PHONE");
          customerId = (
            await c.query(
              `INSERT INTO mawid_core.customer_profiles(workspace_id,external_key,display_name,contact)
             VALUES($1,$2,$3,$4) RETURNING customer_id`,
              [w, "caller:" + actor + ":" + input.operation_id, input.caller.name, phone],
            )
          ).rows[0].customer_id;
        } else if (input.source) {
          const linked = (
            await c.query(
              "SELECT 1 FROM mawid_core.bookings WHERE workspace_id=$1 AND location_id=$2 AND customer_id=$3 LIMIT 1",
              [w, l, customerId],
            )
          ).rowCount;
          if (!linked) this.fail(404, "NOT_FOUND");
        }
        const profile = (
          await c.query(
            "SELECT customer_id FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$2 AND anonymized_at IS NULL FOR SHARE",
            [w, customerId],
          )
        ).rows[0];
        if (!profile) this.fail(404, "NOT_FOUND");
        const requestedStart = instant(input.start);
        const requested = await this.chain(x, await this.specs(x, input.segments), requestedStart);
        const openings = await this.core.periods(x, now);
        deliver = nextReview(openings, now);
        b = (
          await c.query(
            `INSERT INTO mawid_core.bookings(workspace_id,location_id,customer_id,service_id,
            requested_professional_id,requested_start,requested_end,submitted_at,response_due_at,segment_count,intake_source,entered_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [
              w,
              l,
              profile.customer_id,
              requested[0].service_id,
              requested[0].requested_professional_id,
              iso(requestedStart),
              iso(requested.at(-1).end),
              iso(now),
              iso(responseDeadline(openings, now)),
              requested.length,
              input.source ?? null,
              input.source ? actor : null,
            ],
          )
        ).rows[0];
        for (const s of requested) {
          await c.query(
            `INSERT INTO mawid_core.visit_segments(workspace_id,location_id,booking_id,position,service_id,
              requested_professional_id,requested_start,requested_end,buffer_before_seconds,buffer_after_seconds)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,
            [
              ...key(x, b),
              s.position,
              s.service_id,
              s.requested_professional_id,
              iso(s.start),
              iso(s.end),
              s.buffer_before_seconds,
              s.buffer_after_seconds,
            ],
          );
        }
        segments = await segmentsFor(x, b);
      }

      let state = b.state;
      let chain;
      let expires = b.offer_expires_at;
      const alternative = action === "propose" || action === "reschedule";
      const assignment = this.assignments(segments, input.assignments, action);
      if (["assign", "confirm", "propose", "reschedule", "accept", "walk-in"].includes(action)) {
        const required =
          action === "reschedule" ? "confirmed" : action === "accept" ? "proposed" : "pending";
        if (b.state !== required) this.fail(409, "INVALID_TRANSITION");
        if (assignment.some((professional) => !professional)) this.fail(409, "ASSIGNMENT_REQUIRED");
        if (
          !alternative &&
          action !== "accept" &&
          segments.some(
            (s, i) => s.requested_professional_id && s.requested_professional_id !== assignment[i],
          )
        )
          this.fail(409, "PREFERENCE_REQUIRES_PROPOSAL");
        const start = alternative
          ? instant(input.start)
          : action === "accept"
            ? +b.assigned_start
            : +b.requested_start;
        chain = await this.chain(x, savedSpecs(segments), start, b.booking_id, assignment);
        if (
          action === "accept" &&
          chain.some(
            (s, i) =>
              s.start !== +segments[i].assigned_start || s.end !== +segments[i].assigned_end,
          )
        )
          this.fail(409, "SLOT_UNAVAILABLE");
        if (
          action === "confirm" &&
          chain.some(
            (s, i) =>
              s.start !== +segments[i].requested_start || s.end !== +segments[i].requested_end,
          )
        )
          this.fail(409, "TIMING_REQUIRES_PROPOSAL");
        state = action === "propose" ? "proposed" : action === "assign" ? "pending" : "confirmed";
        expires = state === "proposed" ? new Date(holdExpiry(now, start)) : null;
      } else if (action === "decline" || action === "withdraw") {
        if (!["pending", "proposed"].includes(b.state)) this.fail(409, "INVALID_TRANSITION");
        state = action === "decline" ? "declined" : "withdrawn";
      } else if (action === "cancel") {
        if (b.state !== "confirmed") this.fail(409, "INVALID_TRANSITION");
        if (own && !canSelfCancel(now, +b.assigned_start)) this.fail(409, "CANCEL_CUTOFF");
        state = "cancelled";
      }
      if (action !== "request") {
        const schedule = chain && action !== "assign";
        b = (
          await c.query(
            `UPDATE mawid_core.bookings SET state=$4,version=version+$5,assigned_professional_id=$6,
            assigned_start=$7,assigned_end=$8,offer_expires_at=$9,cancelled_at=$10,cancellation_actor=$11
            WHERE ${scope} RETURNING *`,
            [
              ...key(x, b),
              state,
              creating ? 0 : 1,
              chain?.[0].professional ?? b.assigned_professional_id,
              schedule ? iso(chain[0].start) : b.assigned_start,
              schedule ? iso(chain.at(-1).end) : b.assigned_end,
              expires,
              state === "cancelled" ? iso(now) : null,
              state === "cancelled" ? (own ? "customer" : "salon") : null,
            ],
          )
        ).rows[0];
        await c.query(`DELETE FROM mawid_core.allocations WHERE ${scope}`, key(x, b));
        for (const s of chain ?? []) {
          await c.query(
            `UPDATE mawid_core.visit_segments SET assigned_professional_id=$5,assigned_start=$6,assigned_end=$7
             WHERE ${scope} AND position=$4`,
            [
              ...key(x, b),
              s.position,
              s.professional,
              schedule ? iso(s.start) : null,
              schedule ? iso(s.end) : null,
            ],
          );
          if (schedule)
            await c.query(
              `INSERT INTO mawid_core.allocations(workspace_id,location_id,booking_id,segment_position,
              professional_id,kind,period,expires_at)
             VALUES($1,$2,$3,$4,$5,$6,tstzrange($7,$8,'[)'),$9)`,
              [
                ...key(x, b),
                s.position,
                s.professional,
                state === "proposed" ? "offer" : "confirmed",
                iso(s.from),
                iso(s.to),
                expires,
              ],
            );
        }
      }
      await this.core.event(x, b, action, action === "request" ? deliver : now, true);
      const result = this.project(x, b, await segmentsFor(x, b));
      await c.query(
        "INSERT INTO mawid_core.operation_references(workspace_id,actor_id,operation_id,operation,input_hash) VALUES($1,$2,$3,$4,$5)",
        [...identity, action, hash],
      );
      await c.query(
        "INSERT INTO mawid_core.idempotency_records(workspace_id,actor_id,operation_id,outcome) VALUES($1,$2,$3,$4)",
        [...identity, result],
      );
      return result;
    });
  }
}
