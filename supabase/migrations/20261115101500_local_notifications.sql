-- Local fictional server only. HTTP actors never receive this worker role.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mawid_local_notify') THEN
  CREATE ROLE mawid_local_notify NOLOGIN;
 ELSIF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='mawid_local_notify' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication)) THEN
  RAISE EXCEPTION 'UNSAFE_NOTIFICATION_GROUP';
 END IF;
END $$;
ALTER TABLE mawid_core.outbox DROP CONSTRAINT outbox_status_check;
UPDATE mawid_core.outbox SET status='accepted' WHERE status='delivered';
ALTER TABLE mawid_core.outbox ADD CONSTRAINT outbox_status_check CHECK(status IN ('pending','accepted','failed','skipped'));
ALTER TABLE mawid_core.outbox ADD COLUMN materialized_at timestamptz;
CREATE INDEX notification_outbox_due ON mawid_core.outbox(deliver_after,workspace_id,event_id) WHERE materialized_at IS NULL;

CREATE TABLE mawid_core.push_destinations (
 destination_id uuid PRIMARY KEY, workspace_id uuid NOT NULL, location_id uuid NOT NULL,
 actor_id uuid NOT NULL, installation_id uuid NOT NULL,
 application_id text NOT NULL CHECK(application_id='com.mawid.demo'),
 environment text NOT NULL CHECK(environment='development'), locale text NOT NULL CHECK(locale IN ('en','ar')),
 token_ciphertext text NOT NULL, token_digest text NOT NULL CHECK(length(token_digest)=64),
 version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 UNIQUE(workspace_id,location_id,actor_id,installation_id,application_id,environment),
 FOREIGN KEY(workspace_id,location_id) REFERENCES mawid_core.locations
);
CREATE INDEX push_destination_recipient ON mawid_core.push_destinations(workspace_id,location_id,actor_id) WHERE revoked_at IS NULL;
CREATE INDEX push_destination_token ON mawid_core.push_destinations(token_digest) WHERE revoked_at IS NULL;

CREATE TABLE mawid_core.notification_inbox (
 notification_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 event_id uuid NOT NULL, actor_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 opened_at timestamptz, UNIQUE(workspace_id,event_id,actor_id),
 FOREIGN KEY(workspace_id,event_id) REFERENCES mawid_core.outbox ON DELETE CASCADE
);
CREATE INDEX notification_inbox_actor ON mawid_core.notification_inbox(actor_id,workspace_id,created_at DESC);
CREATE TABLE mawid_core.push_deliveries (
 delivery_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id uuid NOT NULL REFERENCES mawid_core.notification_inbox ON DELETE CASCADE,
 transport text NOT NULL CHECK(transport IN ('simulated','fcm')),
 destination_id uuid REFERENCES mawid_core.push_destinations ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','failed','skipped','no_destination')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_id uuid, lease_until timestamptz,
 safe_error_code text, accepted_at timestamptz,
 UNIQUE NULLS NOT DISTINCT(notification_id,destination_id)
);
CREATE INDEX push_delivery_due ON mawid_core.push_deliveries(next_attempt_at,delivery_id) WHERE status IN ('pending','sending');

GRANT USAGE ON SCHEMA mawid_core TO mawid_local_notify;
GRANT SELECT ON mawid_core.organizations,mawid_core.locations,mawid_core.memberships,mawid_core.customer_profiles,mawid_core.bookings,mawid_core.booking_events TO mawid_local_notify;
GRANT SELECT,UPDATE ON mawid_core.outbox TO mawid_local_notify;
GRANT SELECT,INSERT,UPDATE,DELETE ON mawid_core.push_destinations,mawid_core.notification_inbox,mawid_core.push_deliveries TO mawid_local_notify;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['organizations','locations','memberships','customer_profiles','bookings','booking_events','outbox'] LOOP
  EXECUTE format('CREATE POLICY local_notification_worker ON mawid_core.%I TO mawid_local_notify USING(true) WITH CHECK(true)',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['push_destinations','notification_inbox','push_deliveries'] LOOP
  EXECUTE format('ALTER TABLE mawid_core.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE mawid_core.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY local_notification_worker ON mawid_core.%I TO mawid_local_notify USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
