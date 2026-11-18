import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { BookingError } from "../booking/service.mjs";
import { TokenVault, retryDelay, MAX_ATTEMPTS } from "./policy.mjs";
import { applicationAllows } from "./applications.mjs";
import { VerifiedDataService } from "../identity/verified-data.mjs";

const denied = () => {
  throw new BookingError(404, "NOT_FOUND");
};
const binding = (d) => [d.workspace_id, d.location_id, d.actor_id, d.destination_id].join(":");
const canRead = (access, b) =>
  access.roles.some((r) => ["admin", "manager"].includes(r)) ||
  access.customers.includes(b.customer_id) ||
  b.professional_ids.some((id) => access.professionals.includes(id));

const segmentProfessionals = (booking = "b") => `ARRAY(
  SELECT DISTINCT coalesce(s.assigned_professional_id,s.requested_professional_id)
  FROM mawid_core.visit_segments s
  WHERE (s.workspace_id,s.location_id,s.booking_id)=
    (${booking}.workspace_id,${booking}.location_id,${booking}.booking_id)
    AND coalesce(s.assigned_professional_id,s.requested_professional_id) IS NOT NULL
)`;

const fixtureAuthority = Symbol("local-notification-fixture");
export class Notifications {
  constructor(
    data,
    booking,
    config,
    {
      key,
      sender,
      now = Date.now,
      random = Math.random,
      environment = "development",
      applicationScopes,
    } = {},
    authority,
  ) {
    if (
      (authority !== fixtureAuthority && !(data instanceof VerifiedDataService)) ||
      !sender?.send ||
      !["development", "staging"].includes(environment)
    )
      throw Error("INVALID_NOTIFICATION_CONFIG");
    this.environment = environment;
    this.applicationScopes = applicationScopes;
    this.data = data;
    this.booking = booking;
    this.sender = sender;
    this.transport = sender.transport ?? "simulated";
    if (!["simulated", "fcm"].includes(this.transport))
      throw Error("INVALID_NOTIFICATION_TRANSPORT");
    this.now = now;
    this.random = random;
    this.vault = new TokenVault(key);
    this.pool = new Pool({
      ...config,
      max: 3,
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
      "SELECT rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication AS privileged,pg_has_role(current_user,'mawid_local_notify','MEMBER') AS worker,pg_has_role(current_user,'mawid_local_actor','MEMBER') OR pg_has_role(current_user,'mawid_local_booking','MEMBER') OR pg_has_role(current_user,'mawid_local_maintenance','MEMBER') AS actor FROM pg_roles WHERE rolname=session_user",
    );
    if (!r || r.privileged || !r.worker || r.actor) throw Error("UNSAFE_NOTIFICATION_WORKER");
  }
  async close() {
    await this.pool.end();
  }
  async transaction(fn, user) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      if (user !== undefined) await this.data.assertSession?.(user);
      const r = await fn(c);
      if (user !== undefined) await this.data.assertSession?.(user);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async access(c, actor, w, l) {
    const roles = (
      await c.query(
        "SELECT roles FROM mawid_core.memberships WHERE workspace_id=$1 AND actor_id=$2 AND revoked_at IS NULL AND (location_id IS NULL OR location_id=$3)",
        [w, actor, l],
      )
    ).rows.flatMap((x) => x.roles);
    const customers = (
      await c.query(
        "SELECT customer_id FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND actor_id=$2 AND anonymized_at IS NULL",
        [w, actor],
      )
    ).rows.map((x) => x.customer_id);
    const professionals = roles.includes("professional")
      ? (
          await c.query(
            "SELECT professional_id FROM mawid_core.professional_bindings WHERE workspace_id=$1 AND location_id=$2 AND actor_id=$3 AND revoked_at IS NULL",
            [w, l, actor],
          )
        ).rows.map((r) => r.professional_id)
      : [];
    return { roles, customers, professionals };
  }
  async actor(user) {
    return this.data.transaction(
      user,
      async (c) => (await c.query("SELECT mawid_core.actor() AS id")).rows[0].id,
    );
  }
  applicationAllowed(application, access, w, l, kind = "booking") {
    return (
      applicationAllows(application, access, kind) &&
      (!this.applicationScopes ||
        this.applicationScopes.some(
          (s) =>
            s.application_id === application &&
            s.workspace_id === w &&
            (s.location_id === null || s.location_id === l),
        ))
    );
  }
  async scope(c, actor, w, l) {
    const a = await this.access(c, actor, w, l);
    if (
      (!a.roles.length && !a.customers.length) ||
      !(
        await c.query(
          "SELECT 1 FROM mawid_core.locations WHERE workspace_id=$1 AND location_id=$2",
          [w, l],
        )
      ).rows.length
    )
      denied();
    return a;
  }
  async register(user, w, l, input) {
    const actor = await this.actor(user),
      digest = this.vault.digest(input.token);
    const identity = await this.data.notificationIdentity?.(user);
    return this.transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,8))", [digest]);
      await this.data.assertSession?.(user);
      const access = await this.scope(c, actor, w, l);
      if (!this.applicationAllowed(input.application_id, access, w, l)) denied();
      if (input.environment !== (this.environment ?? "development"))
        throw new BookingError(422, "VALIDATION_FAILED");
      // Possession of a token or guessed installation ID never changes its actor.
      if (
        (
          await c.query(
            "SELECT 1 FROM mawid_core.push_destinations WHERE token_digest=$1 AND (actor_id<>$2 OR application_id<>$3 OR environment<>$4) AND revoked_at IS NULL",
            [digest, actor, input.application_id, input.environment],
          )
        ).rows.length
      )
        throw new BookingError(409, "DESTINATION_IN_USE");
      const old = (
        await c.query(
          "SELECT destination_id FROM mawid_core.push_destinations WHERE workspace_id=$1 AND location_id=$2 AND actor_id=$3 AND installation_id=$4 AND application_id=$5 AND environment=$6 FOR UPDATE",
          [w, l, actor, input.installation_id, input.application_id, input.environment],
        )
      ).rows[0];
      const row = {
        workspace_id: w,
        location_id: l,
        actor_id: actor,
        destination_id: old?.destination_id ?? randomUUID(),
      };
      const ciphertext = this.vault.encrypt(input.token, binding(row));
      await c.query(
        `INSERT INTO mawid_core.push_destinations(destination_id,workspace_id,location_id,actor_id,installation_id,application_id,environment,locale,token_ciphertext,token_digest,identity_issuer,identity_subject,identity_session,identity_binding_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT(destination_id) DO UPDATE SET token_ciphertext=EXCLUDED.token_ciphertext,token_digest=EXCLUDED.token_digest,locale=EXCLUDED.locale,identity_issuer=EXCLUDED.identity_issuer,identity_subject=EXCLUDED.identity_subject,identity_session=EXCLUDED.identity_session,identity_binding_version=EXCLUDED.identity_binding_version,updated_at=clock_timestamp(),revoked_at=NULL,version=mawid_core.push_destinations.version+1`,
        [
          row.destination_id,
          w,
          l,
          actor,
          input.installation_id,
          input.application_id,
          input.environment,
          input.locale,
          ciphertext,
          digest,
          identity?.issuer ?? null,
          identity?.subject ?? null,
          identity?.sessionId ?? null,
          identity?.bindingVersion ?? null,
        ],
      );
      return { destination_id: row.destination_id, registered: true };
    }, user);
  }
  async unregister(
    user,
    w,
    l,
    installation,
    { application_id = "com.mawid.demo", environment = "development" } = {},
  ) {
    const actor = await this.actor(user);
    const identity = await this.data.notificationIdentity?.(user);
    await this.transaction(async (c) => {
      await c.query(
        "UPDATE mawid_core.push_destinations SET revoked_at=clock_timestamp(),token_ciphertext='',version=version+1 WHERE workspace_id=$1 AND location_id=$2 AND actor_id=$3 AND installation_id=$4 AND application_id=$5 AND environment=$6 AND ($7::uuid IS NULL OR identity_session=$7)",
        [w, l, actor, installation, application_id, environment, identity?.sessionId ?? null],
      );
    }, user);
    return { registered: false };
  }
  async inbox(user, w, l, visitContract = false) {
    const actor = await this.actor(user);
    return this.transaction(async (c) => {
      const a = await this.scope(c, actor, w, l);
      const rows = (
        await c.query(
          `SELECT n.notification_id,n.actor_id,n.kind,e.booking_id,e.version,b.state,
        n.opened_at,COALESCE(jsonb_agg(jsonb_build_object('status',d.status,'attempts',d.attempts,'error_code',d.safe_error_code,'transport',d.transport)) FILTER(WHERE d.delivery_id IS NOT NULL),'[]') AS pushes
        FROM mawid_core.notification_inbox n JOIN mawid_core.booking_events e USING(workspace_id,event_id)
        JOIN mawid_core.bookings b USING(workspace_id,location_id,booking_id)
        LEFT JOIN mawid_core.push_deliveries d USING(notification_id)
        WHERE n.workspace_id=$1 AND e.location_id=$2 AND (n.actor_id=$3 OR $4)
        AND ($5 OR b.customer_id=ANY($6::uuid[]) OR ${segmentProfessionals()} && $7::uuid[])
        AND (n.kind<>'pending_reminder' OR ($5 AND b.state='pending'))
        AND ($8 OR (b.segment_count=1 AND n.kind<>'review_invitation'))
        AND (n.kind<>'review_invitation' OR (n.actor_id=$3 AND b.customer_id=ANY($6::uuid[]) AND b.state='confirmed' AND e.version=b.version AND $9))
        GROUP BY n.notification_id,e.booking_id,e.version,b.state ORDER BY n.created_at DESC,n.notification_id LIMIT 50`,
          [
            w,
            l,
            actor,
            a.roles.some((r) => ["manager", "admin"].includes(r)),
            a.roles.some((r) => ["manager", "admin"].includes(r)),
            a.customers,
            a.professionals,
            visitContract,
            a.roles.length === 0,
          ],
        )
      ).rows;
      return {
        items: rows.map(({ actor_id, ...r }) => ({
          ...r,
          own: actor_id === actor,
          fallback: "in_app",
          provider_acceptance_is_device_delivery: false,
        })),
      };
    }, user);
  }
  async open(user, w, l, notification, visitContract = false) {
    const actor = await this.actor(user);
    const row = await this.transaction(async (c) => {
      const a = await this.scope(c, actor, w, l);
      const n = (
        await c.query(
          `SELECT n.actor_id,n.kind,e.booking_id,e.version,b.version AS current_version,b.customer_id,b.state,b.segment_count,
          ${segmentProfessionals()} AS professional_ids FROM mawid_core.notification_inbox n
        JOIN mawid_core.booking_events e USING(workspace_id,event_id) JOIN mawid_core.bookings b USING(workspace_id,location_id,booking_id)
        WHERE n.notification_id=$1 AND n.workspace_id=$2 AND e.location_id=$3`,
          [notification, w, l],
        )
      ).rows[0];
      if (!n || n.actor_id !== actor || !canRead(a, n)) denied();
      if (
        n.kind === "review_invitation" &&
        (n.state !== "confirmed" ||
          n.version !== n.current_version ||
          actor !== (await this.reviewRecipient(c, { ...n, workspace_id: w, location_id: l })))
      )
        denied();
      if (!visitContract && (n.segment_count !== 1 || n.kind === "review_invitation")) denied();
      if (
        n.kind === "pending_reminder" &&
        (n.state !== "pending" || !a.roles.some((role) => ["admin", "manager"].includes(role)))
      )
        denied();
      await c.query(
        "UPDATE mawid_core.notification_inbox SET opened_at=COALESCE(opened_at,clock_timestamp()) WHERE notification_id=$1",
        [notification],
      );
      return n;
    }, user);
    // Fresh server booking projection authorizes again, including expired offers.
    const projection = await (visitContract
      ? this.booking.visits.read(user, w, l, row.booking_id)
      : this.booking.read(user, w, l, row.booking_id));
    if (
      row.kind === "review_invitation" &&
      (projection.state !== "confirmed" || projection.version !== row.version)
    )
      denied();
    return { ...projection, notification_kind: row.kind, notification_id: notification };
  }
  async enqueue(c, e, actor, kind, stale = false) {
    const n = (
      await c.query(
        `INSERT INTO mawid_core.notification_inbox(workspace_id,event_id,actor_id,kind)
       VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,event_id,actor_id,kind)
       DO UPDATE SET event_id=EXCLUDED.event_id RETURNING notification_id`,
        [e.workspace_id, e.event_id, actor, kind],
      )
    ).rows[0];
    const access = await this.access(c, actor, e.workspace_id, e.location_id);
    const destinations = (
      await c.query(
        "SELECT destination_id,application_id FROM mawid_core.push_destinations WHERE workspace_id=$1 AND location_id=$2 AND actor_id=$3 AND revoked_at IS NULL AND updated_at>$4 AND environment=$5",
        [
          e.workspace_id,
          e.location_id,
          actor,
          new Date(this.now() - 90 * 86400000),
          this.environment ?? "development",
        ],
      )
    ).rows.filter((d) =>
      this.applicationAllowed(d.application_id, access, e.workspace_id, e.location_id, kind),
    );
    if (!destinations.length) destinations.push({ destination_id: null });
    for (const d of destinations)
      await c.query(
        "INSERT INTO mawid_core.push_deliveries(notification_id,destination_id,status,safe_error_code,next_attempt_at,transport) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(notification_id,destination_id) DO NOTHING",
        [
          n.notification_id,
          d.destination_id,
          stale ? "skipped" : d.destination_id ? "pending" : "no_destination",
          stale ? "SUPERSEDED" : d.destination_id ? null : "NO_DESTINATION",
          new Date(this.now()),
          this.transport,
        ],
      );
  }

  async materializeScheduled(limit = 20) {
    return this.transaction(async (c) => {
      const now = new Date(this.now());
      const { rows } = await c.query(
        `SELECT o.workspace_id,o.event_id,o.scheduled_kind,e.location_id,e.booking_id,e.version,
            b.customer_id,b.state,b.version AS current_version
         FROM mawid_core.outbox o JOIN mawid_core.booking_events e USING(workspace_id,event_id)
         JOIN mawid_core.bookings b USING(workspace_id,location_id,booking_id)
         WHERE o.scheduled_due_at<=$1 AND o.scheduled_processed_at IS NULL
         ORDER BY o.scheduled_due_at,o.workspace_id,o.event_id LIMIT $2 FOR UPDATE OF o SKIP LOCKED`,
        [now, limit],
      );
      for (const e of rows) {
        if (e.scheduled_kind === "pending_reminder" && e.state === "pending") {
          const recipients = (
            await c.query(
              `SELECT DISTINCT actor_id FROM mawid_core.memberships
             WHERE workspace_id=$1 AND (location_id IS NULL OR location_id=$2)
               AND revoked_at IS NULL AND roles && ARRAY['admin','manager']`,
              [e.workspace_id, e.location_id],
            )
          ).rows;
          for (const { actor_id } of recipients)
            await this.enqueue(c, e, actor_id, e.scheduled_kind);
        } else if (
          e.scheduled_kind === "review_invitation" &&
          e.state === "confirmed" &&
          e.version === e.current_version
        ) {
          const recipient = await this.reviewRecipient(c, e);
          if (recipient) await this.enqueue(c, e, recipient, e.scheduled_kind);
        }
        await c.query(
          "UPDATE mawid_core.outbox SET scheduled_processed_at=$3 WHERE workspace_id=$1 AND event_id=$2",
          [e.workspace_id, e.event_id, now],
        );
      }
    });
  }
  async reviewRecipient(c, e) {
    const { rows } = await c.query(
      `SELECT p.actor_id FROM mawid_core.customer_profiles p
       WHERE p.workspace_id=$1 AND p.customer_id=$3 AND p.anonymized_at IS NULL
       AND EXISTS(SELECT 1 FROM mawid_core.identity_bindings i
         WHERE i.actor_id=p.actor_id AND i.revoked_at IS NULL)
       AND NOT EXISTS(SELECT 1 FROM mawid_core.memberships m
         WHERE m.workspace_id=$1 AND m.actor_id=p.actor_id
         AND (m.location_id IS NULL OR m.location_id=$2) AND m.revoked_at IS NULL)`,
      [e.workspace_id, e.location_id, e.customer_id],
    );
    return rows[0]?.actor_id;
  }
  async materialize(limit = 20) {
    return this.transaction(async (c) => {
      const events = (
        await c.query(
          `SELECT o.workspace_id,o.event_id,e.location_id,e.booking_id,e.actor_id,e.action,e.version,b.customer_id,b.state,b.version AS current_version,${segmentProfessionals()} AS professional_ids
        FROM mawid_core.outbox o JOIN mawid_core.booking_events e USING(workspace_id,event_id) JOIN mawid_core.bookings b USING(workspace_id,location_id,booking_id)
        WHERE o.materialized_at IS NULL AND o.deliver_after<=$1 ORDER BY o.deliver_after,o.workspace_id,o.event_id LIMIT $2 FOR UPDATE OF o SKIP LOCKED`,
          [new Date(this.now()), limit],
        )
      ).rows;
      for (const e of events) {
        // Superseded requests never cause a stale initial staff push at opening.
        const stale = e.version !== e.current_version;
        const recipients = (
          await c.query(
            `SELECT DISTINCT actor_id FROM (
          SELECT actor_id FROM mawid_core.memberships WHERE workspace_id=$1 AND revoked_at IS NULL AND (location_id IS NULL OR location_id=$2) AND roles && ARRAY['admin','manager']
          UNION SELECT p.actor_id FROM mawid_core.professional_bindings p
            JOIN mawid_core.memberships m ON m.workspace_id=p.workspace_id AND m.actor_id=p.actor_id
            WHERE p.workspace_id=$1 AND p.location_id=$2 AND p.professional_id=ANY($6::uuid[]) AND p.revoked_at IS NULL
              AND m.revoked_at IS NULL AND (m.location_id IS NULL OR m.location_id=$2)
              AND 'professional'=ANY(m.roles) AND $4<>'request'
          UNION SELECT actor_id FROM mawid_core.customer_profiles WHERE workspace_id=$1 AND customer_id=$3 AND actor_id IS NOT NULL AND anonymized_at IS NULL AND $4<>'request'
        ) r WHERE actor_id<>$5`,
            [
              e.workspace_id,
              e.location_id,
              e.customer_id,
              e.action,
              e.actor_id,
              e.professional_ids,
            ],
          )
        ).rows;
        for (const { actor_id } of recipients) await this.enqueue(c, e, actor_id, "booking", stale);
        await c.query(
          "UPDATE mawid_core.outbox SET materialized_at=$3,status=$4,safe_error_code=$5 WHERE workspace_id=$1 AND event_id=$2",
          [
            e.workspace_id,
            e.event_id,
            new Date(this.now()),
            recipients.length ? "pending" : "skipped",
            recipients.length ? null : "NO_RECIPIENT",
          ],
        );
      }
      return events.length;
    });
  }
  async claim() {
    return this.transaction(async (c) => {
      await c.query(
        "UPDATE mawid_core.push_deliveries SET status='failed',safe_error_code='ATTEMPTS_EXHAUSTED',lease_id=NULL,lease_until=NULL WHERE status='sending' AND lease_until<=$1 AND attempts>=$2",
        [new Date(this.now()), MAX_ATTEMPTS],
      );
      const d = (
        await c.query(
          "SELECT delivery_id FROM mawid_core.push_deliveries WHERE attempts<$2 AND ((status='pending' AND next_attempt_at<=$1) OR (status='sending' AND lease_until<=$1)) ORDER BY next_attempt_at,delivery_id LIMIT 1 FOR UPDATE SKIP LOCKED",
          [new Date(this.now()), MAX_ATTEMPTS],
        )
      ).rows[0];
      if (!d) return null;
      return (
        await c.query(
          "UPDATE mawid_core.push_deliveries SET status='sending',attempts=attempts+1,lease_id=$2,lease_until=$3 WHERE delivery_id=$1 RETURNING *",
          [d.delivery_id, randomUUID(), new Date(this.now() + 60000)],
        )
      ).rows[0];
    });
  }
  async prepare(job) {
    return this.transaction(async (c) => {
      const row = (
        await c.query(
          `SELECT n.actor_id,n.notification_id,n.workspace_id,n.event_id,n.kind,e.location_id,e.version,e.action,b.customer_id,b.state,b.version AS current_version,${segmentProfessionals()} AS professional_ids,
        p.destination_id,p.application_id,p.environment,p.locale,p.token_ciphertext,p.version AS destination_version,p.revoked_at,p.updated_at,p.identity_issuer,p.identity_subject,p.identity_session,p.identity_binding_version
        FROM mawid_core.notification_inbox n JOIN mawid_core.booking_events e USING(workspace_id,event_id)
        JOIN mawid_core.bookings b USING(workspace_id,location_id,booking_id)
        LEFT JOIN mawid_core.push_destinations p ON p.destination_id=$2 AND p.actor_id=n.actor_id AND p.workspace_id=n.workspace_id AND p.location_id=e.location_id WHERE n.notification_id=$1`,
          [job.notification_id, job.destination_id],
        )
      ).rows[0];
      if (!row) return { skip: "NOT_FOUND" };
      if (
        this.data.notificationSessionActive &&
        !(await this.data.notificationSessionActive({
          issuer: row.identity_issuer,
          subject: row.identity_subject,
          sessionId: row.identity_session,
          principal: row.actor_id,
          bindingVersion: row.identity_binding_version,
        }))
      ) {
        await c.query(
          "UPDATE mawid_core.push_destinations SET revoked_at=clock_timestamp(),token_ciphertext='',version=version+1 WHERE destination_id=$1 AND version=$2",
          [row.destination_id, row.destination_version],
        );
        return { skip: "ACCESS_REVOKED" };
      }
      const a = await this.access(c, row.actor_id, row.workspace_id, row.location_id);
      if (
        !canRead(a, row) ||
        !row.destination_id ||
        row.revoked_at ||
        +row.updated_at < this.now() - 90 * 86400000
      )
        return { skip: "ACCESS_REVOKED" };
      if (row.action === "request" && !a.roles.some((r) => ["manager", "admin"].includes(r)))
        return { skip: "ACCESS_REVOKED" };
      if (
        row.kind === "review_invitation" &&
        (row.state !== "confirmed" || row.actor_id !== (await this.reviewRecipient(c, row)))
      )
        return { skip: "ACCESS_REVOKED" };
      if (
        row.kind === "pending_reminder"
          ? row.state !== "pending"
          : row.version !== row.current_version
      )
        return { skip: "SUPERSEDED" };
      if (
        !this.applicationAllowed(
          row.application_id,
          a,
          row.workspace_id,
          row.location_id,
          row.kind,
        ) ||
        row.environment !== (this.environment ?? "development")
      )
        return { skip: "ENVIRONMENT_MISMATCH" };
      return row;
    });
  }
  async finish(job, result, target) {
    return this.transaction(async (c) => {
      const active = (
        await c.query(
          "SELECT 1 FROM mawid_core.push_deliveries WHERE delivery_id=$1 AND lease_id=$2 AND status='sending' FOR UPDATE",
          [job.delivery_id, job.lease_id],
        )
      ).rows.length;
      if (!active) return false;
      let status = result.status,
        code = result.code ?? null;
      if (status === "invalid_token") {
        const invalid = await c.query(
          "UPDATE mawid_core.push_destinations SET revoked_at=$3,token_ciphertext='' WHERE destination_id=$1 AND version=$2",
          [target.destination_id, target.destination_version, new Date(this.now())],
        );
        status = invalid.rowCount ? "failed" : "retry";
        code = invalid.rowCount ? "INVALID_TOKEN" : "DESTINATION_REFRESHED";
      }
      if (status === "retry") status = job.attempts < MAX_ATTEMPTS ? "pending" : "failed";
      if (!["pending", "accepted", "failed", "skipped"].includes(status)) {
        status = "failed";
        code = "INVALID_SENDER_RESULT";
      }
      const safeCodes = [
        "INVALID_TOKEN",
        "DESTINATION_REFRESHED",
        "SUPERSEDED",
        "ACCESS_REVOKED",
        "ENVIRONMENT_MISMATCH",
        "NOT_FOUND",
        "TIMEOUT",
        "UNAVAILABLE",
        "QUOTA",
        "AUTHORIZATION",
        "PAYLOAD",
        "INVALID_SENDER_RESULT",
        "TRANSPORT",
        "TOKEN_KEY",
      ];
      code = code === null ? null : safeCodes.includes(code) ? code : "TRANSPORT";
      await c.query(
        "UPDATE mawid_core.push_deliveries SET status=$3,safe_error_code=$4,lease_id=NULL,lease_until=NULL,next_attempt_at=$5,accepted_at=CASE WHEN $3='accepted' THEN $6::timestamptz ELSE NULL END WHERE delivery_id=$1 AND lease_id=$2",
        [
          job.delivery_id,
          job.lease_id,
          status,
          code,
          new Date(this.now() + retryDelay(job.attempts, result.retryAfterMs, this.random)),
          new Date(this.now()),
        ],
      );
      return true;
    });
  }
  async reconcile() {
    await this.pool
      .query(`UPDATE mawid_core.outbox o SET status=s.status,safe_error_code=CASE WHEN s.status='failed' THEN 'PUSH_UNAVAILABLE_IN_APP_REMAINS' ELSE NULL END
      FROM (SELECT n.workspace_id,n.event_id,CASE
        WHEN bool_or(d.status IN ('pending','sending')) THEN 'pending'
        WHEN bool_or(d.status IN ('failed','no_destination')) THEN 'failed'
        WHEN bool_or(d.status='accepted') THEN 'accepted' ELSE 'skipped' END AS status
        FROM mawid_core.notification_inbox n JOIN mawid_core.push_deliveries d USING(notification_id)
        WHERE n.kind='booking' GROUP BY n.workspace_id,n.event_id) s
      WHERE o.workspace_id=s.workspace_id AND o.event_id=s.event_id`);
  }
  async runOnce() {
    await this.materialize();
    await this.materializeScheduled();
    let processed = 0;
    for (; processed < 5; processed++) {
      const job = await this.claim();
      if (!job) break;
      let target, result;
      try {
        if (job.transport !== this.transport) {
          await this.finish(job, { status: "failed", code: "TRANSPORT" });
          continue;
        }
        target = await this.prepare(job);
        if (target.skip) result = { status: "skipped", code: target.skip };
        else {
          let token;
          try {
            token = this.vault.decrypt(target.token_ciphertext, binding(target));
          } catch {
            result = { status: "failed", code: "TOKEN_KEY" };
          }
          if (!result) {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);
            try {
              result = await Promise.race([
                this.sender.send({
                  token,
                  notificationId: target.notification_id,
                  eventId: target.event_id,
                  deliveryId: job.delivery_id,
                  locale: target.locale,
                  applicationId: target.application_id,
                  environment: target.environment,
                  workspaceId: target.workspace_id,
                  locationId: target.location_id,
                  signal: controller.signal,
                }),
                new Promise((resolve) =>
                  controller.signal.addEventListener(
                    "abort",
                    () => resolve({ status: "retry", code: "TIMEOUT" }),
                    { once: true },
                  ),
                ),
              ]);
            } finally {
              clearTimeout(timeout);
            }
          }
        }
      } catch {
        result = { status: "retry", code: "TRANSPORT" };
      }
      await this.finish(job, result ?? { status: "failed", code: "INVALID_SENDER_RESULT" }, target);
    }
    await this.reconcile();
    return { processed };
  }
}

export class LocalNotifications extends Notifications {
  constructor(data, booking, config, options) {
    if (
      config?.host !== "127.0.0.1" ||
      config.user !== "mawid_fixture_notify" ||
      !/^mawid_local_data_[a-f0-9]+$/.test(config.database)
    )
      throw Error("INVALID_NOTIFICATION_CONFIG");
    super(data, booking, config, options, fixtureAuthority);
  }
}
