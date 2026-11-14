-- Maintenance functions are deliberately ungranted to actor roles. A future worker
-- needs its own reviewed privilege boundary and documented legal preservation.
CREATE FUNCTION mawid_core.validate_timezone() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=NEW.timezone AND name LIKE '%/%') THEN RAISE EXCEPTION 'INVALID_TIMEZONE'; END IF; RETURN NEW; END $$;
CREATE TRIGGER timezone_valid BEFORE INSERT OR UPDATE ON mawid_core.locations FOR EACH ROW EXECUTE FUNCTION mawid_core.validate_timezone();
CREATE FUNCTION mawid_core.allocation_consistent() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE w uuid; l uuid; b uuid; item mawid_core.bookings; n integer; BEGIN
 IF TG_OP='DELETE' THEN w:=OLD.workspace_id;l:=OLD.location_id; ELSE w:=NEW.workspace_id;l:=NEW.location_id; END IF;
 IF TG_TABLE_NAME='bookings' THEN IF TG_OP='DELETE' THEN b:=OLD.booking_id; ELSE b:=NEW.booking_id; END IF; ELSE IF TG_OP='DELETE' THEN b:=OLD.booking_id; ELSE b:=NEW.booking_id; END IF; END IF;
 SELECT * INTO item FROM mawid_core.bookings WHERE workspace_id=w AND location_id=l AND booking_id=b;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM mawid_core.allocations a WHERE a.workspace_id=w AND a.location_id=l AND a.booking_id=b;
 IF item.state IN ('confirmed','proposed') THEN
 IF n<>1 OR NOT EXISTS(SELECT 1 FROM mawid_core.allocations a WHERE a.workspace_id=w AND a.location_id=l AND a.booking_id=b AND a.professional_id=item.assigned_professional_id AND lower(a.period)<=item.assigned_start AND upper(a.period)>=item.assigned_end AND ((item.state='confirmed' AND a.kind='confirmed') OR (item.state='proposed' AND a.kind='offer' AND a.expires_at=item.offer_expires_at))) THEN RAISE EXCEPTION 'ALLOCATION_REQUIRED'; END IF;
 ELSIF n<>0 THEN RAISE EXCEPTION 'NON_RESERVING_STATE'; END IF; RETURN NULL; END $$;
CREATE CONSTRAINT TRIGGER booking_capacity AFTER INSERT OR UPDATE OR DELETE ON mawid_core.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mawid_core.allocation_consistent();
CREATE CONSTRAINT TRIGGER allocation_booking AFTER INSERT OR UPDATE OR DELETE ON mawid_core.allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION mawid_core.allocation_consistent();
CREATE FUNCTION mawid_core.anonymize_customer(w uuid,c uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM mawid_core.legal_preservation WHERE workspace_id=w AND customer_id=c AND preserve_until>clock_timestamp()) THEN RAISE EXCEPTION 'PRESERVATION_REVIEW_REQUIRED'; END IF;
 UPDATE mawid_core.customer_profiles SET display_name='Deleted customer',contact=NULL,actor_id=NULL,external_key='erased:'||customer_id::text,anonymized_at=clock_timestamp() WHERE workspace_id=w AND customer_id=c;
 INSERT INTO mawid_core.deletion_ledger(workspace_id,customer_id) VALUES(w,c) ON CONFLICT(workspace_id,customer_id) DO NOTHING; END $$;
CREATE FUNCTION mawid_core.reconcile_deletions() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
 UPDATE mawid_core.customer_profiles p SET display_name='Deleted customer',contact=NULL,actor_id=NULL,external_key='erased:'||p.customer_id::text,anonymized_at=d.erased_at FROM mawid_core.deletion_ledger d WHERE p.workspace_id=d.workspace_id AND p.customer_id=d.customer_id; END $$;
CREATE TABLE mawid_core.legal_preservation (workspace_id uuid NOT NULL,customer_id uuid NOT NULL,documented_purpose text NOT NULL CHECK(length(btrim(documented_purpose))>0),preserve_until timestamptz NOT NULL,PRIMARY KEY(workspace_id,customer_id),FOREIGN KEY(workspace_id,customer_id) REFERENCES mawid_core.customer_profiles);
ALTER TABLE mawid_core.legal_preservation ENABLE ROW LEVEL SECURITY; ALTER TABLE mawid_core.legal_preservation FORCE ROW LEVEL SECURITY;
-- Erasure requests with an active documented exception require manual reconciliation.
CREATE FUNCTION mawid_core.maintain_local_data() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE cutoff timestamptz:=clock_timestamp()-interval '12 months'; BEGIN
 UPDATE mawid_core.import_jobs SET staged_rows=NULL,status='expired' WHERE status='previewed' AND expires_at<=clock_timestamp();
 DELETE FROM mawid_core.idempotency_records WHERE created_at<=clock_timestamp()-interval '7 days';
 -- operation_references survive pruning: an old intent must not become a new mutation.
 CREATE TEMP TABLE IF NOT EXISTS expired_booking_ids(workspace_id uuid,location_id uuid,booking_id uuid) ON COMMIT DROP;
 TRUNCATE expired_booking_ids;
 INSERT INTO expired_booking_ids SELECT b.workspace_id,b.location_id,b.booking_id FROM mawid_core.bookings b WHERE greatest(b.requested_end,coalesce(b.assigned_end,b.requested_end),coalesce(b.cancelled_at,b.requested_end))<=cutoff AND NOT EXISTS(SELECT 1 FROM mawid_core.legal_preservation p WHERE p.workspace_id=b.workspace_id AND p.customer_id=b.customer_id AND p.preserve_until>clock_timestamp());
 DELETE FROM mawid_core.outbox o USING mawid_core.booking_events e,expired_booking_ids x WHERE o.workspace_id=e.workspace_id AND o.event_id=e.event_id AND e.workspace_id=x.workspace_id AND e.location_id=x.location_id AND e.booking_id=x.booking_id;
 DELETE FROM mawid_core.booking_events e USING expired_booking_ids x WHERE e.workspace_id=x.workspace_id AND e.location_id=x.location_id AND e.booking_id=x.booking_id;
 DELETE FROM mawid_core.allocations a USING expired_booking_ids x WHERE a.workspace_id=x.workspace_id AND a.location_id=x.location_id AND a.booking_id=x.booking_id;
 DELETE FROM mawid_core.bookings b USING expired_booking_ids x WHERE b.workspace_id=x.workspace_id AND b.location_id=x.location_id AND b.booking_id=x.booking_id;
 DELETE FROM mawid_core.export_jobs WHERE expires_at<=clock_timestamp(); END $$;
CREATE FUNCTION mawid_core.cancellation_count(w uuid,c uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $$ SELECT count(*) FROM mawid_core.bookings WHERE workspace_id=w AND customer_id=c AND state='cancelled' AND cancellation_actor='customer' AND cancelled_at>statement_timestamp()-interval '90 days' AND cancelled_at<=statement_timestamp() AND mawid_core.has_role(w,location_id,ARRAY['admin','manager']) $$;
GRANT EXECUTE ON FUNCTION mawid_core.cancellation_count(uuid,uuid) TO mawid_local_actor;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA mawid_core FROM PUBLIC;
