-- Local worker prerequisite: a separately bootstrapped NOLOGIN mawid_local_maintenance
-- group. No role, hosted configuration, extension or API exposure is created here.
ALTER TABLE mawid_core.import_jobs ADD COLUMN has_staged_rows boolean
  GENERATED ALWAYS AS (staged_rows IS NOT NULL) STORED;

CREATE TABLE mawid_core.maintenance_runs (
  run_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  status text NOT NULL CHECK (status IN ('succeeded','failed')),
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text CHECK (error_code ~ '^[A-Z0-9_]{1,40}$')
);
CREATE TABLE mawid_core.erasure_requests (
  workspace_id uuid NOT NULL REFERENCES mawid_core.organizations,
  customer_id uuid NOT NULL,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','needs_review','completed','not_found')),
  PRIMARY KEY (workspace_id,customer_id),
  UNIQUE (request_id)
);
ALTER TABLE mawid_core.maintenance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.maintenance_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.erasure_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mawid_core.erasure_requests FORCE ROW LEVEL SECURITY;
CREATE INDEX erasure_pending ON mawid_core.erasure_requests(workspace_id,customer_id)
  WHERE status='pending';

-- Apply actor policies only to the actor privilege group, not unrelated workers.
DO $$ DECLARE p record; BEGIN
  FOR p IN SELECT c.relname,pol.polname FROM pg_policy pol
    JOIN pg_class c ON c.oid=pol.polrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='mawid_core' AND pol.polroles=ARRAY[0::oid]
  LOOP
    EXECUTE format('ALTER POLICY %I ON mawid_core.%I TO mawid_local_actor',p.polname,p.relname);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION mawid_core.anonymize_customer(w uuid,c uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE erased timestamptz;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM mawid_core.customer_profiles WHERE workspace_id=w AND customer_id=c) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  IF EXISTS(SELECT 1 FROM mawid_core.legal_preservation
    WHERE workspace_id=w AND customer_id=c AND preserve_until>clock_timestamp()) THEN
    RAISE EXCEPTION 'PRESERVATION_REVIEW_REQUIRED';
  END IF;
  INSERT INTO mawid_core.deletion_ledger(workspace_id,customer_id)
    VALUES(w,c) ON CONFLICT(workspace_id,customer_id) DO NOTHING;
  SELECT erased_at INTO erased FROM mawid_core.deletion_ledger
    WHERE workspace_id=w AND customer_id=c;
  UPDATE mawid_core.customer_profiles
    SET display_name='Deleted customer',contact=NULL,actor_id=NULL,
        external_key='erased:'||customer_id::text,anonymized_at=erased
    WHERE workspace_id=w AND customer_id=c
      AND (contact IS NOT NULL OR actor_id IS NOT NULL
        OR display_name IS DISTINCT FROM 'Deleted customer'
        OR external_key IS DISTINCT FROM 'erased:'||customer_id::text
        OR anonymized_at IS DISTINCT FROM erased);
END $$;

CREATE OR REPLACE FUNCTION mawid_core.reconcile_deletions()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  UPDATE mawid_core.customer_profiles p
    SET display_name='Deleted customer',contact=NULL,actor_id=NULL,
        external_key='erased:'||p.customer_id::text,anonymized_at=d.erased_at
    FROM mawid_core.deletion_ledger d
    WHERE p.workspace_id=d.workspace_id AND p.customer_id=d.customer_id
      AND (p.contact IS NOT NULL OR p.actor_id IS NOT NULL
        OR p.display_name IS DISTINCT FROM 'Deleted customer'
        OR p.external_key IS DISTINCT FROM 'erased:'||p.customer_id::text
        OR p.anonymized_at IS DISTINCT FROM d.erased_at);
END $$;

CREATE FUNCTION mawid_core.queue_erasure(w uuid,c uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM mawid_core.customer_profiles WHERE workspace_id=w AND customer_id=c) THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002';
  END IF;
  INSERT INTO mawid_core.erasure_requests(workspace_id,customer_id)
    VALUES(w,c) ON CONFLICT(workspace_id,customer_id) DO NOTHING;
  SELECT request_id INTO id FROM mawid_core.erasure_requests
    WHERE workspace_id=w AND customer_id=c;
  RETURN id;
END $$;

CREATE FUNCTION mawid_core.perform_local_maintenance() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog SET timezone='UTC' AS $$
DECLARE
  at_time timestamptz:=statement_timestamp();
  cutoff timestamptz:=at_time-interval '12 months';
  request record;
  erased integer:=0;
  held integer:=0;
  missing integer:=0;
  staging integer:=0;
  retries integer:=0;
  histories integer:=0;
  exports integer:=0;
BEGIN
  -- Existing erasure decisions win over data reintroduced by a restore.
  PERFORM mawid_core.reconcile_deletions();
  FOR request IN SELECT workspace_id,customer_id FROM mawid_core.erasure_requests
    WHERE status='pending' ORDER BY workspace_id,customer_id
    LIMIT 100 FOR UPDATE SKIP LOCKED
  LOOP
    IF EXISTS(SELECT 1 FROM mawid_core.legal_preservation
      WHERE workspace_id=request.workspace_id AND customer_id=request.customer_id
        AND preserve_until>at_time) THEN
      UPDATE mawid_core.erasure_requests SET status='needs_review'
        WHERE workspace_id=request.workspace_id AND customer_id=request.customer_id;
      held:=held+1;
    ELSIF NOT EXISTS(SELECT 1 FROM mawid_core.customer_profiles
      WHERE workspace_id=request.workspace_id AND customer_id=request.customer_id) THEN
      INSERT INTO mawid_core.deletion_ledger(workspace_id,customer_id)
        VALUES(request.workspace_id,request.customer_id)
        ON CONFLICT(workspace_id,customer_id) DO NOTHING;
      UPDATE mawid_core.erasure_requests SET status='not_found',completed_at=at_time
        WHERE workspace_id=request.workspace_id AND customer_id=request.customer_id;
      missing:=missing+1;
    ELSE
      PERFORM mawid_core.anonymize_customer(request.workspace_id,request.customer_id);
      UPDATE mawid_core.erasure_requests SET status='completed',completed_at=at_time
        WHERE workspace_id=request.workspace_id AND customer_id=request.customer_id;
      erased:=erased+1;
    END IF;
  END LOOP;

  -- Clear expired raw artifacts even if their status was already changed.
  UPDATE mawid_core.import_jobs SET staged_rows=NULL,
    status=CASE WHEN status='previewed' THEN 'expired' ELSE status END
    WHERE expires_at<=at_time AND (has_staged_rows OR status='previewed');
  GET DIAGNOSTICS staging=ROW_COUNT;
  DELETE FROM mawid_core.idempotency_records WHERE created_at<=at_time-interval '7 days';
  GET DIAGNOSTICS retries=ROW_COUNT;
  -- Stable operation references survive response-cache pruning.
  CREATE TEMP TABLE IF NOT EXISTS expired_booking_ids(
    workspace_id uuid,location_id uuid,booking_id uuid
  ) ON COMMIT DROP;
  TRUNCATE expired_booking_ids;
  INSERT INTO expired_booking_ids
    SELECT b.workspace_id,b.location_id,b.booking_id FROM mawid_core.bookings b
    WHERE greatest(b.requested_end,coalesce(b.assigned_end,b.requested_end),
      coalesce(b.cancelled_at,b.requested_end))<=cutoff
      AND NOT EXISTS(SELECT 1 FROM mawid_core.legal_preservation p
        WHERE p.workspace_id=b.workspace_id AND p.customer_id=b.customer_id
          AND p.preserve_until>at_time);
  DELETE FROM mawid_core.outbox o USING mawid_core.booking_events e,expired_booking_ids x
    WHERE o.workspace_id=e.workspace_id AND o.event_id=e.event_id
      AND e.workspace_id=x.workspace_id AND e.location_id=x.location_id AND e.booking_id=x.booking_id;
  DELETE FROM mawid_core.booking_events e USING expired_booking_ids x
    WHERE e.workspace_id=x.workspace_id AND e.location_id=x.location_id AND e.booking_id=x.booking_id;
  DELETE FROM mawid_core.allocations a USING expired_booking_ids x
    WHERE a.workspace_id=x.workspace_id AND a.location_id=x.location_id AND a.booking_id=x.booking_id;
  DELETE FROM mawid_core.bookings b USING expired_booking_ids x
    WHERE b.workspace_id=x.workspace_id AND b.location_id=x.location_id AND b.booking_id=x.booking_id;
  GET DIAGNOSTICS histories=ROW_COUNT;
  DELETE FROM mawid_core.export_jobs WHERE expires_at<=at_time;
  GET DIAGNOSTICS exports=ROW_COUNT;
  RETURN jsonb_build_object('erased',erased,'preservation_review',held,'missing',missing,
    'expired_imports',staging,'pruned_retries',retries,'deleted_histories',histories,'expired_exports',exports);
END $$;

CREATE OR REPLACE FUNCTION mawid_core.maintain_local_data() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN PERFORM mawid_core.perform_local_maintenance(); END $$;

GRANT USAGE ON SCHEMA mawid_core TO mawid_local_maintenance;
GRANT SELECT ON mawid_core.bookings,mawid_core.allocations,mawid_core.booking_events,
  mawid_core.outbox,mawid_core.export_jobs,mawid_core.deletion_ledger,
  mawid_core.erasure_requests,mawid_core.maintenance_runs TO mawid_local_maintenance;
GRANT SELECT(workspace_id,configuration_version),UPDATE(configuration_version)
  ON mawid_core.organizations TO mawid_local_maintenance;
GRANT SELECT(workspace_id,customer_id,display_name,contact,actor_id,external_key,anonymized_at),
  UPDATE(display_name,contact,actor_id,external_key,anonymized_at)
  ON mawid_core.customer_profiles TO mawid_local_maintenance;
GRANT SELECT(workspace_id,customer_id,preserve_until)
  ON mawid_core.legal_preservation TO mawid_local_maintenance;
GRANT SELECT(status,expires_at,has_staged_rows),UPDATE(status,staged_rows)
  ON mawid_core.import_jobs TO mawid_local_maintenance;
GRANT SELECT(created_at) ON mawid_core.idempotency_records TO mawid_local_maintenance;
GRANT DELETE ON mawid_core.bookings,mawid_core.allocations,mawid_core.booking_events,
  mawid_core.outbox,mawid_core.export_jobs,mawid_core.idempotency_records TO mawid_local_maintenance;
GRANT INSERT ON mawid_core.deletion_ledger,mawid_core.erasure_requests,
  mawid_core.maintenance_runs TO mawid_local_maintenance;
GRANT UPDATE(status,completed_at) ON mawid_core.erasure_requests TO mawid_local_maintenance;
GRANT EXECUTE ON FUNCTION mawid_core.queue_erasure(uuid,uuid),
  mawid_core.anonymize_customer(uuid,uuid),mawid_core.reconcile_deletions(),
  mawid_core.perform_local_maintenance(),mawid_core.maintain_local_data(),
  mawid_core.bump_configuration(),mawid_core.allocation_consistent() TO mawid_local_maintenance;

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['organizations','customer_profiles','legal_preservation',
    'import_jobs','idempotency_records','bookings','allocations','booking_events','outbox',
    'export_jobs','deletion_ledger','erasure_requests','maintenance_runs']
  LOOP
    EXECUTE format('CREATE POLICY maintenance_read ON mawid_core.%I FOR SELECT TO mawid_local_maintenance USING(true)',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['organizations','customer_profiles','import_jobs','erasure_requests']
  LOOP
    EXECUTE format('CREATE POLICY maintenance_update ON mawid_core.%I FOR UPDATE TO mawid_local_maintenance USING(true) WITH CHECK(true)',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['bookings','allocations','booking_events','outbox','export_jobs','idempotency_records']
  LOOP
    EXECUTE format('CREATE POLICY maintenance_delete ON mawid_core.%I FOR DELETE TO mawid_local_maintenance USING(true)',table_name);
  END LOOP;
  FOREACH table_name IN ARRAY ARRAY['deletion_ledger','erasure_requests','maintenance_runs']
  LOOP
    EXECUTE format('CREATE POLICY maintenance_insert ON mawid_core.%I FOR INSERT TO mawid_local_maintenance WITH CHECK(true)',table_name);
  END LOOP;
END $$;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mawid_core FROM PUBLIC;
